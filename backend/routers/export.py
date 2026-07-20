"""
Export engine: chunked rendering, job persistence, GPU detection, monotonic progress.
"""
import os
import re
import json
import math
import time
import uuid
import subprocess
import sys
import threading
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from config import PROJECTS_DIR, EXPORTS_DIR, DATA_DIR, APP_DIR, ensure_data_dirs

router = APIRouter()

JOBS_DIR = os.path.join(DATA_DIR, "export-jobs")
RENDER_CACHE_DIR = os.path.join(DATA_DIR, "render-cache")
SETTINGS_PATH = os.path.join(DATA_DIR, "settings", "performance.json")
CHUNK_SIZE = 600  # frames per chunk

# ─── In-memory job registry ──────────────────────────────────────────
_jobs: dict[str, dict] = {}
_job_lock = threading.Lock()
_active_procs: dict[str, subprocess.Popen] = {}
_seq_counters: dict[str, int] = {}


def _ensure_dirs():
    os.makedirs(JOBS_DIR, exist_ok=True)
    os.makedirs(RENDER_CACHE_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)


def _job_path(job_id: str) -> str:
    return os.path.join(JOBS_DIR, f"{job_id}.json")


def _save_job(job: dict):
    """Atomic write: tmp + rename."""
    path = _job_path(job["id"])
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(job, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    with _job_lock:
        _jobs[job["id"]] = job


def _load_all_jobs():
    """Load persisted jobs on startup."""
    _ensure_dirs()
    with _job_lock:
        for fname in os.listdir(JOBS_DIR):
            if not fname.endswith(".json"):
                continue
            try:
                with open(os.path.join(JOBS_DIR, fname)) as f:
                    job = json.load(f)
                _jobs[job["id"]] = job
                # Mark interrupted jobs
                if job.get("status") in ("rendering", "encoding", "preparing", "muxing"):
                    job["status"] = "interrupted"
                    _save_job(job)
            except Exception:
                pass


def _next_seq(job_id: str) -> int:
    _seq_counters[job_id] = _seq_counters.get(job_id, 0) + 1
    return _seq_counters[job_id]


# Load on import
_load_all_jobs()


# ─── GPU / Encoder detection ────────────────────────────────────────

def _detect_gpus() -> list[dict]:
    """Detect GPUs. Works on Windows (WMI) and Linux (lspci)."""
    gpus = []
    if sys.platform == "win32":
        try:
            r = subprocess.run(
                ["powershell", "-Command",
                 "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion | ConvertTo-Json"],
                capture_output=True, text=True, timeout=10
            )
            if r.returncode == 0:
                data = json.loads(r.stdout)
                if isinstance(data, dict):
                    data = [data]
                for g in data:
                    vram_mb = int(g.get("AdapterRAM", 0)) // (1024 * 1024) if g.get("AdapterRAM") else 0
                    gpus.append({
                        "name": g.get("Name", "Unknown"),
                        "vram_mb": vram_mb,
                        "driver": g.get("DriverVersion", ""),
                    })
        except Exception:
            pass
    else:
        try:
            r = subprocess.run(["lspci"], capture_output=True, text=True, timeout=5)
            for line in r.stdout.split("\n"):
                if "VGA" in line or "3D" in line:
                    gpus.append({"name": line.split(": ", 1)[-1].strip(), "vram_mb": 0, "driver": ""})
        except Exception:
            pass
    return gpus


def _detect_encoders() -> dict:
    """Check which hardware encoders FFmpeg supports."""
    from ffmpeg_resolver import resolve as ffmpeg_resolve
    r = ffmpeg_resolve()
    if r["valid"] and r["encoders"]:
        return dict(r["encoders"])

    encoders = {
        "h264_nvenc": False, "hevc_nvenc": False,
        "h264_qsv": False, "hevc_qsv": False,
        "h264_amf": False, "hevc_amf": False,
        "libx264": False, "libx265": False,
    }
    try:
        ffmpeg_path = r["ffmpeg"] or "ffmpeg"
        r2 = subprocess.run(
            [ffmpeg_path, "-hide_banner", "-encoders"],
            capture_output=True, text=True, timeout=10,
        )
        output = r2.stdout + r2.stderr
        for enc in encoders:
            if enc in output:
                encoders[enc] = True
    except Exception:
        pass
    return encoders


def _detect_nvidia_smi() -> Optional[dict]:
    try:
        r = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10,
            **({"shell": True} if sys.platform == "win32" else {})
        )
        if r.returncode == 0 and r.stdout.strip():
            parts = r.stdout.strip().split(",")
            return {"name": parts[0].strip(), "vram_mb": int(parts[1].strip()) if len(parts) > 1 else 0, "driver": parts[2].strip() if len(parts) > 2 else ""}
    except Exception:
        pass
    return None


