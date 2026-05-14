#Requires -Version 5.1
<#
.SYNOPSIS
  Build VoicePaste.exe — the desktop keyboard-shortcut client.

.DESCRIPTION
  Creates a single self-contained .exe that:
    * Records audio on a configurable hotkey
    * Sends audio to your deployed Flask backend (app.py)
    * Pastes the Yiddish transcription into the active window

  The RunPod API key is NEVER included in the exe.
  The exe only stores the backend URL + a simple bearer token (set by
  setup_voicepaste.ps1 in %APPDATA%\VoicePaste\settings.json).

.PARAMETER SupabaseLogoUrl
  Optional. If you have uploaded a custom logo via the admin panel, pass the
  public Supabase Storage URL here and it will be used as the exe icon.
  Example: -SupabaseLogoUrl "https://xyz.supabase.co/storage/v1/object/public/logos/logo"

.EXAMPLE
  .\build_exe.ps1
  .\build_exe.ps1 -SupabaseLogoUrl "https://xyz.supabase.co/storage/v1/object/public/logos/logo"
#>

param(
    [string]$SupabaseLogoUrl = ""
)

$ErrorActionPreference = "Stop"
$BuildDir = "$PSScriptRoot\.build_client"
$Python   = "$BuildDir\Scripts\python.exe"
$Pip      = "$BuildDir\Scripts\pip.exe"

Write-Host ""
Write-Host "=== VoicePaste Exe Builder ===" -ForegroundColor Cyan
Write-Host ""

# ── 1. Virtual environment ────────────────────────────────────────────────────
if (-not (Test-Path $BuildDir)) {
    Write-Host "Creating build virtual environment..." -ForegroundColor Yellow
    python -m venv $BuildDir
}

Write-Host "Upgrading pip..." -ForegroundColor Yellow
& $Python -m pip install --upgrade pip --quiet

# ── 2. Install client dependencies ────────────────────────────────────────────
Write-Host "Installing client dependencies..." -ForegroundColor Yellow
& $Pip install -r "$PSScriptRoot\requirements.txt" --quiet
& $Pip install pillow --quiet   # needed by make_icon.py

# ── 3. Generate logo.ico ──────────────────────────────────────────────────────
Write-Host "Generating logo.ico..." -ForegroundColor Yellow
if ($SupabaseLogoUrl) {
    & $Python "$PSScriptRoot\make_icon.py" --supabase-url $SupabaseLogoUrl
} else {
    & $Python "$PSScriptRoot\make_icon.py"
}

$IconPath = "$PSScriptRoot\logo.ico"
if (-not (Test-Path $IconPath)) {
    Write-Error "logo.ico was not created. Check make_icon.py output above."
    exit 1
}

# ── 4. PyInstaller — build the exe ────────────────────────────────────────────
Write-Host ""
Write-Host "Building VoicePaste.exe with PyInstaller..." -ForegroundColor Yellow
Write-Host "(This may take a minute on first run)" -ForegroundColor Gray
Write-Host ""

& $Python -m PyInstaller `
    --onefile `
    --noconsole `
    --name "VoicePaste" `
    --icon "$IconPath" `
    --add-binary "$BuildDir\Lib\site-packages\imageio_ffmpeg\binaries\*;imageio_ffmpeg\binaries" `
    --hidden-import "pynput.keyboard._win32" `
    --hidden-import "pynput.mouse._win32" `
    --clean `
    "$PSScriptRoot\voicepaste_client.py"

# ── 5. Result ─────────────────────────────────────────────────────────────────
$Exe = "$PSScriptRoot\dist\VoicePaste.exe"
if (Test-Path $Exe) {
    $SizeMB = [math]::Round((Get-Item $Exe).Length / 1MB, 1)
    Write-Host ""
    Write-Host "✓ Build successful!" -ForegroundColor Green
    Write-Host "  Output : dist\VoicePaste.exe  ($SizeMB MB)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Deploy app.py to Railway/Render (keeps the RunPod API key safe)"
    Write-Host "  2. Run setup_voicepaste.ps1 on each user machine to set server URL + token"
    Write-Host "  3. Distribute dist\VoicePaste.exe"
    Write-Host ""
} else {
    Write-Error "Build failed — VoicePaste.exe not found in dist\"
    exit 1
}
