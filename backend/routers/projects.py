import os
import re
import json
import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional
from config import PROJECTS_DIR

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    title: str
    artist: str


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    visual_config: Optional[dict] = None
    layouts: Optional[dict] = None


def get_project_path(name: str) -> str:
    return os.path.join(PROJECTS_DIR, name)


def load_project_json(name: str) -> dict:
    path = os.path.join(get_project_path(name), "project.json")
    if not os.path.exists(path):
        raise HTTPException(404, "Project not found")
    with open(path) as f:
        return json.load(f)


def save_project_json(name: str, data: dict):
    path = os.path.join(get_project_path(name), "project.json")
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


LRC_LINE_RE = re.compile(r"^\[(\d{1,2}):(\d{2}(?:\.\d+)?)\](.+)$")


def detect_lrc_format(text: str) -> bool:
    """Return True if the text looks like LRC (has timestamp markers)."""
    for line in text.strip().split("\n"):
        line = line.strip()
        if line and LRC_LINE_RE.match(line):
            return True
    return False


def lrc_to_plain(text: str) -> str:
    """Strip timestamps from LRC text, return plain lyrics."""
    lines = []
    for line in text.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        m = LRC_LINE_RE.match(line)
        if m:
            lines.append(m.group(3))
        else:
            lines.append(line)
    return "\n".join(lines)


@router.get("")
def list_projects():
    if not os.path.exists(PROJECTS_DIR):
        return []
    projects = []
    for d in sorted(os.listdir(PROJECTS_DIR)):
        pj = os.path.join(PROJECTS_DIR, d, "project.json")
        if os.path.isfile(pj):
            with open(pj) as f:
                projects.append(json.load(f))
    return projects


@router.post("")
def create_project(project: ProjectCreate):
    project_path = get_project_path(project.name)
    if os.path.exists(project_path):
        raise HTTPException(400, "Project already exists")

    os.makedirs(os.path.join(project_path, "audio"), exist_ok=True)
    os.makedirs(os.path.join(project_path, "lyrics"), exist_ok=True)
    os.makedirs(os.path.join(project_path, "assets"), exist_ok=True)

    data = {
        "name": project.name,
        "title": project.title,
        "artist": project.artist,
        "audio_file": None,
        "lyrics_file": None,
        "lrc_file": None,
        "cover_file": None,
        "duration": None,
    }
    save_project_json(project.name, data)
    return data


@router.get("/{name}")
def get_project(name: str):
    return load_project_json(name)


@router.put("/{name}")
def update_project(name: str, update: ProjectUpdate):
    data = load_project_json(name)
    if update.title is not None:
        data["title"] = update.title
    if update.artist is not None:
        data["artist"] = update.artist
    if update.visual_config is not None:
        data["visual_config"] = update.visual_config
    if update.layouts is not None:
        data["layouts"] = update.layouts
    save_project_json(name, data)
    return data


@router.delete("/{name}")
def delete_project(name: str):
    path = get_project_path(name)
    if not os.path.exists(path):
        raise HTTPException(404, "Project not found")
    shutil.rmtree(path)
    return {"deleted": name}


