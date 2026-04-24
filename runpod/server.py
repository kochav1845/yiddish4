import os
import base64
import subprocess
import tempfile
import traceback
import runpod

MODEL_ID = "ivrit-ai/yi-whisper-large-v3"

_pipe = None
_device = None
_load_error = None


def get_pipe():
    global _pipe, _device
    if _pipe is not None:
        return _pipe

    import torch
    from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

    _device = "cuda" if torch.cuda.is_available() else "cpu"
    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

    print(f"Loading model {MODEL_ID} on {_device} from local cache...")

    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        MODEL_ID,
        torch_dtype=torch_dtype,
        low_cpu_mem_usage=True,
        use_safetensors=True,
        local_files_only=True,
    )
    model.to(_device)

    processor = AutoProcessor.from_pretrained(MODEL_ID, local_files_only=True)

    _pipe = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        torch_dtype=torch_dtype,
        device=_device,
    )

    print(f"Model {MODEL_ID} loaded and ready.")
    return _pipe


try:
    get_pipe()
except Exception as e:
    _load_error = str(e)
    print(f"WARNING: Model failed to load at startup: {e}")
    traceback.print_exc()


def handler(job):
    job_input = job.get("input", {})
    audio_b64 = job_input.get("audio")
    filename = job_input.get("filename", "audio.wav")

    if not audio_b64:
        return {"error": "No audio provided"}

    try:
        pipe = get_pipe()
    except Exception as e:
        return {"error": f"Model not available: {e}"}

    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception:
        return {"error": "Invalid base64 audio data"}

    # Always use the original extension so ffmpeg can detect the input format.
    # Fall back to .bin if no extension so we can still attempt conversion.
    ext = os.path.splitext(filename)[1].lower() or ".bin"

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    wav_path = None
    try:
        # soundfile only reliably handles WAV and FLAC.
        # Run ffmpeg for every other format (including mp3, webm, ogg, m4a, mp4, etc.)
        # to produce a 16 kHz mono WAV that Whisper can consume directly.
        NATIVE_FORMATS = {".wav", ".flac"}
        if ext not in NATIVE_FORMATS:
            wav_path = tmp_path.rsplit(".", 1)[0] + "_converted.wav"
            proc = subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-i", tmp_path,
                    "-ar", "16000",
                    "-ac", "1",
                    "-f", "wav",
                    wav_path,
                ],
                capture_output=True,
                timeout=120,
            )
            if proc.returncode != 0:
                stderr_msg = proc.stderr.decode(errors="replace")[:400]
                print(f"[FFMPEG] Conversion failed (exit {proc.returncode}): {stderr_msg}")
                return {"error": f"Audio conversion failed. The file may be corrupted or in an unsupported format. Details: {stderr_msg}"}
            input_path = wav_path
        else:
            input_path = tmp_path

        result = pipe(
            input_path,
            generate_kwargs={"task": "transcribe", "language": "yi"},
            return_timestamps=True,
        )
        transcription = result.get("text", "").strip()
        return {
            "transcription": transcription,
            "filename": filename,
            "file_size_bytes": len(audio_bytes),
            "language": "yiddish",
        }
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        if wav_path and os.path.exists(wav_path):
            os.unlink(wav_path)


runpod.serverless.start({"handler": handler})
