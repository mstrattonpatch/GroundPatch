"""
CAD drawing import — DXF (and DWG, via the ODA File Converter) into
GeoJSON, reprojected to WGS84, so index.html can add it to the map
exactly like any queried layer.

Goes through GDAL/OGR's open-source DXF driver via the same QgsVectorLayer
plumbing every other layer in this backend uses (qgis_runtime.py), not a
hand-rolled DXF parser. GDAL's DXF driver already flattens blocks (INSERT),
tessellates arcs/circles/splines into ordinary line/polygon geometry, and
(with CLOSED_LINE_AS_POLYGON=YES below) turns a closed LWPOLYLINE/POLYLINE
into a real Polygon - none of that needs custom handling here.

DWG itself is a closed Autodesk binary format with no open-source reader
that reliably covers the newer (2018+) revisions - confirmed against a
real customer file: both QGIS's own bundled DWG/DXF importer and GNU
LibreDWG failed outright on it (LibreDWG errored reading the compressed
section table). DWG support here goes through the ODA File Converter (a
free tool from the Open Design Alliance, the organisation that documents
the DWG format and keeps the most current reader) to produce a DXF first,
then the exact same DXF path below handles it. If that binary isn't
installed, DWG uploads fail with a clear message rather than pretending
to succeed.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from .qgis_runtime import ensure_qgis_initialized

try:
    from qgis.core import (
        QgsCoordinateReferenceSystem,
        QgsCoordinateTransform,
        QgsProject,
        QgsVectorLayer,
    )
except ImportError:
    pass  # ensure_qgis_initialized() raises a clear error before any of these names are touched


class CadImportError(RuntimeError):
    """A clear, user-facing reason the import couldn't complete — caught in
    main.py and returned as a 422, not a bare 500."""


# Common NSW/Australian survey CRSes — what the frontend's CRS dropdown
# offers. Not exhaustive (any EPSG code works), just the ones worth naming
# rather than making every user look up a code.
COMMON_SOURCE_CRS: dict[int, str] = {
    7856: "GDA2020 / MGA zone 56",
    7855: "GDA2020 / MGA zone 55",
    7857: "GDA2020 / MGA zone 57",
    28356: "GDA94 / MGA zone 56",
    28355: "GDA94 / MGA zone 55",
    28357: "GDA94 / MGA zone 57",
    4326: "WGS 84 (longitude/latitude)",
}

ODA_FILE_CONVERTER_TIMEOUT_S = 120


def _oda_file_converter_path() -> str | None:
    # Resolved at call time, not import time, so a test/dev environment
    # without the binary installed can still import this module freely —
    # only an actual DWG upload hits this.
    return shutil.which("ODAFileConverter")


def _convert_dwg_to_dxf(dwg_path: Path, work_dir: Path) -> Path:
    """Runs the ODA File Converter to produce a DXF from dwg_path, inside
    work_dir. Raises CadImportError (with the tool's own output) if it
    isn't installed or fails — never silently falls back to treating the
    DWG as if it were already a DXF."""
    oda_path = _oda_file_converter_path()
    if oda_path is None:
        raise CadImportError(
            "DWG import needs the ODA File Converter, which isn't installed on this "
            "backend right now. In the meantime, export the drawing as DXF instead — "
            "Autodesk's free DWG TrueView, or any CAD package's 'Save As > DXF' — and "
            "upload that instead of the .dwg."
        )

    in_dir = work_dir / "in"
    out_dir = work_dir / "out"
    in_dir.mkdir()
    out_dir.mkdir()
    staged = in_dir / dwg_path.name
    shutil.copy(dwg_path, staged)

    # ODA File Converter is a Qt GUI app even in its batch mode — it needs a
    # display to run at all, including headless on a server. xvfb-run
    # provides a throwaway virtual one. Arguments: InputFolder OutputFolder
    # OutputVersion OutputType Recurse Audit [InputFilter]. "ACAD2013" is an
    # arbitrary modern-but-old DXF target version every downstream DXF
    # reader (including GDAL/OGR's) reads without issue.
    cmd = [
        "xvfb-run", "-a", oda_path,
        str(in_dir), str(out_dir), "ACAD2013", "DXF", "0", "1",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=ODA_FILE_CONVERTER_TIMEOUT_S)
    except subprocess.TimeoutExpired as exc:
        raise CadImportError(
            f"ODA File Converter timed out converting this DWG ({ODA_FILE_CONVERTER_TIMEOUT_S}s) — "
            "the file may be unusually large or complex."
        ) from exc
    except FileNotFoundError as exc:
        raise CadImportError("xvfb-run isn't installed on this backend — DWG conversion needs it alongside the ODA File Converter.") from exc

    out_files = sorted(out_dir.glob("*.dxf"))
    if not out_files:
        tail = (proc.stdout + proc.stderr).strip()[-800:] or "(no output captured)"
        raise CadImportError(
            f"ODA File Converter could not convert this DWG file (exit code {proc.returncode}). "
            f"Its own output: {tail}"
        )
    return out_files[0]


def import_cad_file(file_path: str, original_filename: str, source_epsg: int) -> dict[str, Any]:
    """Reads a DWG or DXF file at file_path (any temp path — original_filename
    is only used for its extension and in error messages) and returns a dict
    matching models.CadImportResponse's fields (minus the response wrapper)."""
    ensure_qgis_initialized()

    suffix = Path(original_filename).suffix.lower()
    if suffix not in (".dwg", ".dxf"):
        raise CadImportError(f"Unsupported file type {suffix or '(none)'!r} — upload a .dwg or .dxf file.")

    with tempfile.TemporaryDirectory(prefix="groundpatch-cad-") as tmp:
        work_dir = Path(tmp)
        src_path = Path(file_path)
        converted_from_dwg = suffix == ".dwg"
        dxf_path = _convert_dwg_to_dxf(src_path, work_dir) if converted_from_dwg else src_path

        uri = f"{dxf_path}|option:CLOSED_LINE_AS_POLYGON=YES"
        layer = QgsVectorLayer(uri, Path(original_filename).stem, "ogr")
        if not layer.isValid():
            raise CadImportError(f"QGIS/GDAL could not read {dxf_path.name!r} as a DXF file.")
        if layer.featureCount() == 0:
            raise CadImportError(
                "This drawing has no entities in its model space (nothing to import) — "
                "it may only contain blocks/attributes with no geometry drawn directly."
            )

        # DXF carries no CRS of its own — every coordinate is just whatever
        # the drawing's local grid units were, so the source CRS has to be
        # told to us rather than read from the file.
        layer.setCrs(QgsCoordinateReferenceSystem(f"EPSG:{source_epsg}"))
        transform = QgsCoordinateTransform(layer.crs(), QgsCoordinateReferenceSystem("EPSG:4326"), QgsProject.instance())

        field_names = [fld.name() for fld in layer.fields()]
        features: list[dict[str, Any]] = []
        skipped = 0
        for f in layer.getFeatures():
            geom = f.geometry()
            if geom is None or geom.isEmpty():
                skipped += 1
                continue
            geom.transform(transform)
            props: dict[str, Any] = {}
            for name, value in zip(field_names, f.attributes()):
                # PyQGIS NULL attributes aren't JSON-serialisable as-is and
                # (being a QVariant NULL) aren't equal to themselves —
                # the standard way to spot one — so normalize to None.
                props[name] = None if value != value or str(value) == "NULL" else value
            features.append({"type": "Feature", "properties": props, "geometry": json.loads(geom.asJson())})

        return {
            "geojson": {"type": "FeatureCollection", "features": features},
            "feature_count": len(features),
            "skipped_empty_geometry": skipped,
            "source_epsg": source_epsg,
            "converted_from_dwg": converted_from_dwg,
        }
