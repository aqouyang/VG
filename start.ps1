Write-Host "Starting Lyric Studio..." -ForegroundColor Cyan
Write-Host ""

# Check Python
try {
    $pyVer = python --version 2>&1
    Write-Host "  Python: $pyVer" -ForegroundColor DarkGray
} catch {
    Write-Host "  Error: Python is required." -ForegroundColor Red
    exit 1
}

# Check Node
try {
    $nodeVer = node --version 2>&1
    Write-Host "  Node: $nodeVer" -ForegroundColor DarkGray
} catch {
    Write-Host "  Error: Node.js is required." -ForegroundColor Red
    exit 1
}

# Check FFmpeg
$ffmpegOk = $false
try {
    $ffVer = ffmpeg -version 2>&1 | Select-Object -First 1
    Write-Host "  FFmpeg: $ffVer" -ForegroundColor DarkGray
    $ffmpegOk = $true
} catch {
    Write-Host "  FFmpeg: not found" -ForegroundColor Yellow
}

if (-not $ffmpegOk) {
    Write-Host ""
    Write-Host "  FFmpeg is required for video export." -ForegroundColor Yellow
    Write-Host "  Run: python lyric-studio.py ffmpeg install" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host ""

# Start backend in background
$backend = Start-Process -PassThru -NoNewWindow -FilePath "python" -ArgumentList "main.py" -WorkingDirectory "$PSScriptRoot\backend"
Write-Host "  Backend started (PID $($backend.Id)) on http://localhost:8000" -ForegroundColor Green

# Wait for backend health check
$healthy = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -UseBasicParsing -TimeoutSec 2 2>$null
        if ($r.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    } catch {}
}

if ($healthy) {
    Write-Host "  Backend health check: OK" -ForegroundColor Green
} else {
    Write-Host "  Backend health check: failed (continuing anyway)" -ForegroundColor Yellow
}

# Start frontend (foreground, so Ctrl+C stops everything)
Write-Host "  Frontend starting on http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "  Press Ctrl+C to stop both servers" -ForegroundColor DarkGray
Write-Host ""

try {
    Set-Location "$PSScriptRoot\frontend"
    npm run dev
} finally {
    # Kill backend when frontend stops
    if (!$backend.HasExited) {
        Stop-Process -Id $backend.Id -Force
        Write-Host "  Backend stopped" -ForegroundColor Yellow
    }
}
