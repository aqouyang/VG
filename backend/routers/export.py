import os
import re
import json
import subprocess
import sys
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from config import PROJECTS_DIR, EXPORTS_DIR, APP_DIR

router = APIRouter()


@router.post("/{name}/render")
def start_render(name: str):
    """Start rendering a project. Returns a streaming response with progress lines."""
    project_path = os.path.join(PROJECTS_DIR, name)
    pj_path = os.path.join(project_path, "project.json")

    if not os.path.exists(pj_path):
        raise HTTPException(404, "Project not found")

    with open(pj_path) as f:
        project = json.load(f)

    for field, label in [("audio_file", "Audio"), ("cover_file", "Cover"), ("lrc_file", "LRC")]:
        if not project.get(field):
            raise HTTPException(400, f"{label} not found")

    output_path = os.path.join(EXPORTS_DIR, f"{name}.mp4")

    def stream():
        cmd = [sys.executable, os.path.join(APP_DIR, "render.py"), name]
        proc = subprocess.Popen(
            cmd, cwd=APP_DIR,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            # Parse Remotion progress: "Rendered 150/9000"
            m = re.match(r"Rendered\s+(\d+)/(\d+)", line)
            if m:
                current = int(m.group(1))
                total = int(m.group(2))
                pct = int(current * 100 / total) if total > 0 else 0
                yield json.dumps({"type": "progress", "current": current, "total": total, "percent": pct}) + "\n"
            elif "Stitched" in line:
                m2 = re.match(r"Stitched\s+(\d+)/(\d+)", line)
                if m2:
                    yield json.dumps({"type": "encoding", "current": int(m2.group(1)), "total": int(m2.group(2))}) + "\n"
            elif "Done!" in line or line.endswith(".mp4"):
                yield json.dumps({"type": "done", "output": output_path}) + "\n"
            elif "Error" in line or "error" in line:
                yield json.dumps({"type": "error", "message": line}) + "\n"

        proc.wait()
        if proc.returncode != 0:
            yield json.dumps({"type": "error", "message": f"Render failed (exit {proc.returncode})"}) + "\n"
        else:
            yield json.dumps({"type": "done", "output": output_path}) + "\n"

    return StreamingResponse(stream(), media_type="text/plain")
