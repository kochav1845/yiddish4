"""
REYD Yiddish TTS - RunPod Serverless Handler

Checkpoints are downloaded from Figshare on first startup.
If a RunPod Network Volume is mounted at /runpod-volume, checkpoints
are cached there and reused on subsequent cold starts.

Environment variables:
  MODEL_DOWNLOAD_URL  Override the default Figshare download URL
  MODEL_DIR           Override the checkpoint directory
"""

import os
import io
import sys
import base64
import shutil
import subprocess
import tempfile
import traceback
import glob
import zipfile
import tarfile
import runpod

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_DIR = "/app/FastSpeech2"
CONFIG = "yivo_respelled"
MODEL_DIR = os.environ.get(
    "MODEL_DIR",
    os.path.join(REPO_DIR, "output", "ckpt", CONFIG),
)
VOLUME_CKPT_DIR = f"/runpod-volume/ckpt/{CONFIG}"

# Figshare ndownloader for article 19350539 (REYD pretrained models).
# Override via env var to point at a mirror or direct .pth.tar URL.
DEFAULT_URL = "https://figshare.com/ndownloader/articles/19350539/versions/1"
MODEL_DOWNLOAD_URL = os.environ.get("MODEL_DOWNLOAD_URL", DEFAULT_URL).strip()

_restore_step: int | None = None

# ---------------------------------------------------------------------------
# Download helpers
# ---------------------------------------------------------------------------

def curl_download(url: str, dest: str) -> None:
    """Download url to dest using curl. Follows redirects, retries 3 times."""
    print(f"[TTS] curl → {url}")
    cmd = [
        "curl", "-fSL",
        "--retry", "3",
        "--retry-delay", "5",
        "--max-time", "600",
        "-A", "Mozilla/5.0 (compatible; REYD-TTS/1.0)",
        "-o", dest,
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"curl failed (exit {result.returncode}):\n"
            f"stdout: {result.stdout[:400]}\n"
            f"stderr: {result.stderr[:400]}"
        )
    size = os.path.getsize(dest)
    print(f"[TTS] Downloaded {size:,} bytes → {dest}")


# ---------------------------------------------------------------------------
# Zip extraction helpers
# ---------------------------------------------------------------------------

def _collect_pth_tar(zf: zipfile.ZipFile, prefix: str = "") -> list[str]:
    """Return all zip entries that are .pth.tar files."""
    return [n for n in zf.namelist() if n.endswith(".pth.tar")]


def _extract_from_zip(zip_path: str, dest_dir: str) -> list[str]:
    """
    Extract all .pth.tar files that belong to CONFIG from a zip archive.
    Handles nested zips (e.g. outer.zip → pretrained_models.zip → ckpt files).
    Returns list of extracted destination paths.
    """
    extracted = []
    os.makedirs(dest_dir, exist_ok=True)

    with zipfile.ZipFile(zip_path) as outer:
        all_entries = outer.namelist()
        print(f"[TTS] Zip entries ({len(all_entries)}): {all_entries[:30]}")

        # 1. Direct .pth.tar entries in outer zip
        direct = [n for n in all_entries if n.endswith(".pth.tar")]
        if direct:
            print(f"[TTS] Direct .pth.tar entries: {direct}")
            for entry in direct:
                if CONFIG in entry or len(direct) == 1:
                    _write_entry(outer, entry, dest_dir, extracted)

        # 2. Nested zip files
        nested_zips = [n for n in all_entries if n.endswith(".zip")]
        for nz_name in nested_zips:
            print(f"[TTS] Inspecting nested zip: {nz_name}")
            nz_data = outer.read(nz_name)
            try:
                with zipfile.ZipFile(io.BytesIO(nz_data)) as inner:
                    inner_entries = inner.namelist()
                    print(f"[TTS]   inner entries: {inner_entries[:20]}")
                    pth_entries = [e for e in inner_entries if e.endswith(".pth.tar")]
                    for entry in pth_entries:
                        if CONFIG in entry or len(pth_entries) == 1:
                            _write_entry(inner, entry, dest_dir, extracted)
            except zipfile.BadZipFile:
                print(f"[TTS]   Skipping {nz_name}: not a valid zip")

    return extracted


