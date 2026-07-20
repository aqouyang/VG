# Lyric Studio

A local web application that generates cinematic lyric videos from audio, lyrics, and cover art.

## Features

- **Project Management** - Create and manage song projects with dashboard UI
- **Automatic Lyric Sync** - WhisperX/Whisper-based alignment with even-distribution fallback
- **Lyric Editor** - Timeline-based editor with audio playback, click-to-seek, manual timestamp editing
- **Video Preview** - Real-time preview that updates instantly as you adjust settings
- **Visual Editor** - Full control over layout, typography, backgrounds, colors, and animations
- **Theme System** - Built-in themes (Cinematic, Minimal, Classic) plus save/load custom themes
- **MP4 Export** - Remotion-powered 1920x1080 30fps video rendering
- **Multi-language** - English, French, Chinese, and mixed-language lyrics

## Requirements

- Python 3.9+
- Node.js 18+
- FFmpeg
- (Optional) WhisperX or OpenAI Whisper for automatic alignment

## Quick Start (Windows)

### Install

```powershell
# Install Python dependencies
cd backend
python -m pip install -r requirements.txt
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Run (single command)

```powershell
powershell -ExecutionPolicy Bypass -File start.ps1
```

### Run (two terminals)

```powershell
# Terminal 1 - Backend
cd backend
python main.py

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Then open http://localhost:3000

## Quick Start (macOS / Linux)

```bash
# Install all dependencies
chmod +x install.sh
./install.sh

# Start backend (terminal 1)
cd backend && python3 main.py

# Start frontend (terminal 2)
cd frontend && npm run dev

# Open http://localhost:3000
```

## Usage

1. **Create a project** - Click "New Project" on the dashboard, enter song title and artist
2. **Upload files** - Add audio (.wav/.mp3), lyrics (.txt), and cover image (.png/.jpg)
3. **Generate timestamps** - Click "Generate Timestamps" to auto-sync lyrics to audio
4. **Edit timing** - Switch to "Lyric Editor" tab to fine-tune timestamps manually
5. **Customize visuals** - Use the Visual Settings panel on the right to adjust layout, fonts, colors, and background
6. **Preview** - Switch to "Video Preview" tab and play audio to see the result in real time
7. **Export** - Render to MP4

## Rendering

```powershell
# Windows
python render.py <project_name>

# macOS / Linux
python3 render.py <project_name>

# Output: exports/<project_name>.mp4
```

## Visual Customization

All visual parameters are editable from the UI and saved per project:

| Section | Controls |
|---------|----------|
| **Cover** | Position (left/center/right), size, offset, corner radius, shadow |
| **Lyrics** | Position, width, font, size, spacing, active/inactive colors & opacity, scroll speed |
| **Title** | Font, size, weight, color, position (below cover, corners, center) |
| **Artist** | Font, size, weight, color, gap below title |
| **Background** | Blurred cover / solid color / gradient, blur amount, brightness, overlay |

Themes can be saved and reused across projects.

## Project Structure

```
projects/<name>/
  audio/song.wav
  lyrics/lyrics.txt
  lyrics/lyrics.lrc
  assets/cover.png
  project.json          # includes visual_config

themes/
  cinematic.json
  minimal.json
  custom_theme.json
```

## Tech Stack

- **Frontend**: React, TypeScript, Remotion, Vite
- **Backend**: Python FastAPI
- **Audio Analysis**: soundfile, numpy, FFmpeg
- **AI Alignment**: WhisperX (preferred), Whisper (fallback), even-distribution (default)
