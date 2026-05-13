"""
Download the REYD Yiddish TTS corpus from Edinburgh DataShare and convert it
into a HuggingFace dataset ready for Whisper fine-tuning.

Corpus layout inside the zip:
  reyd-dataset/audio/{lit1,lit2,pol1}/*.wav
  reyd-dataset/text/yivo_original/{lit1,lit2,pol1}/{stem}.lab

Output structure (saved to --output_dir):
  train/  test/   (80/20 split, stratified by speaker)
  dataset_dict.json

Usage:
  python prepare_reyd_finetune.py --output_dir ./reyd_whisper_dataset
  python prepare_reyd_finetune.py --corpus_zip /workspace/reyd-dataset.zip --output_dir ./reyd_whisper_dataset
"""

import argparse
import os
import random
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


def collect_examples(extract_dir: Path) -> list[dict]:
    """
    Walk the REYD corpus:
      <root>/audio/{speaker}/*.wav
      <root>/text/yivo_original/{speaker}/{stem}.lab
    The zip may extract into a single top-level sub-folder.
    """
    examples: list[dict] = []

    # Descend past a single wrapper directory if needed
    root = extract_dir
    children = [d for d in root.iterdir() if d.is_dir()]
    if children and not (root / "audio").exists():
        root = children[0]

    audio_root = root / "audio"
    text_root = root / "text" / "yivo_original"

    if not audio_root.exists():
        raise RuntimeError(f"Expected audio directory not found at {audio_root}")

    speaker_dirs = sorted(d for d in audio_root.iterdir() if d.is_dir())

    for speaker_dir in speaker_dirs:
        speaker_key = speaker_dir.name
        meta_obj = SPEAKER_META.get(
            speaker_key,
            {"speaker_id": -1, "dialect": "unknown", "gender": "unknown"},
        )
        lab_dir = text_root / speaker_key

        for wav_file in sorted(speaker_dir.glob("*.wav")):
            stem = wav_file.stem
            lab_file = lab_dir / f"{stem}.lab"
            if not lab_file.exists():
                print(f"  [skip] No .lab for {wav_file.name}")
                continue
            sentence = lab_file.read_text(encoding="utf-8", errors="replace").strip()
            if not sentence:
                print(f"  [skip] Empty transcript for {wav_file.name}")
                continue
            examples.append(
                {
                    "audio": str(wav_file),
                    "sentence": sentence,
                    "speaker": speaker_key,
                    "speaker_id": meta_obj["speaker_id"],
                    "dialect": meta_obj["dialect"],
                    "gender": meta_obj["gender"],
                }
            )

    print(f"Collected {len(examples)} examples across {len(speaker_dirs)} speaker dirs")
    return examples


def resample_if_needed(wav_path: str) -> str:
    """Return path to a 16 kHz mono WAV, resampling via librosa if needed."""
    import numpy as np
    import librosa

    info = sf.info(wav_path)
    if info.samplerate == SAMPLE_RATE and info.channels == 1:
        return wav_path

    out_dir = Path("/tmp/reyd_resampled")
    out_dir.mkdir(exist_ok=True)
    out_path = str(out_dir / Path(wav_path).name)

    audio, _ = librosa.load(wav_path, sr=SAMPLE_RATE, mono=True)
    sf.write(out_path, audio, SAMPLE_RATE)
    return out_path


def build_dataset(examples: list[dict], test_ratio: float = 0.2, seed: int = 42) -> DatasetDict:
    rng = random.Random(seed)

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
    parser.add_argument("--push_to_hub", default=None, help="HuggingFace Hub repo id")
    parser.add_argument("--hf_token", default=os.environ.get("HF_TOKEN"))
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        if args.corpus_zip:
            zip_path = Path(args.corpus_zip)
        else:
            zip_path = tmp_path / "reyd-dataset.zip"
            download_corpus(zip_path)

        extract_dir = tmp_path / "reyd"
        print(f"Extracting to {extract_dir} ...")
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        examples = collect_examples(extract_dir)
        if not examples:
            raise RuntimeError("No audio/transcript pairs found — check corpus structure.")

        dataset = build_dataset(examples, test_ratio=args.test_ratio)

        dataset.save_to_disk(str(output_dir))
        print(f"Dataset saved to {output_dir}")
        print(dataset)

        if args.push_to_hub:
            from huggingface_hub import login
            if args.hf_token:
                login(args.hf_token)
            dataset.push_to_hub(args.push_to_hub)
            print(f"Pushed to HuggingFace Hub: {args.push_to_hub}")


if __name__ == "__main__":
    main()
