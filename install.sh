#!/bin/bash
set -e

echo "=== Lyric Studio Installer ==="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required"
    exit 1
fi
echo "Python: $(python3 --version)"

# Check Node
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required (v18+)"
    exit 1
fi
echo "Node: $(node --version)"

# Check FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "Warning: FFmpeg not found. Install it for video rendering."
    echo "  Ubuntu/Debian: sudo apt install ffmpeg"
    echo "  macOS: brew install ffmpeg"
fi

# Install Python dependencies
echo ""
echo "Installing Python dependencies..."
cd backend
pip3 install -r requirements.txt
cd ..

# Try to install WhisperX (optional)
echo ""
echo "Attempting WhisperX install (optional)..."
pip3 install whisperx 2>/dev/null || {
    echo "WhisperX install failed (this is OK - will use fallback alignment)"
    # Try standard whisper as fallback
    pip3 install openai-whisper 2>/dev/null || echo "Whisper also unavailable - will use even distribution"
}

# Install frontend dependencies
echo ""
echo "Installing frontend dependencies..."
cd frontend
npm install
cd ..

# Create directories
mkdir -p projects exports

echo ""
echo "=== Installation complete ==="
echo ""
echo "To start:"
echo "  Terminal 1: cd backend && python3 main.py"
echo "  Terminal 2: cd frontend && npm run dev"
echo ""
echo "Then open http://localhost:3000"
