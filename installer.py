"""
VoicePaste — combined installer + keyboard-shortcut client.

First run (no settings file found):
  → Shows a tkinter setup wizard
  → Installs itself to %LOCALAPPDATA%\VoicePaste\VoicePaste.exe
  → Creates a Desktop shortcut
  → Optionally adds to Windows startup
  → Saves %APPDATA%\VoicePaste\settings.json
  → Starts the hotkey listener

Subsequent runs:
  → Reads settings.json
  → Starts the hotkey listener directly

The RunPod API key is NEVER stored or read by this program.
Only server_url (public backend URL) and client_token (simple bearer password)
are stored in the settings file.
"""

import json
import os
import sys
import shutil
import subprocess
import threading
import time
import wave
import base64
import tempfile
import winreg
from pathlib import Path
from typing import Any, Optional

# ── Optional rich imports (may fail before venv is ready) ────────────────────
try:
    import requests
    import urllib3
    import numpy as np
    import sounddevice as sd
    import pyperclip
    import pyautogui
    import imageio_ffmpeg
    from pynput import keyboard as pynput_keyboard
    _CLIENT_DEPS_OK = True
except ImportError as _e:
    _CLIENT_DEPS_OK = False
    _CLIENT_DEPS_ERROR = str(_e)


# ── Paths ─────────────────────────────────────────────────────────────────────

INSTALL_DIR   = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "VoicePaste"
INSTALL_EXE   = INSTALL_DIR / "VoicePaste.exe"
SETTINGS_DIR  = Path(os.environ.get("APPDATA", Path.home())) / "VoicePaste"
SETTINGS_FILE = SETTINGS_DIR / "settings.json"
DESKTOP       = Path.home() / "Desktop"
STARTUP_KEY   = r"Software\Microsoft\Windows\CurrentVersion\Run"
APP_NAME      = "VoicePaste"


# ── Settings ──────────────────────────────────────────────────────────────────

_settings: dict = {}


def _load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_settings(data: dict) -> None:
    SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def _is_first_run() -> bool:
    return not SETTINGS_FILE.exists() or not _load_settings().get("server_url")


# ── Installation helpers ───────────────────────────────────────────────────────

def _is_running_from_install_dir() -> bool:
    try:
        return Path(sys.executable).resolve().parent == INSTALL_DIR.resolve()
    except Exception:
        return False


def _install_self() -> bool:
    """Copy this exe to the install directory. Returns True on success."""
    src = Path(sys.executable).resolve()
    if src == INSTALL_EXE.resolve():
        return True  # already installed

    INSTALL_DIR.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copy2(src, INSTALL_EXE)
        return True
    except Exception as e:
        print(f"[VoicePaste] Warning: could not copy to install dir: {e}")
        return False


def _create_shortcut(target: Path, shortcut_path: Path, description: str = "") -> None:
    ps = f"""
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("{shortcut_path}")
$Shortcut.TargetPath = "{target}"
$Shortcut.Description = "{description}"
$Shortcut.WorkingDirectory = "{target.parent}"
$Shortcut.Save()
""".strip()
    subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _add_to_startup(exe_path: Path) -> None:
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, STARTUP_KEY, 0, winreg.KEY_SET_VALUE
        )
        winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, str(exe_path))
        winreg.CloseKey(key)
    except Exception as e:
        print(f"[VoicePaste] Warning: could not add to startup: {e}")


def _remove_from_startup() -> None:
    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, STARTUP_KEY, 0, winreg.KEY_SET_VALUE
        )
        winreg.DeleteValue(key, APP_NAME)
        winreg.CloseKey(key)
    except FileNotFoundError:
        pass
    except Exception as e:
        print(f"[VoicePaste] Warning: could not remove from startup: {e}")


# ── Setup wizard (tkinter) ─────────────────────────────────────────────────────