# ─── Settings ────────────────────────────────────────────────────────

def _load_settings() -> dict:
    if os.path.exists(SETTINGS_PATH):
        with open(SETTINGS_PATH) as f:
            return json.load(f)
    return {
        "encoder": "auto",
        "preset": "balanced",
        "bitrate": "8M",
        "crf": 23,
        "audioBitrate": "192k",
        "concurrency": 1,
        "remotionConcurrency": 0,  # 0 = auto (use all cores)
        "chunkSize": CHUNK_SIZE,
    }


def _save_settings(settings: dict):
    os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
    with open(SETTINGS_PATH, "w") as f:
        json.dump(settings, f, indent=2)


# ─── Routes ──────────────────────────────────────────────────────────

@router.get("/gpu")
def detect_gpu():
    from ffmpeg_resolver import resolve as ffmpeg_resolve
    gpus = _detect_gpus()
    nvidia = _detect_nvidia_smi()
    r = ffmpeg_resolve(force_refresh=True)
    encoders = r["encoders"] if r["valid"] else _detect_encoders()
    return {
        "gpus": gpus,
        "nvidia": nvidia,
        "encoders": encoders,
        "ffmpeg": {
            "path": r.get("ffmpeg"),
            "version": r.get("version", ""),
            "source": r.get("source", "missing"),
            "valid": r.get("valid", False),
            "filters": r.get("filters", []),
        },
    }


@router.get("/settings")
def get_settings():
    return _load_settings()


@router.post("/settings")
def save_settings(body: dict):
    s = _load_settings()
    s.update(body)
    _save_settings(s)
    return s


@router.get("/jobs")
def list_jobs():
    with _job_lock:
        return sorted(_jobs.values(), key=lambda j: j.get("created", ""), reverse=True)


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    with _job_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


class CreateJobRequest(BaseModel):
    project_name: str
    output_path: Optional[str] = None
    engine: Optional[str] = "auto"  # "auto", "fast", "advanced"


@router.post("/jobs")
def create_job(req: CreateJobRequest):
    """Create an export job and add it to the queue."""
    _ensure_dirs()
    project_path = os.path.join(PROJECTS_DIR, req.project_name)
    pj_path = os.path.join(project_path, "project.json")
    if not os.path.exists(pj_path):
        raise HTTPException(404, "Project not found")

    with open(pj_path) as f:
        project = json.load(f)

    for field in ("audio_file", "cover_file", "lrc_file"):
        if not project.get(field):
            raise HTTPException(400, f"Missing {field}")

    # Calculate duration
    import soundfile as sf
    audio_path = os.path.join(project_path, "audio", project["audio_file"])
    info = sf.info(audio_path)
    duration = float(info.duration)

    vc = project.get("visual_config", {}).get("video", {})
    fps = vc.get("fps", 30)
    width = vc.get("width", 1920)
    height = vc.get("height", 1080)
    total_frames = math.ceil(duration * fps)

    if total_frames <= 0:
        raise HTTPException(400, "Audio duration is 0")

    settings = _load_settings()
    chunk_size = settings.get("chunkSize", CHUNK_SIZE)
    chunks = []
    for start in range(0, total_frames, chunk_size):
        end = min(start + chunk_size - 1, total_frames - 1)
        chunks.append({"start": start, "end": end, "status": "pending"})

    output = req.output_path or os.path.join(EXPORTS_DIR, f"{req.project_name}.mp4")

    # Determine rendering engine
    engine = req.engine or "auto"
    if engine == "auto":
        from fast_renderer import check_fast_compatible
        compatible, unsupported = check_fast_compatible(project.get("visual_config", {}))
        engine = "fast" if compatible else "advanced"

    job_id = uuid.uuid4().hex[:12]
    job = {
        "id": job_id,
        "project_name": req.project_name,
        "title": project.get("title", req.project_name),
        "artist": project.get("artist", ""),
        "output_path": output,
        "width": width,
        "height": height,
        "fps": fps,
        "duration": duration,
        "total_frames": total_frames,
        "engine": engine,
        "encoder": settings.get("encoder", "auto"),
        "preset": settings.get("preset", "balanced"),
        "status": "queued",
        "stage": "",
        "current_frame": 0,
        "percent": 0,
        "stage_percent": 0,
        "render_fps": 0,
        "elapsed": 0,
        "eta": 0,
        "error": "",
        "chunks": chunks,
        "completed_chunks": 0,
        "created": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "started": "",
        "finished": "",
        "seq": 0,
    }

    _save_job(job)

    # Start processing in background
    t = threading.Thread(target=_process_queue, daemon=True)
    t.start()

    return job


