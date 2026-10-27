# Builds the real groundpatch-gis conda environment (PyQGIS + the
# orchestration layer) into a single image, so a host like Render can run
# this as a plain Docker web service — see README.md's "GIS engine: PyQGIS"
# for why this can't just be a pip requirements.txt build.
FROM condaforge/miniforge3:24.11.3-2

WORKDIR /app

# Install the environment first (its own layer) so code-only changes below
# don't force a reinstall of QGIS and its dependencies on every rebuild.
COPY environment-qgis.yml .
RUN mamba env create -f environment-qgis.yml && mamba clean -afy

# --- DWG import support (app/cad_import.py) --------------------------------
# DXF upload works with nothing extra — GDAL/OGR's DXF driver is already
# part of the qgis conda package above. DWG is a closed Autodesk format with
# no reliable open-source reader (confirmed against a real customer file:
# both QGIS's own bundled importer and GNU LibreDWG failed on it outright —
# see cad_import.py's module docstring). The only tool that reliably reads
# current DWG versions is the ODA File Converter, a free tool from the
# Open Design Alliance (the org that documents the DWG format) — but it's
# distributed from their own site behind a download form, not a stable,
# scriptable URL, so it can't be fetched automatically in this build the
# way everything else here is. Without it, DWG uploads to /api/cad/import
# fail with a clear "convert to DXF first" message rather than pretending
# to work — see cad_import.py's _convert_dwg_to_dxf().
#
# To enable real DWG uploads: download the Linux build of the ODA File
# Converter from https://www.opendesignalliance.org/ (free, no license key
# needed for conversion use — requires creating a free ODA account to
# download), place the extracted app at backend/vendor/ODAFileConverter/
# (gitignored — not committed, per their distribution terms), and uncomment
# the COPY line below. It's a Qt app that needs a virtual display even in
# batch mode, hence xvfb here.
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb libxkbcommon-x11-0 libxcb-cursor0 libxcb-icccm4 libxcb-image0 \
    libxcb-keysyms1 libxcb-randr0 libxcb-render-util0 libxcb-shape0 \
    libxcb-xfixes0 libxcomposite1 libxrandr2 libxi6 libxtst6 \
    libfontconfig1 libdbus-1-3 libgl1 \
    && rm -rf /var/lib/apt/lists/*
# COPY vendor/ODAFileConverter /opt/ODAFileConverter
# ENV PATH="/opt/ODAFileConverter:${PATH}"

COPY app ./app

# QgsApplication.initQgis() needs this on any host with no X display —
# see README.md's "GIS engine: PyQGIS" section for why.
ENV QT_QPA_PLATFORM=offscreen

EXPOSE 8000

# Render (and most PaaS hosts) inject $PORT at runtime rather than always
# using 8000 — falls back to 8000 for a plain `docker run` locally.
CMD ["conda", "run", "--no-capture-output", "-n", "groundpatch-gis", \
     "sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