def _run_setup_wizard() -> dict:
    import tkinter as tk
    from tkinter import ttk, messagebox

    result: dict = {}
    win = tk.Tk()
    win.title("VoicePaste — Setup")
    win.resizable(False, False)
    win.configure(bg="#1c1917")

    AMBER   = "#f59e0b"
    DARK_BG = "#1c1917"
    CARD_BG = "#292524"
    FG      = "#fafaf9"
    SUB_FG  = "#a8a29e"

    win.tk_setPalette(background=DARK_BG, foreground=FG)

    # ── Header ────────────────────────────────────────────────────────────────
    hdr = tk.Frame(win, bg=AMBER, padx=24, pady=16)
    hdr.pack(fill="x")
    tk.Label(hdr, text="VoicePaste", font=("Segoe UI", 20, "bold"),
             bg=AMBER, fg="#1c1917").pack(anchor="w")
    tk.Label(hdr, text="Yiddish speech-to-text keyboard shortcut",
             font=("Segoe UI", 10), bg=AMBER, fg="#78350f").pack(anchor="w")

    # ── Body ──────────────────────────────────────────────────────────────────
    body = tk.Frame(win, bg=DARK_BG, padx=28, pady=20)
    body.pack(fill="both", expand=True)

    def field(parent, label_text: str, placeholder: str = "", show: str = "") -> tk.Entry:
        tk.Label(parent, text=label_text, font=("Segoe UI", 9, "bold"),
                 bg=DARK_BG, fg=SUB_FG).pack(anchor="w", pady=(10, 2))
        e = tk.Entry(parent, font=("Segoe UI", 11), bg=CARD_BG, fg=FG,
                     insertbackground=AMBER, relief="flat",
                     highlightthickness=1, highlightbackground="#44403c",
                     highlightcolor=AMBER, show=show, width=44)
        e.pack(fill="x", ipady=6)
        if placeholder:
            e.insert(0, placeholder)
            e.config(fg=SUB_FG)
            def on_focus_in(event, ent=e, ph=placeholder):
                if ent.get() == ph:
                    ent.delete(0, "end")
                    ent.config(fg=FG)
            def on_focus_out(event, ent=e, ph=placeholder):
                if not ent.get():
                    ent.insert(0, ph)
                    ent.config(fg=SUB_FG)
            e.bind("<FocusIn>", on_focus_in)
            e.bind("<FocusOut>", on_focus_out)
        return e

    tk.Label(body, text="Enter your backend details below.\n"
             "The RunPod API key is never stored here — only the server URL and\n"
             "a simple bearer token that protects your endpoint.",
             font=("Segoe UI", 9), bg=DARK_BG, fg=SUB_FG, justify="left").pack(anchor="w")

    ent_url   = field(body, "Backend server URL", "https://your-backend.railway.app")
    ent_token = field(body, "Client token (bearer password)", show="")

    # ── Hotkey ────────────────────────────────────────────────────────────────
    tk.Label(body, text="Keyboard shortcut", font=("Segoe UI", 9, "bold"),
             bg=DARK_BG, fg=SUB_FG).pack(anchor="w", pady=(10, 2))
    hotkey_var = tk.StringVar(value="<ctrl>+<alt>+<space>")
    hotkey_options = [
        "<ctrl>+<alt>+<space>",
        "<ctrl>+<shift>+<space>",
        "<ctrl>+<alt>+v",
        "<ctrl>+<alt>+y",
    ]
    ddl = ttk.Combobox(body, textvariable=hotkey_var, values=hotkey_options,
                       font=("Segoe UI", 11), state="normal", width=42)
    ddl.pack(fill="x", ipady=4)

    # ── Options ───────────────────────────────────────────────────────────────
    opts = tk.Frame(body, bg=DARK_BG)
    opts.pack(fill="x", pady=(14, 0))

    shortcut_var = tk.BooleanVar(value=True)
    startup_var  = tk.BooleanVar(value=True)

    def chk(parent, text, var):
        tk.Checkbutton(parent, text=text, variable=var,
                       font=("Segoe UI", 9), bg=DARK_BG, fg=FG,
                       activebackground=DARK_BG, activeforeground=AMBER,
                       selectcolor=CARD_BG).pack(anchor="w")

    chk(opts, "Create Desktop shortcut", shortcut_var)
    chk(opts, "Start VoicePaste automatically when Windows starts", startup_var)

    # ── Error label ───────────────────────────────────────────────────────────
    err_lbl = tk.Label(body, text="", font=("Segoe UI", 9),
                       bg=DARK_BG, fg="#f87171")
    err_lbl.pack(anchor="w", pady=(8, 0))

    # ── Install button ────────────────────────────────────────────────────────
    def on_install():
        url   = ent_url.get().strip()
        token = ent_token.get().strip()

        placeholder = "https://your-backend.railway.app"
        if url == placeholder or not url:
            err_lbl.config(text="Please enter the backend server URL.")
            return
        if not token:
            err_lbl.config(text="Please enter the client token.")
            return

        result["server_url"]  = url.rstrip("/")
        result["client_token"] = token
        result["hotkey"]      = hotkey_var.get() or "<ctrl>+<alt>+<space>"
        result["verify_ssl"]  = True
        result["create_shortcut"] = shortcut_var.get()
        result["add_startup"]     = startup_var.get()
        win.destroy()

    btn = tk.Button(body, text="Install VoicePaste",
                    font=("Segoe UI", 11, "bold"), bg=AMBER, fg="#1c1917",
                    activebackground="#d97706", activeforeground="#1c1917",
                    relief="flat", cursor="hand2", padx=20, pady=10,
                    command=on_install)
    btn.pack(pady=(18, 4))

    tk.Label(body, text="You can change these settings later by editing\n"
             f"%APPDATA%\\VoicePaste\\settings.json",
             font=("Segoe UI", 8), bg=DARK_BG, fg=SUB_FG).pack()

    # ── Center window ─────────────────────────────────────────────────────────
    win.update_idletasks()
    w, h = win.winfo_reqwidth(), win.winfo_reqheight()
    sw, sh = win.winfo_screenwidth(), win.winfo_screenheight()
    win.geometry(f"{w}x{h}+{(sw - w) // 2}+{(sh - h) // 2}")

    win.mainloop()

    if not result:
        sys.exit(0)

    return result


