import urllib.request
import json
import os
import shutil

ARTICLE_ID = 19350539
CKPT_DIR = "/app/FastSpeech2/output/ckpt/yivo_respelled"
TMP_DIR = "/tmp/reyd_download"

os.makedirs(CKPT_DIR, exist_ok=True)
os.makedirs(TMP_DIR, exist_ok=True)

api_url = f"https://api.figshare.com/v2/articles/{ARTICLE_ID}/files"
print(f"[build] Fetching file list from {api_url}")

req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req) as resp:
    files = json.loads(resp.read())

print(f"[build] Found {len(files)} files in article")

for f in files:
    name = f["name"]
    url = f["download_url"]
    dest = os.path.join(TMP_DIR, name)
    print(f"[build] Downloading {name} ({f.get('size', '?')} bytes)...")
    dl_req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(dl_req) as response, open(dest, "wb") as out:
        shutil.copyfileobj(response, out)
    print(f"[build] Done: {name}")

checkpoints = [f for f in os.listdir(TMP_DIR) if f.endswith(".pth.tar")]
if not checkpoints:
    raise RuntimeError("No .pth.tar checkpoint files found in downloaded files")

for ckpt in checkpoints:
    shutil.copy(os.path.join(TMP_DIR, ckpt), os.path.join(CKPT_DIR, ckpt))
    print(f"[build] Installed: {ckpt}")

shutil.rmtree(TMP_DIR)
print(f"[build] Checkpoints ready in {CKPT_DIR}")
