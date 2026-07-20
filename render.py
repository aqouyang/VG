#!/usr/bin/env python3
"""
Lyric Studio CLI renderer.

Usage:
    python render.py <project_name>

Generates an MP4 video from a project's audio, lyrics, cover, and visual config.
"""

import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "backend"))

from config import PROJECTS_DIR, EXPORTS_DIR, ensure_data_dirs


def main():
    if len(sys.argv) < 2:
        print("Usage: python render.py <project_name>")
        sys.exit(1)

    ensure_data_dirs()

    project_name = sys.argv[1]
    project_dir = os.path.join(PROJECTS_DIR, project_name)
    project_json = os.path.join(project_dir, "project.json")

    if not os.path.exists(project_json):
        print(f"Error: Project '{project_name}' not found at {project_dir}")
        sys.exit(1)

    with open(project_json) as f:
        project = json.load(f)

    # Validate required files
    for field, label in [
        ("audio_file", "Audio"),
        ("cover_file", "Cover image"),
        ("lrc_file", "LRC file"),
    ]:
        if not project.get(field):
            print(f"Error: {label} not found. Please set up the project first.")
            sys.exit(1)

    # Load LRC
    lrc_path = os.path.join(project_dir, "lyrics", "lyrics.lrc")
    with open(lrc_path, encoding="utf-8") as f:
        lrc_content = f.read()

    lrc_lines = []
    for line in lrc_content.strip().split("\n"):
        m = re.match(r"^\[(\d{1,2}):(\d{2}(?:\.\d+)?)\](.*)$", line)
        if m:
            t = int(m.group(1)) * 60 + float(m.group(2))
            lrc_lines.append({"time": t, "text": m.group(3)})

    # Get audio duration
    import soundfile as sf
    audio_path = os.path.join(project_dir, "audio", project["audio_file"])
    info = sf.info(audio_path)
    duration = float(info.duration)

    # Video settings from config
    vc = project.get("visual_config", {}).get("video", {})
    render_fps = vc.get("fps", 30)
    render_w = vc.get("width", 1920)
    render_h = vc.get("height", 1080)
    total_frames = int(duration * render_fps)

    # Create input props for Remotion
    props = {
        "projectName": project_name,
        "title": project["title"],
        "artist": project["artist"],
        "audioFile": project["audio_file"],
        "coverFile": project["cover_file"],
        "lrcLines": lrc_lines,
    }

    # Include visual config if present
    if project.get("visual_config"):
        props["visualConfig"] = project["visual_config"]

    props_path = os.path.join(ROOT, "frontend", "render-props.json")
    with open(props_path, "w") as f:
        json.dump(props, f)

    output_path = os.path.join(EXPORTS_DIR, f"{project_name}.mp4")

    # Copy project files to Remotion public directory for static file serving
    public_dir = os.path.join(ROOT, "frontend", "public", "projects", project_name)
    os.makedirs(os.path.join(public_dir, "audio"), exist_ok=True)
    os.makedirs(os.path.join(public_dir, "assets"), exist_ok=True)

    audio_src = os.path.join(project_dir, "audio", project["audio_file"])
    audio_dst = os.path.join(public_dir, "audio", project["audio_file"])
    if not os.path.exists(audio_dst) or os.path.getmtime(audio_src) > os.path.getmtime(audio_dst):
        shutil.copy2(audio_src, audio_dst)

    cover_src = os.path.join(project_dir, "assets", project["cover_file"])
    cover_dst = os.path.join(public_dir, "assets", project["cover_file"])
    if not os.path.exists(cover_dst) or os.path.getmtime(cover_src) > os.path.getmtime(cover_dst):
        shutil.copy2(cover_src, cover_dst)

    print(f"\033[1mRendering {project_name}\033[0m")
    print(f"  Resolution: {render_w}x{render_h} @ {render_fps}fps")
    print(f"  Duration:   {duration:.1f}s ({total_frames} frames)")
    print(f"  Config:     {'custom' if project.get('visual_config') else 'default'}")
    print(f"  Output:     {output_path}")
    print()

    # Run Remotion render
    cmd = [
        "npx", "remotion", "render",
        "src/remotion/index.ts",
        "LyricVideo",
        output_path,
        f"--props={props_path}",
        f"--frames=0-{total_frames - 1}",
        f"--width={render_w}",
        f"--height={render_h}",
    ]

    result = subprocess.run(cmd, cwd=os.path.join(ROOT, "frontend"), shell=(sys.platform == "win32"))
    if result.returncode == 0:
        print(f"\nDone! Video saved to: {output_path}")
    else:
        print("\nRender failed. Check errors above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
