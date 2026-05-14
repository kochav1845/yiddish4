#Requires -Version 5.1
<#
.SYNOPSIS
  Build VoicePasteSetup.exe — the one-click installer + client for end users.

.DESCRIPTION
  Produces a single self-contained Windows exe that:
    1. Shows a dark-themed setup wizard on first run (asks for server URL + token)
    2. Copies itself to %LOCALAPPDATA%\VoicePaste\VoicePaste.exe
    3. Creates a Desktop shortcut
    4. Optionally adds itself to Windows startup
    5. Then runs as the hotkey transcription client

  The RunPod API key is NEVER included in the exe.

  The exe icon is downloaded from Supabase Storage and converted to .ico
  automatically.

.EXAMPLE
  .\build_installer.ps1
#>

$ErrorActionPreference = "Stop"
$BuildDir  = "$PSScriptRoot\.build_installer"
$Python    = "$BuildDir\Scripts\python.exe"
$Pip       = "$BuildDir\Scripts\pip.exe"
$LogoUrl   = "https://wcdftqogczrapavcphmj.supabase.co/storage/v1/object/public/logos/logo?t=1778652999405"
$IconPath  = "$PSScriptRoot\logo.ico"

Write-Host ""
Write-Host "=== VoicePaste Installer Builder ===" -ForegroundColor Cyan
Write-Host ""

# ── 1. Virtual environment ────────────────────────────────────────────────────
if (-not (Test-Path $BuildDir)) {
    Write-Host "Creating build virtual environment..." -ForegroundColor Yellow
    python -m venv $BuildDir
}

Write-Host "Upgrading pip..." -ForegroundColor Yellow
& $Python -m pip install --upgrade pip --quiet

# ── 2. Install all dependencies ───────────────────────────────────────────────
Write-Host "Installing dependencies..." -ForegroundColor Yellow
& $Pip install -r "$PSScriptRoot\requirements.txt" --quiet
& $Pip install pillow --quiet

# ── 3. Download logo and generate logo.ico ────────────────────────────────────
Write-Host "Downloading logo from Supabase and generating logo.ico..." -ForegroundColor Yellow
& $Python "$PSScriptRoot\make_icon.py" --supabase-url $LogoUrl

if (-not (Test-Path $IconPath)) {
    Write-Host "Logo download failed — falling back to generated amber icon..." -ForegroundColor Yellow
    & $Python "$PSScriptRoot\make_icon.py"
}

if (-not (Test-Path $IconPath)) {
    Write-Error "Could not create logo.ico. Check make_icon.py output above."
    exit 1
}

Write-Host "Icon ready: $IconPath" -ForegroundColor Green

# ── 4. PyInstaller ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Building VoicePasteSetup.exe..." -ForegroundColor Yellow
Write-Host "(First build may take a couple of minutes)" -ForegroundColor Gray
Write-Host ""

# Find the imageio_ffmpeg binaries path inside the venv
$FfmpegBinaries = "$BuildDir\Lib\site-packages\imageio_ffmpeg\binaries"
$FfmpegArg      = if (Test-Path $FfmpegBinaries) {
    "--add-binary `"$FfmpegBinaries\*;imageio_ffmpeg\binaries`""
} else {
    ""
}

$PyInstallerArgs = @(
    "--onefile",
    "--noconsole",
    "--name", "VoicePasteSetup",
    "--icon", $IconPath,
    "--hidden-import", "pynput.keyboard._win32",
    "--hidden-import", "pynput.mouse._win32",
    "--hidden-import", "pyautogui",
    "--hidden-import", "pyperclip",
    "--hidden-import", "sounddevice",
    "--clean"
)

if ($FfmpegArg) {
    $PyInstallerArgs += "--add-binary"
    $PyInstallerArgs += "$FfmpegBinaries\*;imageio_ffmpeg\binaries"
}

$PyInstallerArgs += "$PSScriptRoot\installer.py"

& $Python -m PyInstaller @PyInstallerArgs

# ── 5. Result ─────────────────────────────────────────────────────────────────
$Exe = "$PSScriptRoot\dist\VoicePasteSetup.exe"
if (Test-Path $Exe) {
    $SizeMB = [math]::Round((Get-Item $Exe).Length / 1MB, 1)
    Write-Host ""
    Write-Host "Build successful!" -ForegroundColor Green
    Write-Host "  Output: dist\VoicePasteSetup.exe  ($SizeMB MB)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Distribute dist\VoicePasteSetup.exe to your users." -ForegroundColor Cyan
    Write-Host "They just double-click it — no Python or dependencies needed." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Reminder: deploy app.py to Railway first so the backend is live." -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Error "Build failed — VoicePasteSetup.exe not found in dist\"
    exit 1
}
