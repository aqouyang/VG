import os
import sys

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routers import projects, alignment, waveform, themes

app = FastAPI(title="Lyric Studio API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount project directories for static file serving
PROJECTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "projects")
EXPORTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "exports")

os.makedirs(PROJECTS_DIR, exist_ok=True)
os.makedirs(EXPORTS_DIR, exist_ok=True)

app.mount("/static/projects", StaticFiles(directory=PROJECTS_DIR), name="projects_static")
app.mount("/static/exports", StaticFiles(directory=EXPORTS_DIR), name="exports_static")

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(alignment.router, prefix="/api/alignment", tags=["alignment"])
app.include_router(waveform.router, prefix="/api/waveform", tags=["waveform"])
app.include_router(themes.router, prefix="/api/themes", tags=["themes"])


@app.get("/api/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
