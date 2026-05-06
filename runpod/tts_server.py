"""
REYD Yiddish TTS - RunPod Serverless Handler

Checkpoint loading order:
  1. Already present in MODEL_DIR (fastest)
  2. RunPod Network Volume cache at /runpod-volume/ckpt/<CONFIG>/
  3. MODEL_DOWNLOAD_URL env var (any direct URL to zip / tar / pth.tar)
  4. Figshare individual file API  (api.figshare.com)
  5. Figshare ndownloader bulk zip (figshare.com/ndownloader/...)

If all five fail the handler returns a JSON error with diagnostics.
Set MODEL_DOWNLOAD_URL to a mirror URL (HuggingFace, S3, …) to bypass Figshare.
"""

import os
import io
import json
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
CONFIG   = "yivo_respelled"
MODEL_DIR = os.environ.get(
    "MODEL_DIR",
    os.path.join(REPO_DIR, "output", "ckpt", CONFIG),
)
VOLUME_CKPT_DIR = f"/runpod-volume/ckpt/{CONFIG}"

FIGSHARE_API_URL      = "https://api.figshare.com/v2/articles/19350539/files"
FIGSHARE_BULK_URL     = "https://figshare.com/ndownloader/articles/19350539/versions/1"
MODEL_DOWNLOAD_URL    = os.environ.get("MODEL_DOWNLOAD_URL", "").strip()

_restore_step: int | None = None
_startup_error: str | None = None   # non-fatal: set so handler can report it

# ---------------------------------------------------------------------------
# Curl helper — verbose so failures appear in RunPod logs
# ---------------------------------------------------------------------------

