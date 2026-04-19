FROM nvidia/cuda:12.8.1-cudnn9-runtime-ubuntu22.04

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

COPY requirements.txt .
RUN pip install --no-cache-dir \
    --extra-index-url https://download.pytorch.org/whl/cu128 \
    -r requirements.txt

COPY download_model.py .
ARG HF_TOKEN
RUN python download_model.py

COPY server.py .

EXPOSE 8080

CMD ["python", "-u", "server.py"]
