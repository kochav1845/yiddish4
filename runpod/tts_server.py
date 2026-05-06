import os
import base64
import subprocess
import tempfile
import traceback
import glob
import runpod

REPO_DIR = "/app/FastSpeech2"
CONFIG = "yivo_respelled"

MODEL_DIR = os.environ.get(
    "MODEL_DIR",
    os.path.join(REPO_DIR, "output", "ckpt", CONFIG),
)

_model_ready = False
_restore_step = None


def find_checkpoint_step():
    ckpts = glob.glob(os.path.join(MODEL_DIR, "*.pth.tar"))
    if not ckpts:
        raise RuntimeError(f"No checkpoints found in {MODEL_DIR}")
    steps = []
    for f in ckpts:
        try:
            steps.append(int(os.path.basename(f).replace(".pth.tar", "")))
        except ValueError:
            pass
    if not steps:
        raise RuntimeError("Could not parse checkpoint step numbers")
    return max(steps)


def ensure_model():
    global _model_ready, _restore_step
    if _model_ready:
        return
    _restore_step = find_checkpoint_step()
    print(f"[TTS] Using checkpoint step {_restore_step} from {MODEL_DIR}")
    _model_ready = True


try:
    ensure_model()
    print("[TTS] Model ready at startup.")
except Exception as e:
    print(f"[TTS] WARNING: Model not available at startup ({e}). "
          f"Set MODEL_DIR to your checkpoint directory.")


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
    wavs = glob.glob(os.path.join(out_dir, "**", "*.wav"), recursive=True) or \
           glob.glob(os.path.join(out_dir, "*.wav"))
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
