Write-Host "Starting Lyric Studio..." -ForegroundColor Cyan
Write-Host ""

# Start backend in background
$backend = Start-Process -PassThru -NoNewWindow -FilePath "python" -ArgumentList "main.py" -WorkingDirectory "$PSScriptRoot\backend"
Write-Host "Backend started (PID $($backend.Id)) on http://localhost:8000" -ForegroundColor Green

# Wait a moment for backend to initialize
Start-Sleep -Seconds 2

# Start frontend (foreground, so Ctrl+C stops everything)
Write-Host "Frontend starting on http://localhost:3000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop both servers" -ForegroundColor Yellow
Write-Host ""

try {
    Set-Location "$PSScriptRoot\frontend"
    npm run dev
} finally {
    # Kill backend when frontend stops
    if (!$backend.HasExited) {
        Stop-Process -Id $backend.Id -Force
        Write-Host "Backend stopped" -ForegroundColor Yellow
    }
}
