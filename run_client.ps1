import os
import time
import wave
import base64
import tempfile
import threading
import subprocess
from typing import Any, Optional

import requests
import urllib3
import numpy as np
import sounddevice as sd
import pyperclip
import pyautogui
import imageio_ffmpeg
from pynput import keyboard

# Useful if the user's Windows certificate store causes Python SSL issues.
# Set VERIFY_SSL to "true" when your computer verifies HTTPS correctly.
VERIFY_SSL = os.environ.get("VOICEPASTE_VERIFY_SSL", "false").lower() == "true"
if not VERIFY_SSL:
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Default shortcut. Avoid Ctrl+A and Win+A because Windows/apps already use them.
# Good options:
#   "<ctrl>+<alt>+<space>"
#   "<ctrl>+<shift>+<space>"
#   "<ctrl>+<alt>+v"
HOTKEY = os.environ.get("VOICEPASTE_HOTKEY", "<ctrl>+<alt>+<space>")

SERVER_URL = os.environ.get("VOICEPASTE_SERVER_URL")
CLIENT_TOKEN = os.environ.get("VOICEPASTE_CLIENT_TOKEN")

SAMPLE_RATE = 16000
CHANNELS = 1
FILENAME = "recording.mp3"

recording = False
frames = []
stream = None
lock = threading.Lock()


def require_config():
    if not SERVER_URL:
        raise RuntimeError("Missing VOICEPASTE_SERVER_URL environment variable.")
    if not CLIENT_TOKEN:
        raise RuntimeError("Missing VOICEPASTE_CLIENT_TOKEN environment variable.")


def callback(indata, frame_count, time_info, status):
    global frames
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
        callback=callback,
    )
    stream.start()

    print("Recording... press the shortcut again to stop.")


def write_wav_file(audio):
    temp_path = tempfile.mktemp(suffix=".wav")

    with wave.open(temp_path, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio.tobytes())

    return temp_path


def convert_wav_to_mp3(wav_path):
    mp3_path = tempfile.mktemp(suffix=".mp3")
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

    cmd = [
        ffmpeg,
        "-y",
        "-i", wav_path,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-b:a", "64k",
        mp3_path,
    ]

    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return mp3_path


def find_transcript(obj: Any) -> Optional[str]:
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

        if "raw" in obj:
            found = find_transcript(obj["raw"])
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


def send_to_backend(mp3_path):
    with open(mp3_path, "rb") as f:
        audio_b64 = base64.b64encode(f.read()).decode("utf-8")

    payload = {
        "input": {
            "audio": audio_b64,
            "filename": FILENAME,
        }
    }

    headers = {
        "Authorization": f"Bearer {CLIENT_TOKEN}",
        "Content-Type": "application/json",
    }

    print("Sending MP3 to your backend...")

    response = requests.post(
        SERVER_URL.rstrip("/") + "/transcribe",
        headers=headers,
        json=payload,
        timeout=180,
        verify=VERIFY_SSL,
    )
    response.raise_for_status()
    return response.json()


def stop_recording_and_paste():
    global recording, stream, frames

    recording = False

    if stream:
        stream.stop()
        stream.close()
        stream = None

    print("Stopped recording.")

    with lock:
        audio = np.concatenate(frames, axis=0) if frames else np.array([], dtype=np.int16)

    if audio.size == 0:
        print("No audio recorded.")
        return

    wav_path = None
    mp3_path = None

    try:
        wav_path = write_wav_file(audio)
        print("Converting to MP3...")
        mp3_path = convert_wav_to_mp3(wav_path)

        result = send_to_backend(mp3_path)
        text = find_transcript(result)

        if not text:
            print("Could not find transcript in backend response:")
            print(result)
            return

        pyperclip.copy(text)
        time.sleep(0.25)
        pyautogui.hotkey("ctrl", "v")

        print("")
        print("Pasted:")
        print(text)
        print("")

    except Exception as e:
        print("Error:", e)

    finally:
        for path in [wav_path, mp3_path]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass


def toggle_recording():
    global recording

    if not recording:
        start_recording()
    else:
        threading.Thread(target=stop_recording_and_paste, daemon=True).start()


def main():
    require_config()

    print("")
    print("VoicePaste Secure Client is running.")
    print("Click into any text box.")
    print(f"Shortcut: {HOTKEY}")
    print("Press once to start recording; press again to stop, transcribe, and paste.")
    print("")

    with keyboard.GlobalHotKeys({HOTKEY: toggle_recording}) as listener:
        listener.join()


if __name__ == "__main__":
    main()
