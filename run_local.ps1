#Requires -Version 5.1
<#
.SYNOPSIS
  Run the VoicePaste BACKEND server locally (development / testing only).

.DESCRIPTION
  Installs server dependencies and starts app.py (the Flask proxy that talks to
  RunPod). The RunPod API key and client token are set via environment variables
  or prompted interactively.

  For production, deploy app.py to Railway, Render, or Fly.io instead.
#>

$ErrorActionPreference = "Stop"
$Venv   = "$PSScriptRoot\.venv_server"
$Python = "$Venv\Scripts\python.exe"

# ── Secrets (server-side only — never go into the exe) ───────────────────────
if (-not $env:RUNPOD_API_KEY) {
    $env:RUNPOD_API_KEY = Read-Host "RunPod API key"
}
if (-not $env:CLIENT_TOKEN) {
    $env:CLIENT_TOKEN = Read-Host "Client token (password clients must send)"
}
if (-not $env:RUNPOD_ENDPOINT_ID) {
    $env:RUNPOD_ENDPOINT_ID = "c5y5e4hr3v3496"
}

# ── Venv + dependencies ───────────────────────────────────────────────────────
if (-not (Test-Path $Venv)) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv $Venv
    & "$Venv\Scripts\pip.exe" install --upgrade pip --quiet
    & "$Venv\Scripts\pip.exe" install flask requests gunicorn --quiet
}

Write-Host ""
Write-Host "Starting VoicePaste backend on http://localhost:8080 ..." -ForegroundColor Cyan
Write-Host ""
& $Python "$PSScriptRoot\app.py"
