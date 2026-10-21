"""
PyQGIS process lifecycle and GeoJSON<->QgsVectorLayer plumbing shared by
every gis_worker.py tool function. Split out from gis_worker.py so that
module stays focused on the approved-tool catalogue and the operations
themselves, not QGIS bootstrapping.

QgsApplication must be initialised exactly once per process (it's expensive
and QGIS doesn't support multiple instances) — ensure_qgis_initialized() is
idempotent and safe to call at the top of every tool function.
"""
from __future__ import annotations

import json
import tempfile
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, TypeVar

try:
    from qgis.core import (
        QgsApplication,
        QgsCoordinateReferenceSystem,
        QgsVectorFileWriter,
        QgsVectorLayer,
    )
    QGIS_AVAILABLE = True
except ImportError:
    QGIS_AVAILABLE = False

_qgs_app = None  # type: ignore[var-annotated]
_processing_initialized = False

# QGIS/Qt objects are thread-affine: QgsApplication must be initialised on,
# and every qgis.* call must happen on, the exact same OS thread for the
# whole process lifetime - never "whichever thread happened to pick up this
# request". FastAPI's threadpool for sync endpoints does NOT guarantee that
# (anyio reuses idle worker threads, so a single sequential request or two
# often land on the same one by chance - which is exactly how this first
# went unnoticed). Found the hard way: two QGIS-calling requests back to
# back through FastAPI's TestClient deadlocked once the second one landed
# on a different threadpool thread than the first had initialised
# QgsApplication on. Routing every QGIS-touching call through this single
# dedicated worker (jobs.py does this; see run_on_qgis_thread()) fixes it
# at the source rather than hoping the threadpool behaves.
_qgis_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="qgis-worker")
_T = TypeVar("_T")


def ensure_qgis_initialized() -> None:
    """Boots a headless QgsApplication and the Processing framework, once.
    Safe to call at the top of every tool function — a no-op after the
    first call. Raises RuntimeError with a clear message (not an opaque
    QGIS error) if qgis.* isn't importable in this process at all."""
    global _qgs_app, _processing_initialized

    if not QGIS_AVAILABLE:
        raise RuntimeError(
            "qgis.core is not importable in this Python process — this needs "
            "the groundpatch-gis conda environment (see environment-qgis.yml), "
            "not the plain requirements.txt one."
        )

    if _qgs_app is None:
        _qgs_app = QgsApplication([], False)
        _qgs_app.initQgis()

    if not _processing_initialized:
        # Imported here, not at module level - importing `processing` before
        # QgsApplication.initQgis() has run can fail, since it registers
        # algorithms against a running QGIS instance.
        import processing  # noqa: F401  (import registers the processing:: prefix)
        from processing.core.Processing import Processing
        Processing.initialize()
        _processing_initialized = True


def run_on_qgis_thread(fn: Callable[..., _T], *args: Any, **kwargs: Any) -> _T:
    """Runs fn(*args, **kwargs) on the single dedicated QGIS thread and
    blocks until it's done, re-raising any exception fn raised. Every call
    into gis_worker's tool functions from jobs.py goes through this rather
    than calling them directly — see the module-level comment on
    `_qgis_executor` for why."""
    return _qgis_executor.submit(fn, *args, **kwargs).result()


def utm_epsg_for_lonlat(lon: float, lat: float) -> int:
    """WGS84 UTM zone EPSG code covering (lon, lat) — the "appropriate
    projected CRS" the proposal's CRS note calls for, picked automatically
    rather than hardcoded to one region, so this isn't silently wrong
    outside NSW. Good to roughly +-80 degrees latitude (UTM's own usable
    range); polar operations would need a different projection, not
    expected for this application's inputs."""
    zone = int((lon + 180) / 6) + 1
    return (32600 if lat >= 0 else 32700) + zone


def geojson_to_layer(geojson: dict[str, Any], name: str = "layer") -> "QgsVectorLayer":
    """Loads a GeoJSON dict as a QgsVectorLayer via a temp file (OGR's
    GeoJSON driver, not QGIS's in-memory GeoJSON string parsing — more
    reliable across QGIS versions than passing GeoJSON as a literal URI
    string)."""
    ensure_qgis_initialized()
    fd = tempfile.NamedTemporaryFile(mode="w", suffix=".geojson", delete=False, encoding="utf-8")
    try:
        json.dump(geojson, fd)
    finally:
        fd.close()
    layer = QgsVectorLayer(fd.name, name, "ogr")
    if not layer.isValid():
        raise RuntimeError(f"QGIS could not load this GeoJSON as a vector layer (wrote to {fd.name!r} first).")
    return layer


def layer_to_geojson(layer: "QgsVectorLayer") -> dict[str, Any]:
    """Writes a QgsVectorLayer back out as a GeoJSON dict, via OGR's
    GeoJSON writer (not manual feature iteration) so field types/CRS
    handling matches what QGIS itself would produce on export."""
    out_path = tempfile.NamedTemporaryFile(suffix=".geojson", delete=False).name
    error = QgsVectorFileWriter.writeAsVectorFormat(layer, out_path, "UTF-8", layer.crs(), "GeoJSON")
    # writeAsVectorFormat returns either a plain error code (older API) or a
    # tuple of (error code, message) depending on QGIS version - handle both
    # rather than assuming one.
    error_code = error[0] if isinstance(error, tuple) else error
    if error_code != QgsVectorFileWriter.NoError:
        raise RuntimeError(f"QGIS could not write the result layer as GeoJSON (error code {error_code}).")
    with open(out_path, encoding="utf-8") as f:
        return json.load(f)


def reproject(layer: "QgsVectorLayer", target_epsg: int):
    """Returns a new in-memory layer: `layer` reprojected to EPSG:target_epsg,
    via QGIS Processing `native:reprojectlayer` (not a manual per-feature
    QgsCoordinateTransform loop) so it goes through the same code path real
    QGIS use would."""
    import processing
    ensure_qgis_initialized()
    result = processing.run("native:reprojectlayer", {
        "INPUT": layer,
        "TARGET_CRS": QgsCoordinateReferenceSystem(f"EPSG:{target_epsg}"),
        "OUTPUT": "memory:",
    })
    return result["OUTPUT"]
