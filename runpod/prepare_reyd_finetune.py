"""
Download the REYD Yiddish TTS corpus from Edinburgh DataShare and convert it
into a HuggingFace dataset ready for Whisper fine-tuning.

Output structure (saved to --output_dir):
  train/  test/   (80/20 split, stratified by speaker)
  dataset_dict.json

Usage:
  python prepare_reyd_finetune.py --output_dir ./reyd_whisper_dataset
  python prepare_reyd_finetune.py --output_dir ./reyd_whisper_dataset --push_to_hub myorg/reyd-yiddish-asr
"""

import argparse
import csv
import io
import os
import random
import re
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import soundfile as sf
from datasets import Audio, Dataset, DatasetDict, Features, Value

CORPUS_URL = (
    "https://datashare.ed.ac.uk/bitstream/handle/10283/4383/reyd-dataset.zip"
)
SAMPLE_RATE = 16_000

# Map speaker directory names to human-readable labels
SPEAKER_META = {
    "lit1": {"speaker_id": 0, "dialect": "lithuanian", "gender": "male"},
    "lit2": {"speaker_id": 1, "dialect": "lithuanian", "gender": "female"},
    "pol1": {"speaker_id": 2, "dialect": "polish", "gender": "male"},
}


def download_corpus(dest_zip: Path) -> None:
    print(f"Downloading REYD corpus from {CORPUS_URL} ...")
    req = urllib.request.Request(CORPUS_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(dest_zip, "wb") as out:
        shutil.copyfileobj(resp, out)
    print(f"Downloaded to {dest_zip}")


def find_transcript_file(speaker_dir: Path) -> Path | None:
    """Return the first .csv or .txt file that looks like a transcript list."""
    for candidate in sorted(speaker_dir.rglob("*.csv")):
        return candidate
    for candidate in sorted(speaker_dir.rglob("metadata.txt")):
        return candidate
    # Some corpora use a single tab-separated file at the root
    return None


def parse_metadata(meta_path: Path) -> dict[str, str]:
    """
    Parse a metadata file and return {stem: text}.
    Supports:
      - LJSpeech CSV:  filename|text|normalized
      - TSV:           filename\ttext
      - plain two-col: filename text (space-separated stem + rest)
    """
    mapping: dict[str, str] = {}
    text = meta_path.read_text(encoding="utf-8", errors="replace")
    delimiter = "\t" if "\t" in text else "|"
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    for row in reader:
        if len(row) < 2:
            continue
        stem = Path(row[0]).stem  # strip path + extension if present
        # prefer the last column (normalized text) when available
        sentence = row[-1].strip()
        if sentence:
            mapping[stem] = sentence
    return mapping


def collect_examples(extract_dir: Path) -> list[dict]:
    """Walk the extracted corpus and collect {audio_path, sentence, speaker, dialect, gender}."""
    examples: list[dict] = []
    root = extract_dir

    # Try to find speaker sub-directories
    speaker_dirs = [d for d in sorted(root.rglob("wavs")) if d.is_dir()]
    if not speaker_dirs:
        # Flat layout — all wavs at top level
        speaker_dirs = [root]

    for wavs_dir in speaker_dirs:
        # Determine speaker from directory name
        speaker_key = None
        for part in reversed(wavs_dir.parts):
            if part in SPEAKER_META:
                speaker_key = part
                break
        meta_obj = SPEAKER_META.get(speaker_key, {"speaker_id": -1, "dialect": "unknown", "gender": "unknown"})

        # Find transcript file in parent or sibling
        meta_path = find_transcript_file(wavs_dir.parent)
        if meta_path is None:
            meta_path = find_transcript_file(wavs_dir)
        transcript: dict[str, str] = parse_metadata(meta_path) if meta_path else {}

        for wav_file in sorted(wavs_dir.glob("*.wav")):
            stem = wav_file.stem
            sentence = transcript.get(stem, "")
            if not sentence:
                # Try matching by numeric suffix
                nums = re.search(r"(\d+)$", stem)
                if nums:
                    for key, val in transcript.items():
                        if key.endswith(nums.group(1)):
                            sentence = val
                            break
            if not sentence:
                print(f"  [skip] No transcript for {wav_file.name}")
                continue

            examples.append(
                {
                    "audio": str(wav_file),
                    "sentence": sentence,
                    "speaker": speaker_key or "unknown",
                    "speaker_id": meta_obj["speaker_id"],
                    "dialect": meta_obj["dialect"],
                    "gender": meta_obj["gender"],
                }
            )

    print(f"Collected {len(examples)} examples across {len(speaker_dirs)} speaker dirs")
    return examples


def resample_if_needed(wav_path: str) -> str:
    """
    Return path to a 16 kHz mono WAV.  If the file already matches, return as-is.
    Resampled files are written to /tmp/reyd_resampled/.
    """
    info = sf.info(wav_path)
    if info.samplerate == SAMPLE_RATE and info.channels == 1:
        return wav_path

    out_dir = Path("/tmp/reyd_resampled")
    out_dir.mkdir(exist_ok=True)
    out_path = str(out_dir / Path(wav_path).name)

    import subprocess
    subprocess.run(
        ["ffmpeg", "-y", "-i", wav_path, "-ar", str(SAMPLE_RATE), "-ac", "1", out_path],
        check=True, capture_output=True,
    )
    return out_path


def build_dataset(examples: list[dict], test_ratio: float = 0.2, seed: int = 42) -> DatasetDict:
    rng = random.Random(seed)

    # Stratify by speaker
    by_speaker: dict[str, list] = {}
    for ex in examples:
        by_speaker.setdefault(ex["speaker"], []).append(ex)

    train_rows, test_rows = [], []
    for spk_examples in by_speaker.values():
        rng.shuffle(spk_examples)
        split_at = max(1, int(len(spk_examples) * test_ratio))
        test_rows.extend(spk_examples[:split_at])
        train_rows.extend(spk_examples[split_at:])

    print(f"Split: {len(train_rows)} train / {len(test_rows)} test")

    features = Features(
        {
            "audio": Audio(sampling_rate=SAMPLE_RATE),
            "sentence": Value("string"),
            "speaker": Value("string"),
            "speaker_id": Value("int32"),
            "dialect": Value("string"),
            "gender": Value("string"),
        }
    )

    def to_hf(rows: list[dict]) -> Dataset:
        # Ensure audio is resampled before handing to HF Audio feature
        resampled = []
        for row in rows:
            r = dict(row)
            r["audio"] = resample_if_needed(row["audio"])
            resampled.append(r)
        return Dataset.from_list(resampled, features=features)

    return DatasetDict({"train": to_hf(train_rows), "test": to_hf(test_rows)})


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare REYD corpus for Whisper fine-tuning")
    parser.add_argument("--output_dir", default="./reyd_whisper_dataset")
    parser.add_argument("--corpus_zip", default=None, help="Path to pre-downloaded reyd-dataset.zip")
    parser.add_argument("--test_ratio", type=float, default=0.2)
    parser.add_argument("--push_to_hub", default=None, help="HuggingFace Hub repo id, e.g. myorg/reyd-yiddish-asr")
    parser.add_argument("--hf_token", default=os.environ.get("HF_TOKEN"))
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        # 1. Obtain the zip
        if args.corpus_zip:
            zip_path = Path(args.corpus_zip)
        else:
            zip_path = tmp_path / "reyd-dataset.zip"
            download_corpus(zip_path)

        # 2. Extract
        extract_dir = tmp_path / "reyd"
        print(f"Extracting to {extract_dir} ...")
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        # 3. Collect examples
        examples = collect_examples(extract_dir)
        if not examples:
            raise RuntimeError("No audio/transcript pairs found — check corpus structure.")

        # 4. Build HF DatasetDict
        dataset = build_dataset(examples, test_ratio=args.test_ratio)

        # 5. Save
        dataset.save_to_disk(str(output_dir))
        print(f"Dataset saved to {output_dir}")
        print(dataset)

        # 6. Optionally push to Hub
        if args.push_to_hub:
            from huggingface_hub import login
            if args.hf_token:
                login(args.hf_token)
            dataset.push_to_hub(args.push_to_hub)
            print(f"Pushed to HuggingFace Hub: {args.push_to_hub}")


if __name__ == "__main__":
    main()
