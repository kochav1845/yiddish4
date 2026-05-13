#!/bin/bash
set -e

DATASET_DIR="${DATASET_DIR:-/workspace/dataset}"
MODEL_DIR="${MODEL_DIR:-/workspace/model}"
BASE_MODEL="${BASE_MODEL:-ivrit-ai/yi-whisper-large-v3}"
EPOCHS="${EPOCHS:-5}"
BATCH_SIZE="${BATCH_SIZE:-4}"
GRAD_ACCUM="${GRAD_ACCUM:-2}"

echo "=============================="
echo " Yiddish Whisper Fine-Tune"
echo "=============================="
echo "Base model : $BASE_MODEL"
echo "Epochs     : $EPOCHS"
echo "Batch size : $BATCH_SIZE"
echo "Dataset dir: $DATASET_DIR"
echo "Model dir  : $MODEL_DIR"
echo ""

# ── Step 1: prepare dataset ──────────────────────────────────────────────────
if [ ! -f "$DATASET_DIR/dataset_dict.json" ]; then
  echo "[1/3] Downloading and preparing REYD corpus..."
  python prepare_reyd_finetune.py \
    --output_dir "$DATASET_DIR"
else
  echo "[1/3] Dataset already prepared at $DATASET_DIR — skipping download."
fi

# ── Step 2: fine-tune ────────────────────────────────────────────────────────
echo ""
echo "[2/3] Fine-tuning $BASE_MODEL ..."
python finetune_whisper.py \
  --dataset_dir  "$DATASET_DIR" \
  --output_dir   "$MODEL_DIR" \
  --base_model   "$BASE_MODEL" \
  --epochs       "$EPOCHS" \
  --batch_size   "$BATCH_SIZE" \
  --grad_accum   "$GRAD_ACCUM"

# ── Step 3: merge LoRA + optional push to Hub ────────────────────────────────
echo ""
if [ -n "$HF_PUSH_TO" ]; then
  echo "[3/3] Merging LoRA weights and pushing to Hub: $HF_PUSH_TO ..."
  python finetune_whisper.py \
    --merge_and_push \
    --output_dir "$MODEL_DIR" \
    --push_to_hub "$HF_PUSH_TO"
  echo "Done! Model live at https://huggingface.co/$HF_PUSH_TO"
else
  echo "[3/3] Merging LoRA weights into standalone model (no Hub push)..."
  python finetune_whisper.py \
    --merge_and_push \
    --output_dir "$MODEL_DIR"
  echo "Done! Merged model saved to ${MODEL_DIR}-merged"
  echo "Set HF_PUSH_TO=yourname/model-name to push to HuggingFace Hub."
fi
