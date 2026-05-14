import os
import time
from typing import Any, Optional

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

RUNPOD_API_KEY = os.environ.get("RUNPOD_API_KEY")
RUNPOD_ENDPOINT_ID = os.environ.get("RUNPOD_ENDPOINT_ID", "c5y5e4hr3v3496")
CLIENT_TOKEN = os.environ.get("CLIENT_TOKEN")

RUNPOD_RUN_URL = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/run"
RUNPOD_STATUS_URL_BASE = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/status"

POLL_SECONDS = float(os.environ.get("POLL_SECONDS", "1"))
MAX_WAIT_SECONDS = int(os.environ.get("MAX_WAIT_SECONDS", "120"))


def find_transcript(obj: Any) -> Optional[str]:
    """Find text in common RunPod response shapes."""
    if obj is None:
        return None

    if isinstance(obj, str):
        return obj.strip() or None

    if isinstance(obj, dict):
        for key in ["text", "transcript", "transcription", "result"]:
            value = obj.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

        if "output" in obj:
            found = find_transcript(obj["output"])
            if found:
                return found

        for value in obj.values():
            found = find_transcript(value)
            if found:
                return found

    if isinstance(obj, list):
        for item in obj:
            found = find_transcript(item)
            if found:
                return found

    return None


def require_config():
    if not RUNPOD_API_KEY:
        raise RuntimeError("Missing RUNPOD_API_KEY environment variable.")
    if not CLIENT_TOKEN:
        raise RuntimeError("Missing CLIENT_TOKEN environment variable.")


def check_client_token():
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {CLIENT_TOKEN}":
        return jsonify({"error": "Unauthorized"}), 401
    return None


@app.get("/health")
def health():
    return jsonify({"ok": True, "endpoint_id": RUNPOD_ENDPOINT_ID})


@app.post("/transcribe")
def transcribe():
    require_config()

    unauthorized = check_client_token()
    if unauthorized:
        return unauthorized

    payload = request.get_json(silent=True)
    if not payload or "input" not in payload:
        return jsonify({"error": "Expected JSON body with input.audio and input.filename"}), 400

    headers = {
        "Authorization": f"Bearer {RUNPOD_API_KEY}",
        "Content-Type": "application/json",
    }

    run_response = requests.post(
        RUNPOD_RUN_URL,
        headers=headers,
        json=payload,
        timeout=60,
    )
    run_response.raise_for_status()
    job = run_response.json()

    job_id = job.get("id")
    if not job_id:
        text = find_transcript(job)
        return jsonify({"text": text, "raw": job})

    deadline = time.time() + MAX_WAIT_SECONDS
    last_status = None

    while time.time() < deadline:
        status_response = requests.get(
            f"{RUNPOD_STATUS_URL_BASE}/{job_id}",
            headers=headers,
            timeout=30,
        )
        status_response.raise_for_status()
        result = status_response.json()
        last_status = result

        status = result.get("status")
        if status == "COMPLETED":
            text = find_transcript(result)
            return jsonify({"text": text, "raw": result})

        if status in {"FAILED", "CANCELLED", "TIMED_OUT"}:
            return jsonify({"error": f"RunPod job {status}", "raw": result}), 502

        time.sleep(POLL_SECONDS)

    return jsonify({"error": "Timed out waiting for RunPod", "raw": last_status}), 504


if __name__ == "__main__":
    # Local dev only. For production use gunicorn/waitress or deploy on Render/Fly/Railway.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