def _show_success(hotkey: str) -> None:
    import tkinter as tk

    win = tk.Tk()
    win.title("VoicePaste — Installed")
    win.resizable(False, False)
    win.configure(bg="#1c1917")

    hdr = tk.Frame(win, bg="#16a34a", padx=24, pady=14)
    hdr.pack(fill="x")
    tk.Label(hdr, text="VoicePaste installed!", font=("Segoe UI", 16, "bold"),
             bg="#16a34a", fg="white").pack(anchor="w")

    body = tk.Frame(win, bg="#1c1917", padx=28, pady=20)
    body.pack(fill="both", expand=True)

    tk.Label(body,
             text=f"VoicePaste is now running in the background.\n\n"
                  f"Shortcut: {hotkey}\n"
                  f"Press once to start recording.\n"
                  f"Press again to stop, transcribe, and paste.",
             font=("Segoe UI", 10), bg="#1c1917", fg="#fafaf9",
             justify="left").pack(anchor="w")

    tk.Button(body, text="Got it", font=("Segoe UI", 10, "bold"),
              bg="#f59e0b", fg="#1c1917", relief="flat", cursor="hand2",
              padx=16, pady=8, command=win.destroy).pack(pady=(16, 0))

    win.update_idletasks()
    w, h = win.winfo_reqwidth(), win.winfo_reqheight()
    sw, sh = win.winfo_screenwidth(), win.winfo_screenheight()
    win.geometry(f"{w}x{h}+{(sw - w) // 2}+{(sh - h) // 2}")

    win.mainloop()


# ── Audio recording + transcription client ────────────────────────────────────

SAMPLE_RATE = 16000
CHANNELS    = 1

_recording = False
_frames: list = []
_stream = None
_lock = threading.Lock()


def _audio_callback(indata, frame_count, time_info, status):
    if status:
        print(status)
    with _lock:
        _frames.append(indata.copy())


def _start_recording():
    global _recording, _frames, _stream
    _frames = []
    _recording = True
    _stream = sd.InputStream(
        samplerate=SAMPLE_RATE, channels=CHANNELS,
        dtype="int16", callback=_audio_callback,
    )
    _stream.start()
    print("[VoicePaste] Recording... press the shortcut again to stop.")


def _write_wav(audio: np.ndarray) -> str:
    path = tempfile.mktemp(suffix=".wav")
    with wave.open(path, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio.tobytes())
    return path


