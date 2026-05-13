"""Quick script to download and inspect the REYD zip structure."""
import shutil
import urllib.request
import zipfile
from pathlib import Path

CORPUS_URL = "https://datashare.ed.ac.uk/bitstream/handle/10283/4383/reyd-dataset.zip"
ZIP_PATH = Path("/workspace/reyd-dataset.zip")

if not ZIP_PATH.exists():
    print(f"Downloading from {CORPUS_URL} ...")
    req = urllib.request.Request(CORPUS_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(ZIP_PATH, "wb") as out:
        shutil.copyfileobj(resp, out)
    print("Done.")
else:
    print(f"Using existing {ZIP_PATH}")

print("\n=== ZIP CONTENTS (first 100 entries) ===")
with zipfile.ZipFile(ZIP_PATH, "r") as zf:
    names = zf.namelist()
    for name in names[:100]:
        print(name)
    if len(names) > 100:
        print(f"... and {len(names) - 100} more files")

print(f"\nTotal entries: {len(names)}")

# Show unique top-level directories
tops = set()
for n in names:
    parts = Path(n).parts
    if len(parts) > 0:
        tops.add(parts[0])
print("\n=== TOP-LEVEL ENTRIES ===")
for t in sorted(tops):
    print(t)

# Show directory structure depth
dirs = set()
for n in names:
    p = Path(n)
    if n.endswith("/") or len(p.parts) > 1:
        dirs.add(str(p.parent))
print("\n=== UNIQUE DIRECTORIES ===")
for d in sorted(dirs)[:50]:
    print(d)
