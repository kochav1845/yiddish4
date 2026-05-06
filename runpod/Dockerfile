FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
    python3.10 python3.10-dev python3-pip \
    ffmpeg \
    libsndfile1 \
    git \
    git-lfs \
    && rm -rf /var/lib/apt/lists/*

RUN python3.10 -m pip install --upgrade pip && \
    ln -sf /usr/bin/python3.10 /usr/local/bin/python && \
    ln -sf /usr/bin/python3.10 /usr/local/bin/python3

RUN git lfs install

# PyTorch 2.7+ with CUDA 12.8 — bundles its own CUDA runtime (sm_120 support)
RUN pip install --no-cache-dir torch \
    --index-url https://download.pytorch.org/whl/cu128

WORKDIR /app

COPY runpod/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY runpod/download_model.py .
ARG HF_TOKEN
RUN python download_model.py

COPY runpod/server.py .

CMD ["python", "-u", "server.py"]
