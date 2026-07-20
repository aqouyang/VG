Write-Host "=== Lyric Studio Installer (Windows) ===" -ForegroundColor Cyan
Write-Host ""

# Check Python
try {
    $pyVer = python --version 2>&1
    Write-Host "Python: $pyVer"
} catch {
    Write-Host "Error: Python is required. Install from https://python.org" -ForegroundColor Red
    exit 1
}

# Check Node
try {
    $nodeVer = node --version 2>&1
    Write-Host "Node: $nodeVer"
} catch {
    Write-Host "Error: Node.js is required (v18+). Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Check FFmpeg
try {
    $null = ffmpeg -version 2>&1
    Write-Host "FFmpeg: found"
} catch {
    Write-Host "Warning: FFmpeg not found. Install from https://ffmpeg.org for video rendering." -ForegroundColor Yellow
}

# Install Python dependencies
Write-Host ""
Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
Push-Location backend
pip install -r requirements.txt
Pop-Location

# Try WhisperX (optional)
Write-Host ""
Write-Host "Attempting WhisperX install (optional)..." -ForegroundColor Yellow
pip install whisperx 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "WhisperX unavailable (OK - will use fallback alignment)" -ForegroundColor Yellow
    pip install openai-whisper 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Whisper also unavailable - will use even distribution" -ForegroundColor Yellow
    }
}

# Install frontend dependencies
Write-Host ""
Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
Push-Location frontend
npm install
Pop-Location

# Create directories
New-Item -ItemType Directory -Force -Path projects | Out-Null
New-Item -ItemType Directory -Force -Path exports | Out-Null

Write-Host ""
Write-Host "=== Installation complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "To start:" -ForegroundColor Cyan
Write-Host "  Terminal 1:  cd backend; python main.py"
Write-Host "  Terminal 2:  cd frontend; npm run dev"
Write-Host ""
Write-Host "Then open http://localhost:3000"
