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

    import soundfile as sf

    # Load audio
    y, sr = sf.read(audio_path, dtype="float32", always_2d=True)
    # Mix to mono
    y = y.mean(axis=1)
    duration = float(len(y) / sr)

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

    # Simple spectral bands using FFT (no librosa needed)
    n_bands = 32
    waveform_bars = []
    fft_size = 2048

    for i in range(total_frames):
        start = i * hop_length
        end = min(start + fft_size, len(y))
        chunk = y[start:end]
        if len(chunk) < fft_size:
            chunk = np.pad(chunk, (0, fft_size - len(chunk)))
        # Apply window and FFT
        windowed = chunk * np.hanning(fft_size)
        spectrum = np.abs(np.fft.rfft(windowed))
        # Split spectrum into n_bands
        band_size = len(spectrum) // n_bands
        bars = []
        for b in range(n_bands):
            band_start = b * band_size
            band_end = band_start + band_size
            band_energy = float(np.mean(spectrum[band_start:band_end]))
            bars.append(band_energy)
        waveform_bars.append(bars)

    # Normalize bars globally to 0-1
    all_vals = [v for frame in waveform_bars for v in frame]
    max_val = max(all_vals) if all_vals else 1.0
    if max_val > 0:
        waveform_bars = [[round(v / max_val, 3) for v in frame] for frame in waveform_bars]

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
