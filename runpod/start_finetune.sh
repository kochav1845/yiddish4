#!/bin/bash
set -e

echo "=============================="
echo " RunPod Fine-Tune Bootstrap"
echo "=============================="

# ── GitHub authentication ─────────────────────────────────────────────────────
# Supports two methods (set one as a pod env var):
#   GITHUB_TOKEN  — a GitHub Personal Access Token (simplest)
#   GITHUB_SSH_KEY — contents of the private SSH key (base64-encoded)
#
# The public key for SSH access is:
#   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFBb+/4bsUtOrNUYJpaJ8AUSiwbSoojuDxARLKTlGgsU claude-agent
# Add it as a Deploy Key on: https://github.com/kochav1845/yiddish4/settings/keys

REPO_HTTPS="https://github.com/kochav1845/yiddish4"
REPO_SSH="git@github.com:kochav1845/yiddish4.git"

if [ -n "$GITHUB_TOKEN" ]; then
  echo "[auth] Using HTTPS with GitHub token..."
  CLONE_URL="https://${GITHUB_TOKEN}@github.com/kochav1845/yiddish4"

elif [ -n "$GITHUB_SSH_KEY" ]; then
  echo "[auth] Setting up SSH key from env var..."
  mkdir -p ~/.ssh
  echo "$GITHUB_SSH_KEY" | base64 -d > ~/.ssh/id_ed25519
  chmod 600 ~/.ssh/id_ed25519
  ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null
  CLONE_URL="$REPO_SSH"

else
  echo "[auth] No GITHUB_TOKEN or GITHUB_SSH_KEY set."
  echo "       If the repo is public, cloning without auth (may fail for private repos)."
  CLONE_URL="$REPO_HTTPS"
fi

# ── Clone latest repo ────────────────────────────────────────────────────────
echo "[1/4] Cloning repo..."
rm -rf /workspace/repo
git clone --depth=1 "$CLONE_URL" /workspace/repo

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