def curl_download(url: str, dest: str, label: str = "") -> tuple[bool, str]:
    """
    Download url → dest using curl.
    Returns (success, message).  Never raises.
    """
    tag = label or url[:80]
    print(f"[TTS] Downloading: {tag}")
    cmd = [
        "curl", "-fSL",
        "--retry", "2",
        "--retry-delay", "3",
        "--max-time", "480",
        "--write-out", "\nHTTP_CODE:%{http_code}  SIZE:%{size_download}  TIME:%{time_total}s",
        "-A", "Mozilla/5.0 (compatible; REYD-TTS/1.0)",
        "-o", dest,
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    stdout = result.stdout.strip()
    stderr = result.stderr.strip()
    print(f"[TTS] curl exit={result.returncode}  {stdout}")
    if stderr:
        print(f"[TTS] curl stderr: {stderr[:400]}")

    if result.returncode != 0:
        return False, f"curl exit {result.returncode}: {stderr[:200]}"

    size = os.path.getsize(dest) if os.path.exists(dest) else 0
    print(f"[TTS] Saved {size:,} bytes → {dest}")
    return True, f"ok ({size:,} bytes)"


# ---------------------------------------------------------------------------
# Zip / tar extraction
# ---------------------------------------------------------------------------

def _write_member(zf: zipfile.ZipFile | None, entry: str,
                  dest_dir: str, results: list,
                  raw_bytes: bytes | None = None) -> None:
    basename = os.path.basename(entry)
    if not basename:
        return
    dest = os.path.join(dest_dir, basename)
    print(f"[TTS]   extract → {dest}")
    if raw_bytes is not None:
        with open(dest, "wb") as f:
            f.write(raw_bytes)
    else:
        with zf.open(entry) as src, open(dest, "wb") as dst:
            shutil.copyfileobj(src, dst)
    results.append(dest)


def _extract_zip(zip_path: str, dest_dir: str) -> list[str]:
    """
    Walk the zip (and any nested zips) looking for .pth.tar files.
    CONFIG match is preferred; if nothing matches CONFIG, take all .pth.tar.
    """
    os.makedirs(dest_dir, exist_ok=True)
    results: list[str] = []

    with zipfile.ZipFile(zip_path) as outer:
        entries = outer.namelist()
        print(f"[TTS] Outer zip has {len(entries)} entries")
        print(f"[TTS] First 40 entries: {entries[:40]}")

        # Direct .pth.tar at top level
        direct_pth = [e for e in entries if e.endswith(".pth.tar")]
        config_pth = [e for e in direct_pth if CONFIG in e]
        for entry in (config_pth or direct_pth):
            _write_member(outer, entry, dest_dir, results)

        # Nested zips
        nested = [e for e in entries if e.lower().endswith(".zip")]
        for nz in nested:
            print(f"[TTS] Scanning nested zip: {nz}")
            try:
                nz_bytes = outer.read(nz)
                with zipfile.ZipFile(io.BytesIO(nz_bytes)) as inner:
                    inner_entries = inner.namelist()
                    print(f"[TTS]   inner entries ({len(inner_entries)}): {inner_entries[:30]}")
                    inner_pth = [e for e in inner_entries if e.endswith(".pth.tar")]
                    inner_cfg = [e for e in inner_pth if CONFIG in e]
                    for entry in (inner_cfg or inner_pth):
                        _write_member(inner, entry, dest_dir, results)
            except zipfile.BadZipFile as exc:
                print(f"[TTS]   Skipping {nz}: {exc}")

    return results


def _extract_tar(tar_path: str, dest_dir: str) -> list[str]:
    os.makedirs(dest_dir, exist_ok=True)
    results: list[str] = []
    with tarfile.open(tar_path) as tf:
        members = [m for m in tf.getmembers() if m.name.endswith(".pth.tar")]
        print(f"[TTS] Tar .pth.tar members: {[m.name for m in members]}")
        cfg_members = [m for m in members if CONFIG in m.name] or members
        for m in cfg_members:
            m.name = os.path.basename(m.name)
            tf.extract(m, dest_dir)
            results.append(os.path.join(dest_dir, m.name))
            print(f"[TTS]   extracted: {m.name}")
    return results


def _unpack(archive_path: str, dest_dir: str) -> list[str]:
    with open(archive_path, "rb") as f:
        magic = f.read(4)

    if magic[:2] == b"PK":
        return _extract_zip(archive_path, dest_dir)
    if magic[:3] in (b"\x1f\x8b\x08", b"BZh") or magic == b"\xfd7zX":
        return _extract_tar(archive_path, dest_dir)
    # Raw checkpoint — copy as-is
    basename = "checkpoint.pth.tar"
    dest = os.path.join(dest_dir, basename)
    shutil.copy2(archive_path, dest)
    print(f"[TTS] Treated as raw checkpoint → {dest}")
    return [dest]


# ---------------------------------------------------------------------------
# Download strategies
# ---------------------------------------------------------------------------

def _try_url(url: str, label: str, dest_dir: str) -> list[str]:
    """Try a single URL, unpack it, return list of extracted paths. Empty = failed."""
    tmp = tempfile.mktemp(prefix="reyd_dl_", suffix=".bin")
    try:
        ok, msg = curl_download(url, tmp, label)
        if not ok:
            print(f"[TTS] Strategy '{label}' failed: {msg}")
            return []
        size = os.path.getsize(tmp)
        if size < 1024:
            print(f"[TTS] Strategy '{label}' downloaded only {size} bytes — likely an error page, skipping")
            return []
        extracted = _unpack(tmp, dest_dir)
        return extracted
    except Exception as exc:
        print(f"[TTS] Strategy '{label}' exception: {exc}")
        traceback.print_exc()
        return []
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def _try_figshare_api(dest_dir: str) -> list[str]:
    """
    Use the Figshare files API to get individual download URLs, then
    download only the pretrained_models zip (or individual .pth.tar files).
    """
    print(f"[TTS] Querying Figshare API: {FIGSHARE_API_URL}")
    tmp_json = tempfile.mktemp(suffix=".json")
    try:
        ok, msg = curl_download(FIGSHARE_API_URL, tmp_json, "figshare-api-json")
        if not ok:
            print(f"[TTS] Figshare API query failed: {msg}")
            return []
        with open(tmp_json) as f:
            try:
                files_meta = json.load(f)
            except json.JSONDecodeError as exc:
                content = open(tmp_json).read(500)
                print(f"[TTS] Figshare API response not JSON ({exc}): {content}")
                return []

        print(f"[TTS] Figshare API returned {len(files_meta)} file entries")
        for item in files_meta:
            print(f"[TTS]   {item.get('name')}  {item.get('size')} bytes  {item.get('download_url')}")

        # Download pretrained_models zip first; fall back to any .pth.tar
        targets = [f for f in files_meta if "pretrained" in f.get("name", "").lower()]
        if not targets:
            targets = [f for f in files_meta if f.get("name", "").endswith(".pth.tar")]
        if not targets:
            targets = files_meta  # try everything

        results: list[str] = []
        for item in targets:
            name = item.get("name", "file")
            url  = item.get("download_url", "")
            if not url:
                continue
            extracted = _try_url(url, f"figshare-api:{name}", dest_dir)
            results.extend(extracted)
            if results:
                break   # stop after first successful file set

        return results
    finally:
        if os.path.exists(tmp_json):
            os.remove(tmp_json)


def download_checkpoints() -> None:
    """
    Try every download strategy in order.
    Raises RuntimeError with diagnostics if all fail.
    """
    os.makedirs(MODEL_DIR, exist_ok=True)
    tried: list[str] = []

    # 1. Explicit override URL
    if MODEL_DOWNLOAD_URL:
        extracted = _try_url(MODEL_DOWNLOAD_URL, "MODEL_DOWNLOAD_URL", MODEL_DIR)
        tried.append(f"MODEL_DOWNLOAD_URL={MODEL_DOWNLOAD_URL}")
        if _ckpts_present():
            print("[TTS] Checkpoints installed via MODEL_DOWNLOAD_URL.")
            return

    # 2. Figshare individual files API
    extracted = _try_figshare_api(MODEL_DIR)
    tried.append("figshare-api")
    if _ckpts_present():
        print("[TTS] Checkpoints installed via Figshare API.")
        return

    # 3. Figshare bulk ndownloader
    extracted = _try_url(FIGSHARE_BULK_URL, "figshare-bulk", MODEL_DIR)
    tried.append(f"figshare-bulk={FIGSHARE_BULK_URL}")
    if _ckpts_present():
        print("[TTS] Checkpoints installed via Figshare bulk download.")
        return

    raise RuntimeError(
        f"All download strategies failed. Tried: {tried}. "
        f"MODEL_DIR contents: {os.listdir(MODEL_DIR) if os.path.isdir(MODEL_DIR) else 'missing'}. "
        "To fix: set MODEL_DOWNLOAD_URL to a direct URL to the pretrained_models.zip "
        "(or 100000.pth.tar) hosted on HuggingFace, S3, or any publicly accessible URL."
    )


def _ckpts_present() -> bool:
    return bool(glob.glob(os.path.join(MODEL_DIR, "*.pth.tar")))


# ---------------------------------------------------------------------------
# Volume caching
# ---------------------------------------------------------------------------

def restore_from_volume() -> bool:
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
    return _ckpts_present()


def cache_to_volume() -> None:
    try:
        os.makedirs(VOLUME_CKPT_DIR, exist_ok=True)
        for src in glob.glob(os.path.join(MODEL_DIR, "*.pth.tar")):
            dst = os.path.join(VOLUME_CKPT_DIR, os.path.basename(src))
            if not os.path.exists(dst):
                shutil.copy2(src, dst)
                print(f"[TTS] Cached to volume: {os.path.basename(src)}")
    except Exception as exc:
        print(f"[TTS] Volume cache write failed (non-fatal): {exc}")


# ---------------------------------------------------------------------------
# Ensure model is ready
# ---------------------------------------------------------------------------

def find_checkpoint_step() -> int:
    ckpts = glob.glob(os.path.join(MODEL_DIR, "*.pth.tar"))
    if not ckpts:
        raise RuntimeError(f"No checkpoints in {MODEL_DIR}")
    steps = []
    for f in ckpts:
        try:
            steps.append(int(os.path.basename(f).replace(".pth.tar", "")))
        except ValueError:
            pass
    if not steps:
        raise RuntimeError(
            f"Checkpoint files present but filenames are not numeric step numbers: "
            f"{[os.path.basename(c) for c in ckpts]}"
        )
    return max(steps)


def ensure_model() -> int:
    global _restore_step
    if _restore_step is not None:
        return _restore_step

    if not _ckpts_present():
        print("[TTS] No local checkpoints. Checking network volume...")
        if restore_from_volume():
            print("[TTS] Loaded from network volume.")
        else:
            print("[TTS] No volume cache. Attempting download...")
            download_checkpoints()
            cache_to_volume()

    _restore_step = find_checkpoint_step()
    print(f"[TTS] Model ready — checkpoint step={_restore_step}  dir={MODEL_DIR}")
    return _restore_step


# ---------------------------------------------------------------------------
# Startup (non-fatal — let handler report the error with diagnostics)
# ---------------------------------------------------------------------------

print("[TTS] Starting up...")
try:
    ensure_model()
    print("[TTS] Ready.")
except Exception as _exc:
    _startup_error = str(_exc)
    print(f"[TTS] WARNING: startup model load failed: {_startup_error}")
    print("[TTS] Will retry on first request.")


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
                f"synthesize.py exit {proc.returncode}\nstderr: {stderr}\nstdout: {stdout}"
            )
        wavs = glob.glob(os.path.join(out_dir, "**", "*.wav"), recursive=True)
        if not wavs:
            raise RuntimeError(
                f"No WAV output produced. out_dir={os.listdir(out_dir)}"
            )
        with open(wavs[0], "rb") as fh:
            return fh.read()
    finally:
        shutil.rmtree(out_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# RunPod handler
# ---------------------------------------------------------------------------

def handler(job: dict) -> dict:
    job_input = job.get("input", {})
    text       = job_input.get("text", "").strip()
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
    except Exception as exc:
        traceback.print_exc()
        return {"error": str(exc)}


runpod.serverless.start({"handler": handler})