@router.post("/jobs/{job_id}/pause")
def pause_job(job_id: str):
    with _job_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404)
    if job["status"] not in ("rendering", "encoding", "queued"):
        raise HTTPException(400, f"Cannot pause job in status {job['status']}")
    job["status"] = "paused"
    _save_job(job)
    # Kill active process
    proc = _active_procs.pop(job_id, None)
    if proc:
        proc.terminate()
    return job


@router.post("/jobs/{job_id}/resume")
def resume_job(job_id: str):
    with _job_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404)
    if job["status"] not in ("paused", "interrupted", "failed"):
        raise HTTPException(400, f"Cannot resume job in status {job['status']}")
    job["status"] = "queued"
    job["error"] = ""
    _save_job(job)
    t = threading.Thread(target=_process_queue, daemon=True)
    t.start()
    return job


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    with _job_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404)
    proc = _active_procs.pop(job_id, None)
    if proc:
        proc.terminate()
    job["status"] = "cancelled"
    _save_job(job)
    return job


@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str):
    with _job_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404)
    # Reset failed/incomplete chunks
    for chunk in job["chunks"]:
        if chunk["status"] != "done":
            chunk["status"] = "pending"
    job["status"] = "queued"
    job["error"] = ""
    _save_job(job)
    t = threading.Thread(target=_process_queue, daemon=True)
    t.start()
    return job


@router.delete("/jobs/{job_id}")
def delete_job(job_id: str):
    with _job_lock:
        job = _jobs.pop(job_id, None)
    if not job:
        raise HTTPException(404)
    # Clean files
    path = _job_path(job_id)
    if os.path.exists(path):
        os.remove(path)
    cache_dir = os.path.join(RENDER_CACHE_DIR, job_id)
    if os.path.isdir(cache_dir):
        import shutil
        shutil.rmtree(cache_dir, ignore_errors=True)
    return {"deleted": job_id}


# SSE endpoint for live progress
@router.get("/jobs/{job_id}/stream")
def stream_job(job_id: str):
    def generate():
        last_seq = 0
        while True:
            with _job_lock:
                job = _jobs.get(job_id)
            if not job:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Job not found'})}\n\n"
                break
            if job.get("seq", 0) > last_seq:
                last_seq = job["seq"]
                yield f"data: {json.dumps({**job, 'type': 'update'})}\n\n"
            if job["status"] in ("completed", "failed", "cancelled"):
                yield f"data: {json.dumps({**job, 'type': 'final'})}\n\n"
                break
            time.sleep(0.5)

    return StreamingResponse(generate(), media_type="text/event-stream")


# ─── Background job processing ───────────────────────────────────────

_queue_lock = threading.Lock()


def _process_queue():
    """Process the next queued job."""
    with _queue_lock:
        # Find next queued job
        with _job_lock:
            queued = [j for j in _jobs.values() if j["status"] == "queued"]
        if not queued:
            return
        queued.sort(key=lambda j: j["created"])
        job = queued[0]

        # Check concurrency limit
        settings = _load_settings()
        max_concurrent = settings.get("concurrency", 1)
        with _job_lock:
            running = sum(1 for j in _jobs.values() if j["status"] in ("rendering", "encoding", "muxing"))
        if running >= max_concurrent:
            return

    try:
        _run_job(job)
    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["seq"] = _next_seq(job["id"])
        _save_job(job)

    # Process next
    _process_queue()


