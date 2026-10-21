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

COPY app ./app

# QgsApplication.initQgis() needs this on any host with no X display —
# see README.md's "GIS engine: PyQGIS" section for why.
ENV QT_QPA_PLATFORM=offscreen

EXPOSE 8000

# Render (and most PaaS hosts) inject $PORT at runtime rather than always
# using 8000 — falls back to 8000 for a plain `docker run` locally.
CMD ["conda", "run", "--no-capture-output", "-n", "groundpatch-gis", \
     "sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
