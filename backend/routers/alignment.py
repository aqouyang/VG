import os
import json
import subprocess
import tempfile
from fastapi import APIRouter, HTTPException
from config import PROJECTS_DIR

router = APIRouter()


def get_project_path(name: str) -> str:
    return os.path.join(PROJECTS_DIR, name)


def load_project_json(name: str) -> dict:
    path = os.path.join(get_project_path(name), "project.json")
    if not os.path.exists(path):
        raise HTTPException(404, "Project not found")
    with open(path) as f:
        return json.load(f)


def try_whisperx_alignment(audio_path: str, lyrics_lines: list[str]) -> list[dict] | None:
    """Try WhisperX for transcription and alignment."""
    try:
        import whisperx
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"

        model = whisperx.load_model("base", device, compute_type=compute_type)
        audio = whisperx.load_audio(audio_path)
        result = model.transcribe(audio)

        # Try alignment
        lang = result.get("language", "en")
        model_a, metadata = whisperx.load_align_model(language_code=lang, device=device)
        result = whisperx.align(result["segments"], model_a, metadata, audio, device)

        # Extract word timestamps and match to lyrics
        segments = result.get("segments", [])
        return _match_segments_to_lyrics(segments, lyrics_lines)
    except Exception:
        return None


def try_whisper_alignment(audio_path: str, lyrics_lines: list[str]) -> list[dict] | None:
    """Fallback to standard Whisper."""
    try:
        import whisper

        model = whisper.load_model("base")
        result = model.transcribe(audio_path, word_timestamps=True)
        segments = result.get("segments", [])
        return _match_segments_to_lyrics(segments, lyrics_lines)
    except Exception:
        return None


def _match_segments_to_lyrics(segments: list[dict], lyrics_lines: list[str]) -> list[dict]:
    """Match whisper segments to provided lyrics lines."""
    result = []

    # Collect all segment timestamps
    seg_times = []
    for seg in segments:
        seg_times.append({
            "start": seg.get("start", 0),
            "end": seg.get("end", 0),
            "text": seg.get("text", "").strip(),
        })

    if not seg_times:
        return []

    # Simple matching: distribute lyrics across detected segments
    n_lyrics = len(lyrics_lines)
    n_segs = len(seg_times)

    if n_segs >= n_lyrics:
        # More segments than lyrics: group segments per lyric line
        ratio = n_segs / n_lyrics
        for i, line in enumerate(lyrics_lines):
            seg_idx = int(i * ratio)
            seg_idx = min(seg_idx, n_segs - 1)
            result.append({
                "line": line,
                "start": seg_times[seg_idx]["start"],
            })
    else:
        # More lyrics than segments: distribute evenly
        for i, line in enumerate(lyrics_lines):
            seg_idx = int(i * n_segs / n_lyrics)
            seg_idx = min(seg_idx, n_segs - 1)
            result.append({
                "line": line,
                "start": seg_times[seg_idx]["start"],
            })

    return result


def generate_even_timestamps(lyrics_lines: list[str], duration: float) -> list[dict]:
    """Fallback: evenly distribute lyrics across audio duration."""
    n = len(lyrics_lines)
    if n == 0:
        return []

    # Leave some padding at start and end
    start_pad = min(2.0, duration * 0.05)
    end_pad = min(3.0, duration * 0.05)
    usable = duration - start_pad - end_pad
    interval = usable / n if n > 0 else usable

    result = []
    for i, line in enumerate(lyrics_lines):
        t = start_pad + i * interval
        result.append({"line": line, "start": round(t, 2)})

    return result


def timestamps_to_lrc(timestamps: list[dict]) -> str:
    """Convert timestamp list to LRC format."""
    lines = []
    for entry in timestamps:
        t = entry["start"]
        minutes = int(t // 60)
        seconds = t % 60
        lines.append(f"[{minutes:02d}:{seconds:05.2f}]{entry['line']}")
    return "\n".join(lines)


@router.post("/{name}/align")
def align_lyrics(name: str):
    """Run automatic lyric alignment."""
    data = load_project_json(name)
    project_path = get_project_path(name)

    if not data.get("audio_file"):
        raise HTTPException(400, "No audio file uploaded")
    if not data.get("lyrics_file"):
        raise HTTPException(400, "No lyrics file uploaded")

    audio_path = os.path.join(project_path, "audio", data["audio_file"])
    lyrics_path = os.path.join(project_path, "lyrics", "lyrics.txt")

    with open(lyrics_path, encoding="utf-8") as f:
        lyrics_text = f.read().strip()

    lyrics_lines = [l.strip() for l in lyrics_text.split("\n") if l.strip()]

    if not lyrics_lines:
        raise HTTPException(400, "Lyrics file is empty")

    duration = data.get("duration", 120.0)
    method = "even_distribution"

    # Try WhisperX first
    timestamps = try_whisperx_alignment(audio_path, lyrics_lines)
    if timestamps:
        method = "whisperx"
    else:
        # Try standard Whisper
        timestamps = try_whisper_alignment(audio_path, lyrics_lines)
        if timestamps:
            method = "whisper"
        else:
            # Fallback to even distribution
            timestamps = generate_even_timestamps(lyrics_lines, duration)

    # Save LRC file
    lrc_content = timestamps_to_lrc(timestamps)
    lrc_path = os.path.join(project_path, "lyrics", "lyrics.lrc")
    with open(lrc_path, "w", encoding="utf-8") as f:
        f.write(lrc_content)

    data["lrc_file"] = "lyrics.lrc"
    with open(os.path.join(project_path, "project.json"), "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return {
        "method": method,
        "lrc_file": "lyrics.lrc",
        "lrc_content": lrc_content,
        "timestamps": timestamps,
    }