def _write_entry(zf: zipfile.ZipFile, entry: str, dest_dir: str, collected: list) -> None:
    basename = os.path.basename(entry)
    if not basename:
        return
    dest = os.path.join(dest_dir, basename)
    print(f"[TTS] Extracting {entry} → {dest}")
    with zf.open(entry) as src, open(dest, "wb") as dst:
        shutil.copyfileobj(src, dst)
    collected.append(dest)


def _extract_from_tar(tar_path: str, dest_dir: str) -> list[str]:
    """Extract .pth.tar files that match CONFIG from a tar archive."""
    extracted = []
    os.makedirs(dest_dir, exist_ok=True)
    with tarfile.open(tar_path) as tf:
        members = tf.getmembers()
        print(f"[TTS] Tar entries ({len(members)}): {[m.name for m in members[:20]]}")
        for member in members:
            if member.name.endswith(".pth.tar") and (CONFIG in member.name or True):
                member.name = os.path.basename(member.name)
                tf.extract(member, dest_dir)
                extracted.append(os.path.join(dest_dir, member.name))
                print(f"[TTS] Extracted (tar): {member.name}")
    return extracted


# ---------------------------------------------------------------------------
# Main download orchestration
# ---------------------------------------------------------------------------

def download_checkpoints() -> None:
    """Download and extract REYD checkpoints into MODEL_DIR. Raises on failure."""
    if not MODEL_DOWNLOAD_URL:
        raise RuntimeError("MODEL_DOWNLOAD_URL is not set and no default available.")

    tmp_dir = tempfile.mkdtemp(prefix="reyd_dl_")
    try:
        archive_path = os.path.join(tmp_dir, "download")
        curl_download(MODEL_DOWNLOAD_URL, archive_path)

        os.makedirs(MODEL_DIR, exist_ok=True)

        # Detect archive type by content, not extension
        with open(archive_path, "rb") as f:
            magic = f.read(4)

        if magic[:2] == b"PK":
            print("[TTS] Detected ZIP archive")
            extracted = _extract_from_zip(archive_path, MODEL_DIR)
        elif magic[:3] in (b"\x1f\x8b\x08", b"BZh") or magic == b"\xfd7zX":
            print("[TTS] Detected TAR archive")
            extracted = _extract_from_tar(archive_path, MODEL_DIR)
        else:
            # Assume raw .pth.tar checkpoint
            print(f"[TTS] Unknown magic bytes {magic!r}, treating as raw checkpoint")
            dest = os.path.join(MODEL_DIR, "checkpoint.pth.tar")
            shutil.copy2(archive_path, dest)
            extracted = [dest]

        if not extracted:
            # Last resort: copy anything that arrived
            print("[TTS] WARNING: No CONFIG-specific files found, copying all .pth.tar files")
            for f in glob.glob(os.path.join(tmp_dir, "**", "*.pth.tar"), recursive=True):
                dest = os.path.join(MODEL_DIR, os.path.basename(f))
                shutil.copy2(f, dest)
                extracted.append(dest)

        ckpts = glob.glob(os.path.join(MODEL_DIR, "*.pth.tar"))
        if not ckpts:
            raise RuntimeError(
                f"Download and extraction completed but no .pth.tar files found in {MODEL_DIR}. "
                f"Extracted paths: {extracted}. "
                f"MODEL_DIR contents: {os.listdir(MODEL_DIR) if os.path.isdir(MODEL_DIR) else 'dir missing'}."
            )
        print(f"[TTS] Checkpoints ready: {[os.path.basename(c) for c in ckpts]}")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Volume caching
# ---------------------------------------------------------------------------

def restore_from_volume() -> bool:
    """Copy cached checkpoints from network volume → MODEL_DIR. Returns True if any found."""
    if not os.path.isdir(VOLUME_CKPT_DIR):
        return False
    cached = glob.glob(os.path.join(VOLUME_CKPT_DIR, "*.pth.tar"))
    if not cached:
        return False
    os.makedirs(MODEL_DIR, exist_ok=True)
    for src in cached:
        dst = os.path.join(MODEL_DIR, os.path.basename(src))
        if not os.path.exists(dst):
            shutil.copy2(src, dst)
            print(f"[TTS] Restored from volume: {os.path.basename(src)}")
    return True


