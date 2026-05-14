import os
import base64
import subprocess
import tempfile
import traceback
import runpod

MODEL_YIDDISH = "yosefstern/yiddishstt"
MODEL_IVRIT = "ivrit-ai/yi-whisper-large-v3"

_pipes = {}
_device = None


def _load_model(model_id):
    import torch
    from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

    global _device
    if _device is None:
        _device = "cuda" if torch.cuda.is_available() else "cpu"
    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

    print(f"Loading {model_id} on {_device}...")
    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        model_id,
        torch_dtype=torch_dtype,
        low_cpu_mem_usage=True,
        use_safetensors=True,
        local_files_only=True,
    )
    model.to(_device)
    processor = AutoProcessor.from_pretrained(model_id, local_files_only=True)
    pipe = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        torch_dtype=torch_dtype,
        device=_device,
    )
    print(f"{model_id} ready.")
    return pipe


def get_pipes():
    global _pipes
    if _pipes:
        return _pipes
    for model_id in (MODEL_YIDDISH, MODEL_IVRIT):
        try:
            _pipes[model_id] = _load_model(model_id)
        except Exception as e:
            print(f"WARNING: failed to load {model_id}: {e}")
            traceback.print_exc()
    return _pipes


try:
    get_pipes()
except Exception as e:
    print(f"WARNING: Model loading failed at startup: {e}")
    traceback.print_exc()


def _transcribe(pipe, input_path):
    result = pipe(
        input_path,
        generate_kwargs={"task": "transcribe", "language": "yi"},
        return_timestamps=True,
    )
    return result.get("text", "").strip()


def handler(job):
    job_input = job.get("input", {})
    audio_b64 = job_input.get("audio")
    filename = job_input.get("filename", "audio.wav")

    if not audio_b64:
        return {"error": "No audio provided"}

    pipes = get_pipes()
    if not pipes:
        return {"error": "No models available"}

    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception:
        return {"error": "Invalid base64 audio data"}

    ext = os.path.splitext(filename)[1].lower() or ".bin"

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    wav_path = None
    try:
        NATIVE_FORMATS = {".wav", ".flac"}
        if ext not in NATIVE_FORMATS:
            wav_path = tmp_path.rsplit(".", 1)[0] + "_converted.wav"
            proc = subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_path, "-ar", "16000", "-ac", "1", "-f", "wav", wav_path],
                capture_output=True,
                timeout=120,
            )
            if proc.returncode != 0:
                stderr_msg = proc.stderr.decode(errors="replace")[:400]
                return {"error": f"Audio conversion failed: {stderr_msg}"}
            input_path = wav_path
        else:
            input_path = tmp_path

        response = {"filename": filename, "file_size_bytes": len(audio_bytes), "language": "yiddish"}

        for key, model_id in (("transcription", MODEL_YIDDISH), ("transcription_ivrit", MODEL_IVRIT)):
            pipe = pipes.get(model_id)
            if pipe is None:
                response[key] = None
                response[f"{key}_error"] = f"{model_id} not loaded"
            else:
                try:
                    response[key] = _transcribe(pipe, input_path)
                except Exception as e:
                    traceback.print_exc()
                    response[key] = None
                    response[f"{key}_error"] = str(e)

        # Primary transcription field for backwards compatibility
        response["transcription"] = response.get("transcription") or response.get("transcription_ivrit", "")

        return response

    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        if wav_path and os.path.exists(wav_path):
            os.unlink(wav_path)


runpod.serverless.start({"handler": handler})
