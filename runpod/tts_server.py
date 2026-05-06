import os
import base64
import subprocess
import tempfile
import traceback
import glob
import tarfile
import zipfile
import urllib.request
import runpod

REPO_DIR = "/app/FastSpeech2"
CONFIG = "yivo_respelled"

MODEL_DIR = os.environ.get(
    "MODEL_DIR",
    os.path.join(REPO_DIR, "output", "ckpt", CONFIG),
)

# Optional: set this to a direct URL to a .tar.gz, .zip, or .pth.tar file
# containing the checkpoint(s). The server will download and extract on startup
# when the checkpoint directory is empty.
MODEL_DOWNLOAD_URL = os.environ.get("MODEL_DOWNLOAD_URL", "")

_model_ready = False
_restore_step = None


def download_checkpoints():
    url = MODEL_DOWNLOAD_URL.strip()
    if not url:
        return False

    print(f"[TTS] Downloading checkpoints from {url} ...")
    os.makedirs(MODEL_DIR, exist_ok=True)

    tmp_path, _ = urllib.request.urlretrieve(url)

    try:
        if url.endswith(".tar.gz") or url.endswith(".tgz") or tarfile.is_tarfile(tmp_path):
            with tarfile.open(tmp_path) as tf:
                # Extract only .pth.tar files (and any member files) flat into MODEL_DIR
                for member in tf.getmembers():
                    member.name = os.path.basename(member.name)
                    if not member.name:
                        continue
                    tf.extract(member, MODEL_DIR)
            print(f"[TTS] Extracted tar archive to {MODEL_DIR}")
        elif url.endswith(".zip") or zipfile.is_zipfile(tmp_path):
            with zipfile.ZipFile(tmp_path) as zf:
                for name in zf.namelist():
                    basename = os.path.basename(name)
                    if not basename:
                        continue
                    with zf.open(name) as src, open(os.path.join(MODEL_DIR, basename), "wb") as dst:
                        dst.write(src.read())
            print(f"[TTS] Extracted zip archive to {MODEL_DIR}")
        else:
            # Assume it's a raw .pth.tar checkpoint file
            basename = os.path.basename(url.split("?")[0]) or "checkpoint.pth.tar"
            dest = os.path.join(MODEL_DIR, basename)
            os.rename(tmp_path, dest)
            print(f"[TTS] Saved checkpoint to {dest}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return True


def find_checkpoint_step():
    ckpts = glob.glob(os.path.join(MODEL_DIR, "*.pth.tar"))
    if not ckpts:
        raise RuntimeError(
            f"No checkpoints found in {MODEL_DIR}. "
            "Set MODEL_DIR to the directory containing .pth.tar files, "
            "or set MODEL_DOWNLOAD_URL to a downloadable archive/checkpoint."
        )
    steps = []
    for f in ckpts:
        try:
            steps.append(int(os.path.basename(f).replace(".pth.tar", "")))
        except ValueError:
            pass
    if not steps:
        raise RuntimeError(
            f"Found files in {MODEL_DIR} but could not parse step numbers from filenames. "
            "Checkpoint files must be named like '900000.pth.tar'."
        )
    return max(steps)


def ensure_model():
    global _model_ready, _restore_step
    if _model_ready:
        return

    # If directory is missing or empty, attempt download
    ckpts = glob.glob(os.path.join(MODEL_DIR, "*.pth.tar"))
    if not ckpts:
        if MODEL_DOWNLOAD_URL:
            download_checkpoints()
        else:
            # Print helpful diagnostics
            print(f"[TTS] MODEL_DIR contents ({MODEL_DIR}):")
            if os.path.isdir(MODEL_DIR):
                for f in os.listdir(MODEL_DIR):
                    print(f"  {f}")
            else:
                print("  (directory does not exist)")
            print("[TTS] Tip: set MODEL_DOWNLOAD_URL or mount a network volume with the checkpoints.")

    _restore_step = find_checkpoint_step()
    print(f"[TTS] Using checkpoint step {_restore_step} from {MODEL_DIR}")
    _model_ready = True


try:
    ensure_model()
    print("[TTS] Model ready at startup.")
except Exception as e:
    print(f"[TTS] WARNING: Model not available at startup: {e}")


def synthesize_text(text: str, speaker_id: int = 0) -> bytes:
    ensure_model()
    out_dir = tempfile.mkdtemp()
    cmd = [
        "python", "synthesize.py",
        "--text", text,
        "--speaker_id", str(speaker_id),
        "--restore_step", str(_restore_step),
        "--mode", "single",
        "--config", f"./config/{CONFIG}/model.yaml",
        "--result_path", out_dir,
    ]
    proc = subprocess.run(cmd, cwd=REPO_DIR, capture_output=True, timeout=120)
    if proc.returncode != 0:
        err = proc.stderr.decode(errors="replace")[:600]
        raise RuntimeError(f"FastSpeech2 failed (exit {proc.returncode}):\n{err}")
    wavs = (
        glob.glob(os.path.join(out_dir, "**", "*.wav"), recursive=True)
        or glob.glob(os.path.join(out_dir, "*.wav"))
    )
    if not wavs:
        raise RuntimeError("No WAV output found")
    with open(wavs[0], "rb") as fh:
        return fh.read()


def handler(job):
    job_input = job.get("input", {})
    text = job_input.get("text", "").strip()
    speaker_id = int(job_input.get("speaker_id", 0))
    if not text:
        return {"error": "No text provided"}
    if speaker_id not in (0, 1, 2):
        return {"error": "speaker_id must be 0, 1, or 2"}
    try:
        wav_bytes = synthesize_text(text, speaker_id)
        return {
            "audio_b64": base64.b64encode(wav_bytes).decode("utf-8"),
            "format": "wav",
            "speaker_id": speaker_id,
        }
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}


runpod.serverless.start({"handler": handler})
