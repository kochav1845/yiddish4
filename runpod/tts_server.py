"""
REYD Yiddish TTS — FastAPI server for RunPod Pod deployment

Checkpoint loading order:
  1. Already present in MODEL_DIR (fastest, baked into image or network volume)
  2. RunPod Network Volume cache at /runpod-volume/ckpt/<CONFIG>/
  3. MODEL_DOWNLOAD_URL env var (any direct URL to zip / tar / pth.tar)
  4. Figshare individual file API  (api.figshare.com)
  5. Figshare ndownloader bulk zip (figshare.com/ndownloader/...)

POST /synthesize  { "text": "...", "speaker_id": 0 }
  → { "audio_b64": "...", "format": "wav" }

GET  /health
  → { "status": "ok", "checkpoint_step": <int> }
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
from contextlib import asynccontextmanager

import nltk
for _pkg in ("averaged_perceptron_tagger", "averaged_perceptron_tagger_eng", "cmudict", "punkt", "punkt_tab"):
    try:
        nltk.download(_pkg, quiet=True)
    except Exception:
        pass

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_DIR  = "/app/FastSpeech2"
CONFIG    = "yivo_respelled"
MODEL_DIR = os.environ.get(
    "MODEL_DIR",
    os.path.join(REPO_DIR, "output", "ckpt", CONFIG),
)

def _detect_preprocessed_dir() -> str:
    """Read preprocessed_path directly from the FastSpeech2 preprocess.yaml config."""
    if os.environ.get("PREPROCESSED_DIR"):
        return os.environ["PREPROCESSED_DIR"]
    config_file = os.path.join(REPO_DIR, "config", CONFIG, "preprocess.yaml")
    try:
        import yaml
        with open(config_file) as f:
            cfg = yaml.safe_load(f)
        rel = cfg["path"]["preprocessed_path"]
        path = rel if os.path.isabs(rel) else os.path.join(REPO_DIR, rel)
        print(f"[TTS] Config preprocessed_path → {path}")
        return path
    except Exception as exc:
        fallback = os.path.join(REPO_DIR, "preprocessed_data", f"yiddish_textgrids_{CONFIG}")
        print(f"[TTS] Warning reading config preprocessed_path ({exc}), fallback: {fallback}")
        return fallback

PREPROCESSED_DIR  = _detect_preprocessed_dir()
HIFIGAN_DIR       = os.path.join(REPO_DIR, "hifigan")
VOLUME_CKPT_DIR   = f"/runpod-volume/ckpt/{CONFIG}"
VOLUME_PREP_DIR   = f"/runpod-volume/preprocessed/{CONFIG}"
VOLUME_HIFIGAN_DIR = "/runpod-volume/hifigan"
FIGSHARE_API_URL  = "https://api.figshare.com/v2/articles/19350539/files"
FIGSHARE_BULK_URL = "https://figshare.com/ndownloader/articles/19350539/versions/1"
MODEL_DOWNLOAD_URL = os.environ.get("MODEL_DOWNLOAD_URL", "").strip()

_restore_step: int | None = None


# ---------------------------------------------------------------------------
# Curl helper
# ---------------------------------------------------------------------------

def curl_download(url: str, dest: str, label: str = "") -> tuple[bool, str]:
    tag = label or url[:80]
    print(f"[TTS] Downloading: {tag}")
    cmd = [
        "curl", "-fSL",
        "--retry", "2", "--retry-delay", "3", "--max-time", "480",
        "--write-out", "\nHTTP_CODE:%{http_code}  SIZE:%{size_download}  TIME:%{time_total}s",
        "-A", "Mozilla/5.0 (compatible; REYD-TTS/1.0)",
        "-o", dest, url,
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

def _write_member(zf, entry, dest_dir, results, raw_bytes=None):
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


# Only .json and .txt are needed for inference; skip .npy/.npz (training data)
_PREP_EXTS = {".json", ".txt"}


def _extract_textgrid_zip(zip_source):
    """Extract stats/preprocessed files from a textgrid zip to PREPROCESSED_DIR."""
    os.makedirs(PREPROCESSED_DIR, exist_ok=True)
    results = []
    try:
        if isinstance(zip_source, (bytes, bytearray)):
            zf_ctx = zipfile.ZipFile(io.BytesIO(zip_source))
        else:
            zf_ctx = zipfile.ZipFile(zip_source)
        with zf_ctx as zf:
            entries = zf.namelist()
            print(f"[TTS] Textgrid zip has {len(entries)} entries")
            for entry in entries:
                basename = os.path.basename(entry)
                if not basename:
                    continue
                _, ext = os.path.splitext(basename.lower())
                if ext in _PREP_EXTS:
                    _write_member(zf, entry, PREPROCESSED_DIR, results)
    except zipfile.BadZipFile as exc:
        print(f"[TTS] Textgrid zip is not a valid zip: {exc}")
    return results


def _is_textgrid_for_config(name: str) -> bool:
    n = name.lower().replace("-", "_")
    return "textgrid" in n and CONFIG.lower().replace("-", "_") in n


def _extract_zip(zip_path, dest_dir):
    os.makedirs(dest_dir, exist_ok=True)
    results = []

    def _extract_pth(zf, entries):
        direct_pth = [e for e in entries if e.endswith(".pth.tar")]
        config_pth = [e for e in direct_pth if CONFIG in e]
        for entry in (config_pth or direct_pth):
            _write_member(zf, entry, dest_dir, results)

    with zipfile.ZipFile(zip_path) as outer:
        entries = outer.namelist()
        print(f"[TTS] Outer zip has {len(entries)} entries: {entries}")
        _extract_pth(outer, entries)
        for nz in [e for e in entries if e.lower().endswith(".zip")]:
            nz_basename = os.path.basename(nz)
            try:
                nz_bytes = outer.read(nz)
                if _is_textgrid_for_config(nz_basename):
                    print(f"[TTS] Extracting preprocessed data from {nz_basename}")
                    results.extend(_extract_textgrid_zip(nz_bytes))
                else:
                    with zipfile.ZipFile(io.BytesIO(nz_bytes)) as inner:
                        _extract_pth(inner, inner.namelist())
            except zipfile.BadZipFile as exc:
                print(f"[TTS]   Skipping {nz}: {exc}")
    return results


def _extract_tar(tar_path, dest_dir):
    os.makedirs(dest_dir, exist_ok=True)
    results = []
    with tarfile.open(tar_path) as tf:
        members = [m for m in tf.getmembers() if m.name.endswith(".pth.tar")]
        cfg_members = [m for m in members if CONFIG in m.name] or members
        for m in cfg_members:
            m.name = os.path.basename(m.name)
            tf.extract(m, dest_dir)
            results.append(os.path.join(dest_dir, m.name))
            print(f"[TTS]   extracted: {m.name}")
    return results


def _unpack(archive_path, dest_dir):
    with open(archive_path, "rb") as f:
        magic = f.read(4)
    if magic[:2] == b"PK":
        return _extract_zip(archive_path, dest_dir)
    if magic[:3] in (b"\x1f\x8b\x08", b"BZh") or magic == b"\xfd7zX":
        return _extract_tar(archive_path, dest_dir)
    basename = "checkpoint.pth.tar"
    dest = os.path.join(dest_dir, basename)
    shutil.copy2(archive_path, dest)
    print(f"[TTS] Treated as raw checkpoint → {dest}")
    return [dest]


# ---------------------------------------------------------------------------
# Download strategies
# ---------------------------------------------------------------------------

def _try_url(url, label, dest_dir):
    tmp = tempfile.mktemp(prefix="reyd_dl_", suffix=".bin")
    try:
        ok, msg = curl_download(url, tmp, label)
        if not ok:
            return []
        size = os.path.getsize(tmp)
        if size < 1024:
            print(f"[TTS] Strategy '{label}' downloaded only {size} bytes — skipping")
            return []
        return _unpack(tmp, dest_dir)
    except Exception as exc:
        print(f"[TTS] Strategy '{label}' exception: {exc}")
        traceback.print_exc()
        return []
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def _try_figshare_api(dest_dir):
    tmp_json = tempfile.mktemp(suffix=".json")
    try:
        ok, _ = curl_download(FIGSHARE_API_URL, tmp_json, "figshare-api-json")
        if not ok:
            return []
        with open(tmp_json) as f:
            try:
                files_meta = json.load(f)
            except json.JSONDecodeError:
                return []

        extracted = []

        # Download checkpoint archive
        pretrained = [f for f in files_meta if "pretrained" in f.get("name", "").lower()]
        if not pretrained:
            pretrained = [f for f in files_meta if f.get("name", "").endswith(".pth.tar")]
        if not pretrained:
            pretrained = files_meta
        for item in pretrained:
            url = item.get("download_url", "")
            if not url:
                continue
            r = _try_url(url, f"figshare-api:{item.get('name')}", dest_dir)
            extracted.extend(r)
            if _ckpts_present():
                break

        # Download textgrid/preprocessed data zip for our config
        textgrid_items = [
            f for f in files_meta if _is_textgrid_for_config(f.get("name", ""))
        ]
        for item in textgrid_items:
            url = item.get("download_url", "")
            if not url:
                continue
            tmp = tempfile.mktemp(prefix="reyd_tg_", suffix=".bin")
            try:
                ok, _ = curl_download(url, tmp, f"figshare-api:{item.get('name')}")
                if ok and os.path.getsize(tmp) > 1024:
                    r = _extract_textgrid_zip(tmp)
                    extracted.extend(r)
            except Exception as exc:
                print(f"[TTS] Textgrid download exception: {exc}")
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)

        return extracted
    finally:
        if os.path.exists(tmp_json):
            os.remove(tmp_json)


def _ckpts_present():
    return bool(glob.glob(os.path.join(MODEL_DIR, "*.pth.tar")))


def download_checkpoints():
    os.makedirs(MODEL_DIR, exist_ok=True)
    if MODEL_DOWNLOAD_URL:
        _try_url(MODEL_DOWNLOAD_URL, "MODEL_DOWNLOAD_URL", MODEL_DIR)
        if _ckpts_present() and _prep_present():
            return
    _try_figshare_api(MODEL_DIR)
    if _ckpts_present() and _prep_present():
        return
    # Bulk ndownloader URL gives a zip-of-zips containing checkpoints + textgrids
    _try_url(FIGSHARE_BULK_URL, "figshare-bulk", MODEL_DIR)
    if _ckpts_present():
        return
    raise RuntimeError(
        "All checkpoint download strategies failed. "
        "Set MODEL_DOWNLOAD_URL to a direct URL of the pretrained_models.zip."
    )


# ---------------------------------------------------------------------------
# Network volume cache
# ---------------------------------------------------------------------------

def restore_from_volume():
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
    if os.path.isdir(VOLUME_PREP_DIR):
        os.makedirs(PREPROCESSED_DIR, exist_ok=True)
        for src in glob.glob(os.path.join(VOLUME_PREP_DIR, "*")):
            dst = os.path.join(PREPROCESSED_DIR, os.path.basename(src))
            if not os.path.exists(dst):
                shutil.copy2(src, dst)
                print(f"[TTS] Restored preprocessed: {os.path.basename(src)}")
    return _ckpts_present()


def cache_to_volume():
    try:
        os.makedirs(VOLUME_CKPT_DIR, exist_ok=True)
        for src in glob.glob(os.path.join(MODEL_DIR, "*.pth.tar")):
            dst = os.path.join(VOLUME_CKPT_DIR, os.path.basename(src))
            if not os.path.exists(dst):
                shutil.copy2(src, dst)
                print(f"[TTS] Cached to volume: {os.path.basename(src)}")
        os.makedirs(VOLUME_PREP_DIR, exist_ok=True)
        for src in glob.glob(os.path.join(PREPROCESSED_DIR, "*")):
            dst = os.path.join(VOLUME_PREP_DIR, os.path.basename(src))
            if not os.path.exists(dst):
                shutil.copy2(src, dst)
                print(f"[TTS] Cached preprocessed to volume: {os.path.basename(src)}")
    except Exception as exc:
        print(f"[TTS] Volume cache write failed (non-fatal): {exc}")


def find_checkpoint_step():
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
        raise RuntimeError("Checkpoint filenames are not numeric step numbers.")
    return max(steps)


def _prep_present():
    return bool(glob.glob(os.path.join(PREPROCESSED_DIR, "stats.json")))


def _hifigan_present():
    return os.path.exists(os.path.join(HIFIGAN_DIR, "generator_universal.pth.tar"))


def ensure_vocoder():
    """Unzip hifigan/generator_universal.pth.tar.zip if the .pth.tar is missing."""
    if _hifigan_present():
        return

    # Try restoring from network volume first
    if os.path.isdir(VOLUME_HIFIGAN_DIR):
        src = os.path.join(VOLUME_HIFIGAN_DIR, "generator_universal.pth.tar")
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(HIFIGAN_DIR, "generator_universal.pth.tar"))
            print("[TTS] Restored HiFi-GAN from volume.")
            return

    # The REYD-TTS repo ships the file as a zip inside hifigan/
    for zip_name in ("generator_universal.pth.tar.zip", "generator_universal.zip"):
        zip_path = os.path.join(HIFIGAN_DIR, zip_name)
        if os.path.exists(zip_path):
            print(f"[TTS] Unzipping {zip_name}...")
            with zipfile.ZipFile(zip_path) as zf:
                for entry in zf.namelist():
                    if entry.endswith(".pth.tar"):
                        dest = os.path.join(HIFIGAN_DIR, "generator_universal.pth.tar")
                        with zf.open(entry) as src_f, open(dest, "wb") as dst_f:
                            shutil.copyfileobj(src_f, dst_f)
                        print(f"[TTS] HiFi-GAN extracted → {dest}")
            if _hifigan_present():
                # Cache to volume for next run
                try:
                    os.makedirs(VOLUME_HIFIGAN_DIR, exist_ok=True)
                    shutil.copy2(
                        os.path.join(HIFIGAN_DIR, "generator_universal.pth.tar"),
                        os.path.join(VOLUME_HIFIGAN_DIR, "generator_universal.pth.tar"),
                    )
                    print("[TTS] Cached HiFi-GAN to volume.")
                except Exception as exc:
                    print(f"[TTS] HiFi-GAN volume cache failed (non-fatal): {exc}")
                return

    raise RuntimeError(
        "HiFi-GAN vocoder not found. Expected hifigan/generator_universal.pth.tar "
        "or hifigan/generator_universal.pth.tar.zip in the FastSpeech2 repo."
    )


def ensure_model():
    global _restore_step
    if _restore_step is not None:
        return _restore_step
    need_download = not _ckpts_present() or not _prep_present()
    if need_download:
        print("[TTS] Checking network volume...")
        restored = restore_from_volume()
        if restored and _prep_present():
            print("[TTS] Loaded from network volume.")
        else:
            print("[TTS] Downloading checkpoints and preprocessed data...")
            download_checkpoints()
            cache_to_volume()
    if not _prep_present():
        raise RuntimeError(
            f"Preprocessed data missing at {PREPROCESSED_DIR} — "
            "expected stats.json to be present after download."
        )
    ensure_vocoder()
    _restore_step = find_checkpoint_step()
    print(f"[TTS] Model ready — checkpoint step={_restore_step}")
    return _restore_step


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

def synthesize_text(text: str, speaker_id: int = 0) -> bytes:
    step = ensure_model()
    result_dir = os.path.join(REPO_DIR, "output", "result", CONFIG)
    os.makedirs(result_dir, exist_ok=True)

    before = set(glob.glob(os.path.join(result_dir, "**", "*.wav"), recursive=True))

    cmd = [
        "python", "-W", "ignore::FutureWarning", "-W", "ignore::UserWarning",
        "synthesize.py",
        "--text", text,
        "--speaker_id", str(speaker_id),
        "--restore_step", str(step),
        "--mode", "single",
        "-p", f"./config/{CONFIG}/preprocess.yaml",
        "-m", f"./config/{CONFIG}/model.yaml",
        "-t", f"./config/{CONFIG}/train.yaml",
    ]
    proc = subprocess.run(cmd, cwd=REPO_DIR, capture_output=True, timeout=120)
    if proc.returncode != 0:
        stderr = proc.stderr.decode(errors="replace")[-3000:]
        stdout = proc.stdout.decode(errors="replace")[-1000:]
        raise RuntimeError(
            f"synthesize.py exit {proc.returncode}\nstderr: {stderr}\nstdout: {stdout}"
        )

    after = set(glob.glob(os.path.join(result_dir, "**", "*.wav"), recursive=True))
    new_wavs = list(after - before)
    if not new_wavs:
        all_wavs = sorted(after, key=os.path.getmtime, reverse=True)
        if not all_wavs:
            raise RuntimeError(f"No WAV output produced.")
        new_wavs = [all_wavs[0]]

    with open(new_wavs[0], "rb") as fh:
        return fh.read()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[TTS] Starting up — loading model...")
    try:
        ensure_model()
        print("[TTS] Ready.")
    except Exception as exc:
        print(f"[TTS] WARNING: startup model load failed: {exc}")
        print("[TTS] Will retry on first /synthesize request.")
    yield


app = FastAPI(title="REYD Yiddish TTS", lifespan=lifespan)


class SynthesizeRequest(BaseModel):
    text: str
    speaker_id: int = 0


@app.get("/health")
async def health():
    try:
        step = ensure_model()
        return {"status": "ok", "checkpoint_step": step}
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "error", "error": str(exc)})


@app.post("/synthesize")
async def synthesize(req: SynthesizeRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if req.speaker_id not in (0, 1, 2):
        raise HTTPException(status_code=400, detail="speaker_id must be 0, 1, or 2")

    try:
        wav_bytes = synthesize_text(text, req.speaker_id)
        return {
            "audio_b64": base64.b64encode(wav_bytes).decode(),
            "format": "wav",
            "speaker_id": req.speaker_id,
        }
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
