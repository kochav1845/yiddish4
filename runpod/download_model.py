import os
from huggingface_hub import login
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor
import torch

token = os.environ.get("HF_TOKEN", "")
if token:
    login(token=token)

model_id = "ivrit-ai/yi-whisper-large-v3"
print(f"Downloading {model_id}...")
AutoModelForSpeechSeq2Seq.from_pretrained(
    model_id,
    torch_dtype=torch.float16,
    low_cpu_mem_usage=True,
    use_safetensors=True,
)
AutoProcessor.from_pretrained(model_id)
print(f"{model_id} downloaded successfully")
