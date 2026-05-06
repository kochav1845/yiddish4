import os
import io
import base64
import shutil
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

# RunPod Network Volume is mounted here when configured.
# Checkpoints are cached there so they survive across cold starts.
VOLUME_CKPT_DIR = f"/runpod-volume/ckpt/{CONFIG}"

MODEL_DIR = os.environ.get(
    "MODEL_DIR",
    os.path.join(REPO_DIR, "output", "ckpt", CONFIG),
)

# Figshare bulk download for REYD pretrained models (article 19350539).
# Figshare blocks cloud build IPs, so we download at container startup instead.
# Override with MODEL_DOWNLOAD_URL env var to use a mirror or direct file URL.
FIGSHARE_URL = "https://figshare.com/ndownloader/articles/19350539/versions/1"
MODEL_DOWNLOAD_URL = os.environ.get("MODEL_DOWNLOAD_URL", FIGSHARE_URL)

_model_ready = False
_restore_step = None


def _http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        return resp.read()


def _extract_checkpoints_from_zip(data: bytes, dest_dir: str):
    """
    Handle the Figshare zip structure:
      outer.zip
        pretrained_models.zip
          yivo_respelled/100000.pth.tar   <- what we want
          yivo_original/100000.pth.tar
          hasidic/100000.pth.tar
    Falls back to flat extraction if that structure is not found.
    """
    with zipfile.ZipFile(io.BytesIO(data)) as outer:
        names = outer.namelist()
        print(f"[TTS] Outer zip entries: {names}")

        # Look for a nested pretrained_models zip
        inner_name = next(
            (n for n in names if "pretrained_models" in n and n.endswith(".zip")),
            None,
        )

        if inner_name:
            print(f"[TTS] Found nested archive: {inner_name}")
            inner_data = outer.read(inner_name)
            with zipfile.ZipFile(io.BytesIO(inner_data)) as inner:
                for entry in inner.namelist():
                    if CONFIG in entry and entry.endswith(".pth.tar"):
                        basename = os.path.basename(entry)
                        out_path = os.path.join(dest_dir, basename)
                        print(f"[TTS] Extracting {entry} -> {out_path}")
                        with inner.open(entry) as src, open(out_path, "wb") as dst:
                            shutil.copyfileobj(src, dst)
        else:
            # Flat or direct structure - grab any matching .pth.tar
            for entry in names:
                if entry.endswith(".pth.tar") and (CONFIG in entry or "/" not in entry):
                    basename = os.path.basename(entry)
                    out_path = os.path.join(dest_dir, basename)
                    print(f"[TTS] Extracting {entry} -> {out_path}")
                    with outer.open(entry) as src, open(out_path, "wb") as dst:
                        shutil.copyfileobj(src, dst)


def download_checkpoints():
    url = MODEL_DOWNLOAD_URL.strip()
    if not url:
        return False

    print(f"[TTS] Downloading checkpoints from {url} ...")
    os.makedirs(MODEL_DIR, exist_ok=True)

    data = _http_get(url)
    print(f"[TTS] Downloaded {len(data):,} bytes")

    if zipfile.is_zipfile(io.BytesIO(data)):
        _extract_checkpoints_from_zip(data, MODEL_DIR)
    elif tarfile.is_tarfile(io.BytesIO(data)):
        with tarfile.open(fileobj=io.BytesIO(data)) as tf:
            for member in tf.getmembers():
                if member.name.endswith(".pth.tar") and CONFIG in member.name:
                    member.name = os.path.basename(member.name)
                    tf.extract(member, MODEL_DIR)
    else:
        # Raw .pth.tar file
        basename = os.path.basename(url.split("?")[0]) or "checkpoint.pth.tar"
        with open(os.path.join(MODEL_DIR, basename), "wb") as f:
            f.write(data)
        print(f"[TTS] Saved checkpoint to {MODEL_DIR}/{basename}")

    ckpts = glob.glob(os.path.join(MODEL_DIR, "*.pth.tar"))
    print(f"[TTS] Checkpoints in {MODEL_DIR}: {[os.path.basename(c) for c in ckpts]}")
    return bool(ckpts)


def _restore_from_volume():
    """Copy cached checkpoints from network volume to MODEL_DIR."""
    if not os.path.isdir(VOLUME_CKPT_DIR):
        return False
    ckpts = glob.glob(os.path.join(VOLUME_CKPT_DIR, "*.pth.tar"))
    if not ckpts:
        return False
    os.makedirs(MODEL_DIR, exist_ok=True)
    for src in ckpts:
        dst = os.path.join(MODEL_DIR, os.path.basename(src))
        if not os.path.exists(dst):
            shutil.copy2(src, dst)
            print(f"[TTS] Loaded from volume: {os.path.basename(src)}")
    return True


def _cache_to_volume():
    """Copy downloaded checkpoints to network volume for future cold starts."""
    try:
        os.makedirs(VOLUME_CKPT_DIR, exist_ok=True)
        for src in glob.glob(os.path.join(MODEL_DIR, "*.pth.tar")):
            dst = os.path.join(VOLUME_CKPT_DIR, os.path.basename(src))
            if not os.path.exists(dst):
                shutil.copy2(src, dst)
                print(f"[TTS] Cached to volume: {os.path.basename(src)}")
    except Exception as e:
        print(f"[TTS] Could not cache to volume: {e}")


def find_checkpoint_step():
    ckpts = glob.glob(os.path.join(MODEL_DIR, "*.pth.tar"))
    if not ckpts:
        raise RuntimeError(
            f"No checkpoints in {MODEL_DIR}. "
            "Set MODEL_DOWNLOAD_URL or mount a RunPod Network Volume."
        )
    steps = []
    for f in ckpts:
        try:
            steps.append(int(os.path.basename(f).replace(".pth.tar", "")))
        except ValueError:
            pass
    if not steps:
        raise RuntimeError(
            f"Could not parse step numbers from files in {MODEL_DIR}. "
            "Files must be named like '100000.pth.tar'."
        )
    return max(steps)


def ensure_model():
    global _model_ready, _restore_step
    if _model_ready:
        return

    ckpts = glob.glob(os.path.join(MODEL_DIR, "*.pth.tar"))
    if not ckpts:
        # Try network volume cache first (fast)
        if not _restore_from_volume():
            # Fall back to downloading from source
            download_checkpoints()
            _cache_to_volume()

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
