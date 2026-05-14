$ErrorActionPreference = "Stop"

if (-not $env:RUNPOD_API_KEY) {
  $env:RUNPOD_API_KEY = Read-Host "Paste your RunPod API key"
}

if (-not $env:CLIENT_TOKEN) {
  $env:CLIENT_TOKEN = Read-Host "Create a client token/password for your app"
}

if (-not $env:RUNPOD_ENDPOINT_ID) {
  $env:RUNPOD_ENDPOINT_ID = "c5y5e4hr3v3496"
}

python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
