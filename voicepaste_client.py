"""
VoicePaste Client — keyboard shortcut recorder that sends audio to the
VoicePaste backend server (app.py). The RunPod API key lives only on the
server; this exe stores nothing sensitive.

Settings are read from (in priority order):
  1. %APPDATA%\VoicePaste\settings.json   (primary, created by setup_voicepaste.ps1)
  2. Environment variables               (fallback for developers)
  3. Interactive setup dialog            (first-run fallback)

Required settings:
  server_url    — URL of the deployed Flask backend, e.g. https://foo.railway.app
  client_token  — Bearer token that protects the backend endpoint (NOT the RunPod key)

Optional settings:
  hotkey        — default: <ctrl>+<alt>+<space>
  verify_ssl    — default: true
"""

import json
import os
import sys
import time
import wave
import base64
import tempfile
import threading
import subprocess
from pathlib import Path
from typing import Any, Optional

import requests
import urllib3
import numpy as np
import sounddevice as sd
import pyperclip
import pyautogui
import imageio_ffmpeg
from pynput import keyboard as pynput_keyboard


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

SETTINGS_DIR = Path(os.environ.get("APPDATA", Path.home())) / "VoicePaste"
SETTINGS_FILE = SETTINGS_DIR / "settings.json"

_settings: dict = {}


def _load_settings_file() -> dict:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[VoicePaste] Warning: could not read settings file: {e}")
    return {}


def _settings_from_env() -> dict:
    out: dict = {}
    if os.environ.get("VOICEPASTE_SERVER_URL"):
        out["server_url"] = os.environ["VOICEPASTE_SERVER_URL"]
    if os.environ.get("VOICEPASTE_CLIENT_TOKEN"):
        out["client_token"] = os.environ["VOICEPASTE_CLIENT_TOKEN"]
    if os.environ.get("VOICEPASTE_HOTKEY"):
        out["hotkey"] = os.environ["VOICEPASTE_HOTKEY"]
    if os.environ.get("VOICEPASTE_VERIFY_SSL"):
        out["verify_ssl"] = os.environ["VOICEPASTE_VERIFY_SSL"].lower() == "true"
    return out


def _prompt_gui_setup() -> dict:
    """Show a simple tkinter dialog to collect server_url and client_token."""
    try:
        import tkinter as tk
        from tkinter import simpledialog, messagebox

        root = tk.Tk()
        root.withdraw()

        messagebox.showinfo(
            "VoicePaste — First-time setup",
            "No settings file found.\n\n"
            "You will be asked for:\n"
            "  1. Your backend server URL\n"
            "  2. Your client token\n\n"
            "These will be saved to:\n"
            f"  {SETTINGS_FILE}",
        )

        server_url = simpledialog.askstring(
            "VoicePaste Setup",
            "Backend server URL\n(e.g. https://voicepaste.railway.app)",
            parent=root,
        )
        if not server_url:
            messagebox.showerror("VoicePaste", "Setup cancelled. Exiting.")
            sys.exit(1)

        client_token = simpledialog.askstring(
            "VoicePaste Setup",
            "Client token (the password you set on the server):",
            parent=root,
            show="*",
        )
        if not client_token:
            messagebox.showerror("VoicePaste", "Setup cancelled. Exiting.")
            sys.exit(1)

        root.destroy()

        result = {
            "server_url": server_url.strip().rstrip("/"),
            "client_token": client_token.strip(),
        }

        SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
        print(f"[VoicePaste] Settings saved to {SETTINGS_FILE}")
        return result

    except Exception as e:
        print(f"[VoicePaste] GUI setup failed: {e}")
        sys.exit(1)


def load_config() -> None:
    global _settings

    file_cfg = _load_settings_file()
    env_cfg = _settings_from_env()

    # env vars override file, but file is the primary source
    _settings = {**file_cfg, **env_cfg}

    if not _settings.get("server_url") or not _settings.get("client_token"):
        _settings.update(_prompt_gui_setup())

    # Apply SSL setting
    verify = _settings.get("verify_ssl", True)
    if not verify:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def get(key: str, default=None):
    return _settings.get(key, default)


