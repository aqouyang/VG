# Lyric Studio

A local web application that generates cinematic lyric videos from audio, lyrics, and cover art.

## Features

- **Project Management** - Create and manage song projects with dashboard UI
- **Tap-to-Timestamp Editor** - Play audio, tap lines to record timestamps in real time
- **Smart Import** - Auto-detects LRC (with timestamps) vs plain text lyrics
- **Video Preview** - Real-time preview that updates instantly as you adjust settings
- **Visual Editor** - Full control over layout, typography, backgrounds, colors, and animations
- **Theme System** - Built-in themes (Cinematic, Minimal, Classic) plus save/load custom themes
- **MP4 Export** - Remotion-powered 1920x1080 30fps video rendering
- **Safe Updates** - Git-based updates with automatic backup, never overwrites user data
- **Multi-language** - English, French, Chinese, and mixed-language lyrics

## Requirements

- Python 3.9+
- Node.js 18+
- FFmpeg
- Git (for updates)

## Quick Start (Windows)

```powershell
# Install dependencies
cd backend; python -m pip install -r requirements.txt; cd ..
cd frontend; npm install; cd ..

# Run (single command)
powershell -ExecutionPolicy Bypass -File start.ps1

# Or via CLI
python lyric-studio.py start
```

## Quick Start (macOS / Linux)

```bash
chmod +x install.sh && ./install.sh

# Start
python3 lyric-studio.py start

# Or manually
cd backend && python3 main.py   # terminal 1
cd frontend && npm run dev      # terminal 2
```

Then open http://localhost:3000

## CLI Commands

```
python lyric-studio.py version              Show current version
python lyric-studio.py start                Start backend + frontend
python lyric-studio.py render <project>     Render project to MP4
python lyric-studio.py update               Update application code
python lyric-studio.py update --check       Check for updates only
python lyric-studio.py update --backup      Force backup before update
python lyric-studio.py backup               Create manual backup
python lyric-studio.py migrate              Run schema migrations
```

## Data Separation

User data is stored separately from application code:

```
VG/                         # Application code (updated via git)
  backend/
  frontend/
  version.json

VG/data/                    # User data (never touched by updates)
  projects/
    my_song/
      audio/song.wav
      lyrics/lyrics.txt
      lyrics/lyrics.lrc
      assets/cover.png
      project.json
  themes/
    my_theme.json
  exports/
    my_song.mp4
  settings/
  backups/
    backup_2026_07_20_05_51/
```

Set `LYRIC_STUDIO_DATA` environment variable to store data in a custom location.

## Update System

Updates only modify application code, never user data:

```
python lyric-studio.py update
```

1. Checks for new commits on origin/main
2. Creates automatic backup of project metadata, lyrics, and themes
3. Pulls application updates via git
4. Runs schema migrations if needed
5. Reinstalls dependencies if changed
6. Rolls back automatically on failure

## Usage

1. **Create a project** - Click "New Project" on the dashboard
2. **Upload files** - Add audio (.wav/.mp3), lyrics (.txt or .lrc), and cover image
3. **Set timestamps** - Play audio, click lines or press Enter to stamp each line
4. **Customize visuals** - Use the Visual Settings panel to adjust layout and style
5. **Preview** - Switch to "Video Preview" tab to see the result in real time
6. **Export** - Click "Export Video" then run the render command

### Keyboard Shortcuts (Timing Editor)

| Key | Action |
|-----|--------|
| Space | Play / Pause |
| Enter | Stamp focused line at current time |
| Up / Down | Navigate lines |
| Ctrl+Backspace | Clear timestamp |

## Tech Stack

- **Frontend**: React, TypeScript, Remotion, Vite
- **Backend**: Python FastAPI
- **Audio**: soundfile, numpy, FFmpeg
- **CLI**: Python with git-based update system
