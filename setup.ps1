# Setup script to download required dependencies before building with Docker
# Run this script once before `docker compose up --build`

$ErrorActionPreference = "Stop"

$VOSK_VERSION = "v0.3.50"
$VOSK_VERSION_NUM = "0.3.50"
$MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"

Write-Host "=== Setting up Speech dependencies ===" -ForegroundColor Cyan

# 1. Download libvosk.so (Linux library for Docker build)
Write-Host "[1/2] Downloading libvosk shared library..." -ForegroundColor Yellow
if (-not (Test-Path "deps")) { New-Item -ItemType Directory -Path "deps" | Out-Null }

if (-not (Test-Path "deps\libvosk.so")) {
    $voskUrl = "https://github.com/alphacep/vosk-api/releases/download/$VOSK_VERSION/vosk-linux-x86_64-$VOSK_VERSION_NUM.zip"
    $tempZip = "$env:TEMP\vosk-linux.zip"
    $tempDir = "$env:TEMP\vosk-linux"

    Invoke-WebRequest -Uri $voskUrl -OutFile $tempZip
    Expand-Archive -Path $tempZip -DestinationPath $tempDir -Force
    Copy-Item "$tempDir\vosk-linux-x86_64-$VOSK_VERSION_NUM\libvosk.so" -Destination "deps\libvosk.so"
    Remove-Item $tempZip -Force
    Remove-Item $tempDir -Recurse -Force
    Write-Host "  -> deps/libvosk.so downloaded" -ForegroundColor Green
} else {
    Write-Host "  -> deps/libvosk.so already exists, skipping" -ForegroundColor Gray
}

# 2. Download Vosk model
Write-Host "[2/2] Downloading Vosk English model (small)..." -ForegroundColor Yellow
if (-not (Test-Path "model")) {
    $tempZip = "$env:TEMP\vosk-model.zip"
    $tempDir = "$env:TEMP\vosk-model"

    Invoke-WebRequest -Uri $MODEL_URL -OutFile $tempZip
    Expand-Archive -Path $tempZip -DestinationPath $tempDir -Force
    Move-Item "$tempDir\vosk-model-small-en-us-0.15" -Destination "model"
    Remove-Item $tempZip -Force
    Remove-Item $tempDir -Recurse -Force
    Write-Host "  -> model/ directory created" -ForegroundColor Green
} else {
    Write-Host "  -> model/ directory already exists, skipping" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Setup complete! ===" -ForegroundColor Cyan
Write-Host "Run: docker compose up --build" -ForegroundColor White