@router.post("/{name}/audio")
async def upload_audio(name: str, file: UploadFile = File(...)):
    project_path = get_project_path(name)
    if not os.path.exists(project_path):
        raise HTTPException(404, "Project not found")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".wav", ".mp3", ".flac", ".ogg", ".m4a"):
        raise HTTPException(400, "Unsupported audio format")

    audio_path = os.path.join(project_path, "audio", f"song{ext}")
    with open(audio_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Get audio duration
    import soundfile as sf
    info = sf.info(audio_path)
    duration = float(info.duration)

    data = load_project_json(name)
    data["audio_file"] = f"song{ext}"
    data["duration"] = duration
    save_project_json(name, data)

    return {"audio_file": data["audio_file"], "duration": duration}


@router.post("/{name}/lyrics")
async def upload_lyrics(name: str, file: UploadFile = File(...)):
    """Upload lyrics file. Auto-detects LRC vs plain text format."""
    project_path = get_project_path(name)
    if not os.path.exists(project_path):
        raise HTTPException(404, "Project not found")

    content = await file.read()
    text = content.decode("utf-8")

    is_lrc = detect_lrc_format(text)

    data = load_project_json(name)

    if is_lrc:
        # Save original as LRC
        lrc_path = os.path.join(project_path, "lyrics", "lyrics.lrc")
        with open(lrc_path, "w", encoding="utf-8") as f:
            f.write(text)
        # Also save plain text version
        plain = lrc_to_plain(text)
        txt_path = os.path.join(project_path, "lyrics", "lyrics.txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(plain)
        data["lyrics_file"] = "lyrics.txt"
        data["lrc_file"] = "lyrics.lrc"
        save_project_json(name, data)
        return {"lyrics_file": "lyrics.txt", "lrc_file": "lyrics.lrc", "format": "lrc", "content": text}
    else:
        # Plain text lyrics
        txt_path = os.path.join(project_path, "lyrics", "lyrics.txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(text)
        data["lyrics_file"] = "lyrics.txt"
        save_project_json(name, data)
        return {"lyrics_file": "lyrics.txt", "format": "txt", "content": text}


@router.post("/{name}/lyrics/text")
async def save_lyrics_text(name: str, content: str = Form(...)):
    project_path = get_project_path(name)
    if not os.path.exists(project_path):
        raise HTTPException(404, "Project not found")

    lyrics_path = os.path.join(project_path, "lyrics", "lyrics.txt")
    with open(lyrics_path, "w", encoding="utf-8") as f:
        f.write(content)

    data = load_project_json(name)
    data["lyrics_file"] = "lyrics.txt"
    save_project_json(name, data)

    return {"lyrics_file": "lyrics.txt"}


@router.get("/{name}/lyrics/text")
def get_lyrics_text(name: str):
    project_path = get_project_path(name)
    lyrics_path = os.path.join(project_path, "lyrics", "lyrics.txt")
    if not os.path.exists(lyrics_path):
        raise HTTPException(404, "Lyrics file not found")
    with open(lyrics_path, encoding="utf-8") as f:
        return {"content": f.read()}


@router.post("/{name}/cover")
async def upload_cover(name: str, file: UploadFile = File(...)):
    project_path = get_project_path(name)
    if not os.path.exists(project_path):
        raise HTTPException(404, "Project not found")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".webp"):
        raise HTTPException(400, "Unsupported image format")

    cover_path = os.path.join(project_path, "assets", f"cover{ext}")
    with open(cover_path, "wb") as f:
        content = await file.read()
        f.write(content)

    data = load_project_json(name)
    data["cover_file"] = f"cover{ext}"
    # Increment asset version to bust browser cache
    data["cover_version"] = data.get("cover_version", 0) + 1
    save_project_json(name, data)

    return {"cover_file": data["cover_file"], "cover_version": data["cover_version"]}


@router.get("/{name}/lrc")
def get_lrc(name: str):
    project_path = get_project_path(name)
    lrc_path = os.path.join(project_path, "lyrics", "lyrics.lrc")
    if not os.path.exists(lrc_path):
        raise HTTPException(404, "LRC file not found")
    with open(lrc_path, encoding="utf-8") as f:
        return {"content": f.read()}


@router.post("/{name}/lrc")
async def save_lrc(name: str, content: str = Form(...)):
    project_path = get_project_path(name)
    if not os.path.exists(project_path):
        raise HTTPException(404, "Project not found")

    lrc_path = os.path.join(project_path, "lyrics", "lyrics.lrc")
    with open(lrc_path, "w", encoding="utf-8") as f:
        f.write(content)

    data = load_project_json(name)
    data["lrc_file"] = "lyrics.lrc"
    save_project_json(name, data)

    return {"lrc_file": "lyrics.lrc"}
