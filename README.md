# Lyric Studio

A local web application that generates cinematic lyric videos from audio, lyrics, and cover art.

## Features

- **Project Management** - Create and manage song projects
- **Automatic Lyric Sync** - WhisperX/Whisper-based alignment with fallback
- **Lyric Editor** - Timeline-based editor with audio playback
- **Video Preview** - Real-time preview in browser
- **MP4 Export** - Remotion-powered 1920x1080 video rendering
- **Multi-language** - English, French, Chinese, and mixed

## Requirements

- Python 3.9+
- Node.js 18+
- FFmpeg
- (Optional) WhisperX or OpenAI Whisper for automatic alignment

## Quick Start

```bash
# Install dependencies
chmod +x install.sh
./install.sh

# Start backend (terminal 1)
cd backend && python3 main.py

# Start frontend (terminal 2)
cd frontend && npm run dev

# Open http://localhost:3000
```

## Rendering

```bash
# Render a project to MP4
python3 render.py <project_name>

# Output: exports/<project_name>.mp4
```

## Project Structure

```
projects/<name>/
  audio/song.wav
  lyrics/lyrics.txt
  lyrics/lyrics.lrc
  assets/cover.png
  project.json
```

## Tech Stack

- **Frontend**: React, TypeScript, Remotion, Vite
- **Backend**: Python FastAPI
- **Audio Analysis**: librosa, FFmpeg
- **AI Alignment**: WhisperX (preferred), Whisper (fallback)
