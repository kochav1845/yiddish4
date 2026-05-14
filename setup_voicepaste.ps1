#Requires -Version 5.1
<#
.SYNOPSIS
  First-time setup for VoicePaste.exe.

.DESCRIPTION
  Creates %APPDATA%\VoicePaste\settings.json with the backend server URL
  and client token. Run this once on each machine that will use VoicePaste.

  The RunPod API key is NOT required here — it lives only on the server.

.EXAMPLE
  .\setup_voicepaste.ps1
#>

$ErrorActionPreference = "Stop"

$SettingsDir  = "$env:APPDATA\VoicePaste"
$SettingsFile = "$SettingsDir\settings.json"

Write-Host ""
Write-Host "=== VoicePaste Setup ===" -ForegroundColor Cyan
Write-Host ""

# ── Server URL ────────────────────────────────────────────────────────────────
$defaultUrl = ""
if (Test-Path $SettingsFile) {
    try {
        $existing = Get-Content $SettingsFile -Raw | ConvertFrom-Json
        $defaultUrl = $existing.server_url
    } catch {}
}

$prompt = if ($defaultUrl) { "Backend server URL [$defaultUrl]" } else { "Backend server URL (e.g. https://voicepaste.railway.app)" }
$serverUrl = Read-Host $prompt
if (-not $serverUrl) { $serverUrl = $defaultUrl }
$serverUrl = $serverUrl.TrimEnd("/")

if (-not $serverUrl) {
    Write-Error "Server URL is required."
    exit 1
}

# ── Client token ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Client token — the bearer token that protects the backend endpoint." -ForegroundColor Gray
Write-Host "(This is NOT the RunPod API key. It is the CLIENT_TOKEN you set when deploying app.py.)" -ForegroundColor Gray
Write-Host ""
$clientToken = Read-Host "Client token"
if (-not $clientToken) {
    Write-Error "Client token is required."
    exit 1
}

# ── Hotkey ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Keyboard shortcut  (leave blank to keep default: <ctrl>+<alt>+<space>)" -ForegroundColor Gray
$hotkey = Read-Host "Hotkey"
if (-not $hotkey) { $hotkey = "<ctrl>+<alt>+<space>" }

# ── SSL ───────────────────────────────────────────────────────────────────────
$verifyInput = Read-Host "`nVerify SSL certificates? [Y/n]"
$verifySsl   = $verifyInput -notmatch "^[Nn]"

# ── Write settings ────────────────────────────────────────────────────────────
if (-not (Test-Path $SettingsDir)) {
    New-Item -ItemType Directory -Path $SettingsDir | Out-Null
}

$settings = [ordered]@{
    server_url   = $serverUrl
    client_token = $clientToken
    hotkey       = $hotkey
    verify_ssl   = $verifySsl
}

$settings | ConvertTo-Json -Depth 3 | Set-Content -Path $SettingsFile -Encoding UTF8

Write-Host ""
Write-Host "Settings saved to:" -ForegroundColor Green
Write-Host "  $SettingsFile" -ForegroundColor Green
Write-Host ""
Write-Host "Settings:" -ForegroundColor Cyan
Write-Host "  server_url   : $serverUrl"
Write-Host "  client_token : $('*' * $clientToken.Length)"
Write-Host "  hotkey       : $hotkey"
Write-Host "  verify_ssl   : $verifySsl"
Write-Host ""
Write-Host "You can now run VoicePaste.exe." -ForegroundColor Cyan
Write-Host ""

# Optional: test the connection
$test = Read-Host "Test connection to server now? [Y/n]"
if ($test -notmatch "^[Nn]") {
    try {
        $resp = Invoke-WebRequest -Uri "$serverUrl/health" -Headers @{ Authorization = "Bearer $clientToken" } -UseBasicParsing -TimeoutSec 10
        $body = $resp.Content | ConvertFrom-Json
        if ($body.ok) {
            Write-Host "Connection OK — server is reachable." -ForegroundColor Green
        } else {
            Write-Host "Server responded but returned unexpected body:" -ForegroundColor Yellow
            Write-Host $resp.Content
        }
    } catch {
        Write-Host "Connection failed: $_" -ForegroundColor Red
        Write-Host "Check that the server URL is correct and the server is running." -ForegroundColor Yellow
    }
}

Write-Host ""