def _run_job(job: dict):
    """Execute a single export job. Dispatches to fast or advanced renderer."""
    job_id = job["id"]
    project_name = job["project_name"]
    total_frames = job["total_frames"]
    job["status"] = "preparing"
    job["started"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    job["seq"] = _next_seq(job_id)
    _save_job(job)

    engine = job.get("engine", "advanced")

    if engine == "fast":
        _run_fast_job(job)
        return

    # Advanced renderer (Remotion, chunked)
    # Set up cache directory
    cache_dir = os.path.join(RENDER_CACHE_DIR, job_id)
    chunks_dir = os.path.join(cache_dir, "chunks")
    os.makedirs(chunks_dir, exist_ok=True)

    # Prepare Remotion props
    project_dir = os.path.join(PROJECTS_DIR, project_name)
    with open(os.path.join(project_dir, "project.json")) as f:
        project = json.load(f)

    lrc_path = os.path.join(project_dir, "lyrics", "lyrics.lrc")
    lrc_lines = []
    with open(lrc_path, encoding="utf-8") as f:
        for line in f.read().strip().split("\n"):
            m = re.match(r"^\[(\d{1,2}):(\d{2}(?:\.\d+)?)\](.*)$", line)
            if m:
                lrc_lines.append({"time": int(m.group(1)) * 60 + float(m.group(2)), "text": m.group(3)})

    props = {
        "projectName": project_name,
        "title": project["title"],
        "artist": project["artist"],
        "audioFile": project["audio_file"],
        "coverFile": project["cover_file"],
        "lrcLines": lrc_lines,
        "durationInFrames": total_frames,
    }
    if project.get("visual_config"):
        props["visualConfig"] = project["visual_config"]

    props_path = os.path.join(cache_dir, "props.json")
    with open(props_path, "w") as f:
        json.dump(props, f)

    # Copy project files to Remotion public
    public_dir = os.path.join(APP_DIR, "frontend", "public", "projects", project_name)
    os.makedirs(os.path.join(public_dir, "audio"), exist_ok=True)
    os.makedirs(os.path.join(public_dir, "assets"), exist_ok=True)
    import shutil
    audio_src = os.path.join(project_dir, "audio", project["audio_file"])
    audio_dst = os.path.join(public_dir, "audio", project["audio_file"])
    if not os.path.exists(audio_dst) or os.path.getmtime(audio_src) > os.path.getmtime(audio_dst):
        shutil.copy2(audio_src, audio_dst)
    cover_src = os.path.join(project_dir, "assets", project["cover_file"])
    cover_dst = os.path.join(public_dir, "assets", project["cover_file"])
    if not os.path.exists(cover_dst) or os.path.getmtime(cover_src) > os.path.getmtime(cover_dst):
        shutil.copy2(cover_src, cover_dst)

    # ─── Render chunks ───────────────────────────────────────────
    job["status"] = "rendering"
    job["stage"] = "rendering"
    job["seq"] = _next_seq(job_id)
    _save_job(job)

    start_time = time.time()
    completed_frames = sum(
        (c["end"] - c["start"] + 1) for c in job["chunks"] if c["status"] == "done"
    )

    settings = _load_settings()
    import multiprocessing
    max_cores = multiprocessing.cpu_count()
    rc = settings.get("remotionConcurrency", 0)
    remotion_concurrency = min(rc, max_cores) if rc > 0 else max_cores

    for ci, chunk in enumerate(job["chunks"]):
        # Check if paused/cancelled
        with _job_lock:
            current_status = _jobs.get(job_id, {}).get("status")
        if current_status in ("paused", "cancelled"):
            return

        if chunk["status"] == "done":
            chunk_file = os.path.join(chunks_dir, f"chunk_{ci:04d}.mp4")
            if os.path.exists(chunk_file):
                continue
            # File missing, re-render
            chunk["status"] = "pending"

        chunk_file = os.path.join(chunks_dir, f"chunk_{ci:04d}.mp4")
        frame_range = f"{chunk['start']}-{chunk['end']}"

        cmd = [
            "npx", "remotion", "render",
            "src/remotion/index.ts", "LyricVideo",
            chunk_file,
            f"--props={props_path}",
            f"--frames={frame_range}",
            f"--width={job['width']}",
            f"--height={job['height']}",
            f"--concurrency={remotion_concurrency}",
        ]

        chunk["status"] = "rendering"
        _save_job(job)

        proc = subprocess.Popen(
            cmd, cwd=os.path.join(APP_DIR, "frontend"),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
            **({"shell": True} if sys.platform == "win32" else {})
        )
        _active_procs[job_id] = proc

        chunk_frames = chunk["end"] - chunk["start"] + 1
        for line in proc.stdout:
            line = line.strip()
            m = re.match(r"Rendered\s+(\d+)/(\d+)", line)
            if m:
                rendered_in_chunk = int(m.group(1))
                abs_frame = completed_frames + rendered_in_chunk
                pct = int(abs_frame * 85 / total_frames) + 3  # rendering = 3-88%
                elapsed = time.time() - start_time
                fps_rate = abs_frame / max(elapsed, 0.1)
                remaining = (total_frames - abs_frame) / max(fps_rate, 0.1) if fps_rate > 0 else 0

                job["current_frame"] = abs_frame
                job["percent"] = min(pct, 88)
                job["stage_percent"] = int(rendered_in_chunk * 100 / chunk_frames)
                job["render_fps"] = round(fps_rate, 1)
                job["elapsed"] = round(elapsed, 1)
                job["eta"] = round(remaining, 1)
                job["seq"] = _next_seq(job_id)
                _save_job(job)

        proc.wait()
        _active_procs.pop(job_id, None)

        if proc.returncode != 0:
            chunk["status"] = "failed"
            job["status"] = "failed"
            job["error"] = f"Chunk {ci} render failed (exit {proc.returncode})"
            job["seq"] = _next_seq(job_id)
            _save_job(job)
            return

        chunk["status"] = "done"
        completed_frames += chunk_frames
        job["completed_chunks"] = ci + 1
        _save_job(job)

    # ─── Concatenate chunks ──────────────────────────────────────
    job["status"] = "encoding"
    job["stage"] = "encoding"
    job["percent"] = 89
    job["seq"] = _next_seq(job_id)
    _save_job(job)

    concat_list = os.path.join(cache_dir, "concat.txt")
    with open(concat_list, "w") as f:
        for ci in range(len(job["chunks"])):
            chunk_file = os.path.join(chunks_dir, f"chunk_{ci:04d}.mp4")
            f.write(f"file '{chunk_file}'\n")

    from ffmpeg_resolver import get_ffmpeg
    ffmpeg_exe = get_ffmpeg()

    video_only = os.path.join(cache_dir, "video_only.mp4")
    concat_cmd = [
        ffmpeg_exe, "-y", "-f", "concat", "-safe", "0",
        "-i", concat_list, "-c", "copy", video_only,
    ]
    r = subprocess.run(
        concat_cmd, capture_output=True, text=True,
    )
    if r.returncode != 0:
        job["status"] = "failed"
        job["error"] = f"Concatenation failed: {r.stderr[:300]}"
        job["seq"] = _next_seq(job_id)
        _save_job(job)
        return

    job["percent"] = 93
    job["seq"] = _next_seq(job_id)
    _save_job(job)

    # ─── Mux audio ───────────────────────────────────────────────
    job["stage"] = "muxing"
    job["percent"] = 94
    job["seq"] = _next_seq(job_id)
    _save_job(job)

    audio_src = os.path.join(project_dir, "audio", project["audio_file"])
    output = job["output_path"]
    os.makedirs(os.path.dirname(output), exist_ok=True)

    mux_cmd = [
        ffmpeg_exe, "-y",
        "-i", video_only,
        "-i", audio_src,
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest", output,
    ]
    r = subprocess.run(
        mux_cmd, capture_output=True, text=True,
        **({"shell": True} if sys.platform == "win32" else {})
    )
    if r.returncode != 0:
        job["status"] = "failed"
        job["error"] = f"Audio mux failed: {r.stderr[:300]}"
        job["seq"] = _next_seq(job_id)
        _save_job(job)
        return

    # ─── Done ────────────────────────────────────────────────────
    job["status"] = "completed"
    job["stage"] = "done"
    job["percent"] = 100
    job["stage_percent"] = 100
    job["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    job["elapsed"] = round(time.time() - start_time, 1)
    job["seq"] = _next_seq(job_id)
    _save_job(job)

    # Clean up temporary files
    try:
        import shutil
        shutil.rmtree(os.path.join(cache_dir, "chunks"), ignore_errors=True)
        for f in ("concat.txt", "video_only.mp4", "props.json"):
            p = os.path.join(cache_dir, f)
            if os.path.exists(p):
                os.remove(p)
    except Exception:
        pass


# ─── Fast renderer job execution ──────────────────────────────────────

def _run_fast_job(job: dict):
    """Execute a fast renderer job (Pillow + ASS + FFmpeg)."""
    from fast_renderer import render_fast
    job_id = job["id"]
    start_time = time.time()

    def on_progress(stage, pct, speed):
        job["stage"] = stage
        job["percent"] = max(job.get("percent", 0), pct)  # monotonic
        job["render_fps"] = round(speed, 1) if speed else 0
        job["elapsed"] = round(time.time() - start_time, 1)
        remaining = (job["duration"] / max(speed, 0.01) - job["elapsed"]) if speed > 0 else 0
        job["eta"] = max(0, round(remaining, 1))
        job["seq"] = _next_seq(job_id)
        if stage == "encoding":
            job["status"] = "rendering"
        _save_job(job)

    job["status"] = "rendering"
    job["seq"] = _next_seq(job_id)
    _save_job(job)

    try:
        settings = _load_settings()
        result = render_fast(
            job["project_name"],
            job["output_path"],
            settings,
            on_progress=on_progress,
        )

        job["status"] = "completed"
        job["stage"] = "done"
        job["percent"] = 100
        job["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        job["elapsed"] = round(time.time() - start_time, 1)
        job["render_fps"] = 0
        job["eta"] = 0
        job["seq"] = _next_seq(job_id)
        _save_job(job)
    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)
        job["seq"] = _next_seq(job_id)
        _save_job(job)


# ─── Capability check endpoint ───────────────────────────────────────

@router.get("/check/{name}")
def check_renderer_compat(name: str):
    """Check if a project is compatible with Fast Renderer."""
    project_path = os.path.join(PROJECTS_DIR, name)
    pj_path = os.path.join(project_path, "project.json")
    if not os.path.exists(pj_path):
        raise HTTPException(404, "Project not found")
    with open(pj_path) as f:
        project = json.load(f)
    from fast_renderer import check_fast_compatible
    compatible, unsupported = check_fast_compatible(project.get("visual_config", {}))
    return {"fast_compatible": compatible, "unsupported_features": unsupported, "recommended": "fast" if compatible else "advanced"}


# ─── Legacy streaming endpoint (backward compat) ─────────────────────

@router.post("/{name}/render")
def start_render_legacy(name: str):
    """Legacy endpoint: creates a job and streams progress."""
    job = create_job(CreateJobRequest(project_name=name))
    job_id = job["id"]

    def stream():
        while True:
            with _job_lock:
                j = _jobs.get(job_id)
            if not j:
                break
            if j["status"] == "rendering":
                yield json.dumps({"type": "progress", "current": j["current_frame"], "total": j["total_frames"], "percent": j["percent"]}) + "\n"
            elif j["status"] == "encoding":
                yield json.dumps({"type": "encoding", "current": j["current_frame"], "total": j["total_frames"]}) + "\n"
            elif j["status"] == "completed":
                yield json.dumps({"type": "done", "output": j["output_path"]}) + "\n"
                break
            elif j["status"] in ("failed", "cancelled"):
                yield json.dumps({"type": "error", "message": j.get("error", "Export failed")}) + "\n"
                break
            time.sleep(1)

    return StreamingResponse(stream(), media_type="text/plain")
