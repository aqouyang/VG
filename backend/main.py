import os
import sys

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from config import PROJECTS_DIR, EXPORTS_DIR, ensure_data_dirs, get_app_version
from routers import projects, alignment, waveform, themes, export

ensure_data_dirs()

v = get_app_version()
app = FastAPI(title="Lyric Studio API", version=v["version"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount data directories for static file serving
app.mount("/static/projects", StaticFiles(directory=PROJECTS_DIR), name="projects_static")
app.mount("/static/exports", StaticFiles(directory=EXPORTS_DIR), name="exports_static")

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(alignment.router, prefix="/api/alignment", tags=["alignment"])
app.include_router(waveform.router, prefix="/api/waveform", tags=["waveform"])
app.include_router(themes.router, prefix="/api/themes", tags=["themes"])
app.include_router(export.router, prefix="/api/export", tags=["export"])


@app.get("/api/health")
def health():
    return {"status": "ok", "version": v["version"]}


@app.get("/api/version")
def version_info():
    """Return full version info including git commit."""
    import subprocess
    commit = ""
    commit_date = ""
    try:
        commit = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            capture_output=True, text=True,
        ).stdout.strip()
        commit_date = subprocess.run(
            ["git", "log", "-1", "--format=%ci"],
            cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            capture_output=True, text=True,
        ).stdout.strip()
    except Exception:
        pass
    return {
        "version": v["version"],
        "schema_version": v.get("schema_version", 1),
        "commit": commit,
        "commit_date": commit_date,
    }


if __name__ == "__main__":
    # Run migrations on startup
    from migrate import migrate_all_projects
    migrate_all_projects()

    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