# ---------------------------------------------------------------------------
# Audio recording
# ---------------------------------------------------------------------------

SAMPLE_RATE = 16000
CHANNELS = 1

recording = False
frames: list = []
stream = None
lock = threading.Lock()


def _audio_callback(indata, frame_count, time_info, status):
    if status:
        print(status)
    with lock:
        frames.append(indata.copy())


def start_recording():
    global recording, frames, stream
    frames = []
    recording = True
    stream = sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype="int16",
        callback=_audio_callback,
    )
    stream.start()
    print("[VoicePaste] Recording... press the shortcut again to stop.")


def _write_wav(audio: np.ndarray) -> str:
    path = tempfile.mktemp(suffix=".wav")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio.tobytes())
    return path


def _convert_to_mp3(wav_path: str) -> str:
    mp3_path = tempfile.mktemp(suffix=".mp3")
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run(
        [ffmpeg, "-y", "-i", wav_path, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", mp3_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return mp3_path


# ---------------------------------------------------------------------------
# Backend communication
# ---------------------------------------------------------------------------

def _find_transcript(obj: Any) -> Optional[str]:
    if obj is None:
        return None
    if isinstance(obj, str):
        return obj.strip() or None
    if isinstance(obj, dict):
        for key in ["text", "transcript", "transcription", "result"]:
            v = obj.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
        for nested_key in ["output", "raw"]:
            if nested_key in obj:
                found = _find_transcript(obj[nested_key])
                if found:
                    return found
        for v in obj.values():
            found = _find_transcript(v)
            if found:
                return found
    if isinstance(obj, list):
        for item in obj:
            found = _find_transcript(item)
            if found:
                return found
    return None


def _send_to_backend(mp3_path: str) -> dict:
    server_url = get("server_url")
    client_token = get("client_token")
    verify_ssl = get("verify_ssl", True)

    with open(mp3_path, "rb") as f:
        audio_b64 = base64.b64encode(f.read()).decode("utf-8")

    print("[VoicePaste] Sending audio to backend...")
    response = requests.post(
        server_url.rstrip("/") + "/transcribe",
        headers={
            "Authorization": f"Bearer {client_token}",
            "Content-Type": "application/json",
        },
        json={"input": {"audio": audio_b64, "filename": "recording.mp3"}},
        timeout=180,
        verify=verify_ssl,
    )
    response.raise_for_status()
    return response.json()


# ---------------------------------------------------------------------------
# Recording → transcription → paste flow
# ---------------------------------------------------------------------------

def stop_and_paste():
    global recording, stream, frames

    recording = False
    if stream:
        stream.stop()
        stream.close()
        stream = None

    print("[VoicePaste] Stopped. Processing...")

    with lock:
        audio = np.concatenate(frames, axis=0) if frames else np.array([], dtype=np.int16)

    if audio.size == 0:
        print("[VoicePaste] No audio captured.")
        return

    wav_path = mp3_path = None
    try:
        wav_path = _write_wav(audio)
        mp3_path = _convert_to_mp3(wav_path)

        result = _send_to_backend(mp3_path)
        text = _find_transcript(result)

        if not text:
            print("[VoicePaste] Empty transcript. Server response:")
            print(result)
            return

        pyperclip.copy(text)
        time.sleep(0.25)
        pyautogui.hotkey("ctrl", "v")

        print(f"\n[VoicePaste] Pasted:\n{text}\n")

    except Exception as e:
        print(f"[VoicePaste] Error: {e}")

    finally:
        for path in [wav_path, mp3_path]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass


def toggle_recording():
    if not recording:
        start_recording()
    else:
        threading.Thread(target=stop_and_paste, daemon=True).start()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    load_config()

    hotkey = get("hotkey", "<ctrl>+<alt>+<space>")

    print()
    print("VoicePaste is running.")
    print(f"  Server : {get('server_url')}")
    print(f"  Hotkey : {hotkey}")
    print("  Press the hotkey once to start recording; again to stop, transcribe, and paste.")
    print()

    with pynput_keyboard.GlobalHotKeys({hotkey: toggle_recording}) as listener:
        listener.join()


if __name__ == "__main__":
    main()