def _to_mp3(wav_path: str) -> str:
    mp3 = tempfile.mktemp(suffix=".mp3")
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run(
        [ffmpeg, "-y", "-i", wav_path, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", mp3],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return mp3


def _find_transcript(obj: Any) -> Optional[str]:
    if obj is None:
        return None
    if isinstance(obj, str):
        return obj.strip() or None
    if isinstance(obj, dict):
        for k in ["text", "transcript", "transcription", "result"]:
            v = obj.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        for k in ["output", "raw"]:
            if k in obj:
                r = _find_transcript(obj[k])
                if r:
                    return r
        for v in obj.values():
            r = _find_transcript(v)
            if r:
                return r
    if isinstance(obj, list):
        for item in obj:
            r = _find_transcript(item)
            if r:
                return r
    return None


def _send(mp3_path: str) -> dict:
    server_url   = _settings.get("server_url", "")
    client_token = _settings.get("client_token", "")
    verify_ssl   = _settings.get("verify_ssl", True)

    with open(mp3_path, "rb") as f:
        audio_b64 = base64.b64encode(f.read()).decode()

    print("[VoicePaste] Sending to server...")
    r = requests.post(
        server_url.rstrip("/") + "/transcribe",
        headers={"Authorization": f"Bearer {client_token}", "Content-Type": "application/json"},
        json={"input": {"audio": audio_b64, "filename": "recording.mp3"}},
        timeout=180,
        verify=verify_ssl,
    )
    r.raise_for_status()
    return r.json()


def _stop_and_paste():
    global _recording, _stream, _frames

    _recording = False
    if _stream:
        _stream.stop()
        _stream.close()
        _stream = None

    print("[VoicePaste] Stopped. Processing...")

    with _lock:
        audio = np.concatenate(_frames, axis=0) if _frames else np.array([], dtype=np.int16)

    if audio.size == 0:
        print("[VoicePaste] No audio captured.")
        return

    wav_path = mp3_path = None
    try:
        wav_path = _write_wav(audio)
        mp3_path = _to_mp3(wav_path)
        result   = _send(mp3_path)
        text     = _find_transcript(result)

        if not text:
            print("[VoicePaste] Empty transcript. Response:", result)
            return

        pyperclip.copy(text)
        time.sleep(0.25)
        pyautogui.hotkey("ctrl", "v")
        print(f"\n[VoicePaste] Pasted:\n{text}\n")

    except Exception as e:
        print(f"[VoicePaste] Error: {e}")

    finally:
        for p in [wav_path, mp3_path]:
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass


def _toggle():
    if not _recording:
        _start_recording()
    else:
        threading.Thread(target=_stop_and_paste, daemon=True).start()


def _run_client():
    if not _CLIENT_DEPS_OK:
        import tkinter.messagebox as mb
        mb.showerror("VoicePaste", f"Missing dependency: {_CLIENT_DEPS_ERROR}\n\nRe-run the installer.")
        sys.exit(1)

    verify = _settings.get("verify_ssl", True)
    if not verify:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    hotkey = _settings.get("hotkey", "<ctrl>+<alt>+<space>")
    print()
    print("VoicePaste is running.")
    print(f"  Server : {_settings.get('server_url')}")
    print(f"  Hotkey : {hotkey}")
    print("  Press the hotkey to start recording; press again to stop and paste.")
    print()

    with pynput_keyboard.GlobalHotKeys({hotkey: _toggle}) as listener:
        listener.join()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    global _settings

    first_run = _is_first_run()

    if first_run:
        cfg = _run_setup_wizard()

        # Install exe to AppData\Local\VoicePaste\
        installed_ok = _install_self()
        target_exe   = INSTALL_EXE if installed_ok else Path(sys.executable)

        # Desktop shortcut
        if cfg.get("create_shortcut"):
            _create_shortcut(
                target   = target_exe,
                shortcut_path = DESKTOP / "VoicePaste.lnk",
                description   = "VoicePaste — Yiddish speech-to-text",
            )

        # Windows startup
        if cfg.get("add_startup"):
            _add_to_startup(target_exe)

        # Save settings (strip installer-only keys)
        settings_to_save = {
            k: v for k, v in cfg.items()
            if k not in ("create_shortcut", "add_startup")
        }
        _save_settings(settings_to_save)
        _settings = settings_to_save

        # If we installed to a new location, launch from there and exit
        if installed_ok and not _is_running_from_install_dir():
            _show_success(cfg.get("hotkey", "<ctrl>+<alt>+<space>"))
            subprocess.Popen(
                [str(INSTALL_EXE)],
                creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
            )
            sys.exit(0)
        else:
            _show_success(cfg.get("hotkey", "<ctrl>+<alt>+<space>"))

    else:
        _settings = _load_settings()

    _run_client()


if __name__ == "__main__":
    main()
