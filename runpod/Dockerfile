FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-dev \
    python3-pip \
    ffmpeg \
    libsndfile1 \
    git \
    git-lfs \
    && rm -rf /var/lib/apt/lists/*

RUN git lfs install

RUN ln -sf /usr/bin/python3.11 /usr/bin/python && \
    ln -sf /usr/bin/python3.11 /usr/bin/python3

WORKDIR /app

COPY runpod/requirements.txt .
RUN pip install --no-cache-dir \
    --extra-index-url https://download.pytorch.org/whl/cu121 \
    -r requirements.txt

ARG HF_TOKEN
RUN python <<'PYEOF'
import os
from huggingface_hub import login
token = os.environ.get('HF_TOKEN', '')
if token:
    login(token=token)
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor
import torch

model_id = 'ivrit-ai/yi-whisper-large-v3'
print(f'Downloading {model_id}...')
AutoModelForSpeechSeq2Seq.from_pretrained(model_id, torch_dtype=torch.float16, low_cpu_mem_usage=True, use_safetensors=True)
AutoProcessor.from_pretrained(model_id)
print(f'{model_id} downloaded successfully')
PYEOF

COPY runpod/server.py .

EXPOSE 8080

CMD ["python", "-u", "server.py"]
