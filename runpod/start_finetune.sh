#!/bin/bash
set -e

echo "=============================="
echo " RunPod Fine-Tune Bootstrap"
echo "=============================="

# ── Clone latest repo ────────────────────────────────────────────────────────
echo "[1/4] Cloning repo..."
rm -rf /workspace/repo
git clone --depth=1 https://github.com/kochav1845/yiddish4 /workspace/repo

# ── Install dependencies ──────────────────────────────────────────────────────
echo "[2/4] Installing finetune requirements..."
cd /workspace/repo/runpod
pip install -r finetune_requirements.txt

# ── Environment variables ─────────────────────────────────────────────────────
echo "[3/4] Setting environment variables..."
export HF_TOKEN="${HF_TOKEN:-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}"
export HF_PUSH_TO="${HF_PUSH_TO:-yosefstern/yiddishstt}"

echo "HF_PUSH_TO : $HF_PUSH_TO"

# ── Run training ──────────────────────────────────────────────────────────────
echo "[4/4] Starting training..."
bash train.sh
