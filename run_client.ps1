#Requires -Version 5.1
<#
.SYNOPSIS
  Run the VoicePaste client from source (no exe needed — for development).

.DESCRIPTION
  Installs dependencies into a local venv and runs voicepaste_client.py.
  Settings are read from %APPDATA%\VoicePaste\settings.json (run
  setup_voicepaste.ps1 first if you have not already).
#>

$ErrorActionPreference = "Stop"
$Venv   = "$PSScriptRoot\.venv_client"
$Python = "$Venv\Scripts\python.exe"

if (-not (Test-Path $Venv)) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv $Venv
    & "$Venv\Scripts\pip.exe" install --upgrade pip --quiet
    & "$Venv\Scripts\pip.exe" install -r "$PSScriptRoot\requirements.txt" --quiet
}

& $Python "$PSScriptRoot\voicepaste_client.py"
