import os
import json
import numpy as np
from fastapi import APIRouter, HTTPException

router = APIRouter()

PROJECTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "projects")


def get_project_path(name: str) -> str:
    return os.path.join(PROJECTS_DIR, name)


@router.post("/{name}/analyze")
def analyze_waveform(name: str):
    """Analyze audio and generate waveform data for visualization."""
    project_path = get_project_path(name)
    pj_path = os.path.join(project_path, "project.json")

    if not os.path.exists(pj_path):
        raise HTTPException(404, "Project not found")

    with open(pj_path) as f:
        data = json.load(f)

    if not data.get("audio_file"):
        raise HTTPException(400, "No audio file")

    audio_path = os.path.join(project_path, "audio", data["audio_file"])

    import librosa

    # Load audio
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))

    # Generate amplitude envelope at ~30fps
    fps = 30
    total_frames = int(duration * fps)
    hop_length = max(1, len(y) // total_frames)

    # RMS energy per frame
    amplitudes = []
    for i in range(total_frames):
        start = i * hop_length
        end = min(start + hop_length, len(y))
        chunk = y[start:end]
        rms = float(np.sqrt(np.mean(chunk ** 2))) if len(chunk) > 0 else 0.0
        amplitudes.append(round(rms, 4))

    # Normalize
    max_amp = max(amplitudes) if amplitudes else 1.0
    if max_amp > 0:
        amplitudes = [round(a / max_amp, 4) for a in amplitudes]

    # Generate frequency bands for visual bars (simplified spectral analysis)
    n_bands = 32
    waveform_bars = []

    # Use mel spectrogram for frequency bands
    S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=n_bands, hop_length=hop_length)
    S_db = librosa.power_to_db(S, ref=np.max)

    # Normalize to 0-1
    S_norm = (S_db - S_db.min()) / (S_db.max() - S_db.min() + 1e-8)

    for frame_idx in range(min(total_frames, S_norm.shape[1])):
        bars = [round(float(S_norm[band, frame_idx]), 3) for band in range(n_bands)]
        waveform_bars.append(bars)

    # Pad if needed
    while len(waveform_bars) < total_frames:
        waveform_bars.append([0.0] * n_bands)

    waveform_data = {
        "fps": fps,
        "duration": duration,
        "total_frames": total_frames,
        "amplitudes": amplitudes,
        "bars": waveform_bars,
        "n_bands": n_bands,
    }

    # Save waveform data
    waveform_path = os.path.join(project_path, "assets", "waveform.json")
    with open(waveform_path, "w") as f:
        json.dump(waveform_data, f)

    return {
        "duration": duration,
        "total_frames": total_frames,
        "n_bands": n_bands,
        "waveform_file": "waveform.json",
    }


@router.get("/{name}/data")
def get_waveform_data(name: str):
    """Get pre-computed waveform data."""
    project_path = get_project_path(name)
    waveform_path = os.path.join(project_path, "assets", "waveform.json")

    if not os.path.exists(waveform_path):
        raise HTTPException(404, "Waveform data not found. Run analyze first.")

    with open(waveform_path) as f:
        return json.load(f)