def cache_to_volume() -> None:
    """Copy MODEL_DIR checkpoints → network volume for future cold starts."""
    try:
        os.makedirs(VOLUME_CKPT_DIR, exist_ok=True)
        for src in glob.glob(os.path.join(MODEL_DIR, "*.pth.tar")):
            dst = os.path.join(VOLUME_CKPT_DIR, os.path.basename(src))
            if not os.path.exists(dst):
                shutil.copy2(src, dst)
                print(f"[TTS] Cached to volume: {os.path.basename(src)}")
    except Exception as e:
        print(f"[TTS] Volume cache write failed (non-fatal): {e}")


# ---------------------------------------------------------------------------
# Model readiness
# ---------------------------------------------------------------------------

def find_checkpoint_step() -> int:
    ckpts = glob.glob(os.path.join(MODEL_DIR, "*.pth.tar"))
    if not ckpts:
        raise RuntimeError(f"No .pth.tar checkpoints found in {MODEL_DIR}")
    steps = []
    for f in ckpts:
        try:
            steps.append(int(os.path.basename(f).replace(".pth.tar", "")))
        except ValueError:
            print(f"[TTS] WARNING: could not parse step from {os.path.basename(f)}, skipping")
    if not steps:
        raise RuntimeError(
            f"Checkpoint files exist in {MODEL_DIR} but none have numeric names "
            f"(expected e.g. '100000.pth.tar'). Found: {[os.path.basename(c) for c in ckpts]}"
        )
    return max(steps)


def ensure_model() -> int:
    """Return the restore step, downloading checkpoints if necessary. Raises on failure."""
    global _restore_step
    if _restore_step is not None:
        return _restore_step

    ckpts = glob.glob(os.path.join(MODEL_DIR, "*.pth.tar"))
    if not ckpts:
        print("[TTS] No checkpoints found locally. Checking network volume...")
        if restore_from_volume():
            print("[TTS] Loaded checkpoints from network volume.")
        else:
            print("[TTS] No volume cache. Downloading from source...")
            download_checkpoints()
            cache_to_volume()

    _restore_step = find_checkpoint_step()
    print(f"[TTS] Using checkpoint step={_restore_step}  dir={MODEL_DIR}")
    return _restore_step


# ---------------------------------------------------------------------------
# Startup: pre-warm (fail fast so RunPod restarts instead of serving errors)
# ---------------------------------------------------------------------------

try:
    ensure_model()
    print("[TTS] Ready.")
except Exception:
    traceback.print_exc()
    print("[TTS] FATAL: Could not load checkpoints. Exiting so RunPod can restart.")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

def synthesize_text(text: str, speaker_id: int = 0) -> bytes:
    step = ensure_model()
    out_dir = tempfile.mkdtemp(prefix="reyd_out_")
    try:
        cmd = [
            "python", "synthesize.py",
            "--text", text,
            "--speaker_id", str(speaker_id),
            "--restore_step", str(step),
            "--mode", "single",
            "--config", f"./config/{CONFIG}/model.yaml",
            "--result_path", out_dir,
        ]
        proc = subprocess.run(cmd, cwd=REPO_DIR, capture_output=True, timeout=120)
        if proc.returncode != 0:
            stderr = proc.stderr.decode(errors="replace")[:800]
            stdout = proc.stdout.decode(errors="replace")[:400]
            raise RuntimeError(
                f"synthesize.py failed (exit {proc.returncode})\n"
                f"stderr: {stderr}\nstdout: {stdout}"
            )
        wavs = glob.glob(os.path.join(out_dir, "**", "*.wav"), recursive=True)
        if not wavs:
            raise RuntimeError(f"No WAV output in {out_dir}. Dir: {os.listdir(out_dir)}")
        with open(wavs[0], "rb") as fh:
            return fh.read()
    finally:
        shutil.rmtree(out_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# RunPod handler
# ---------------------------------------------------------------------------

def handler(job: dict) -> dict:
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
            "audio_b64": base64.b64encode(wav_bytes).decode(),
            "format": "wav",
            "speaker_id": speaker_id,
        }
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}


runpod.serverless.start({"handler": handler})
