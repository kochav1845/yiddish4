"""
Fine-tune ivrit-ai/yi-whisper-large-v3 (or any Whisper model) on the REYD
Yiddish corpus prepared by prepare_reyd_finetune.py.

Uses LoRA (PEFT) so the full model does not need to fit in VRAM twice.
A single A100-40 GB or RTX 4090 is sufficient for large-v3 with LoRA.

Usage:
  python finetune_whisper.py \
    --dataset_dir ./reyd_whisper_dataset \
    --output_dir   ./yiddish-whisper-finetuned \
    --base_model   ivrit-ai/yi-whisper-large-v3 \
    --epochs 5 \
    --batch_size 8

After training, merge and push:
  python finetune_whisper.py --merge_and_push \
    --output_dir ./yiddish-whisper-finetuned \
    --push_to_hub myorg/yiddish-whisper
"""

import argparse
import os
from dataclasses import dataclass
from functools import partial
from typing import Any

import torch
from datasets import DatasetDict, load_from_disk
from peft import LoraConfig, get_peft_model
from transformers import (
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    WhisperForConditionalGeneration,
    WhisperProcessor,
)

import evaluate

LANGUAGE = "yi"  # Yiddish ISO-639 code
TASK = "transcribe"


@dataclass
class DataCollator:
    processor: Any
    decoder_start_token_id: int

    def __call__(self, features: list[dict]) -> dict[str, torch.Tensor]:
        input_features = [
            {"input_features": self.processor.feature_extractor(
                f["audio"]["array"],
                sampling_rate=f["audio"]["sampling_rate"],
            ).input_features[0]}
            for f in features
        ]
        batch = self.processor.feature_extractor.pad(input_features, return_tensors="pt")
        batch["input_features"] = batch["input_features"].to(torch.float16)

        label_features = [{"input_ids": self.processor.tokenizer(f["sentence"], max_length=448, truncation=True).input_ids} for f in features]
        labels_batch = self.processor.tokenizer.pad(label_features, return_tensors="pt")
        labels = labels_batch["input_ids"].masked_fill(
            labels_batch.attention_mask.ne(1), -100
        )
        if (labels[:, 0] == self.decoder_start_token_id).all().cpu().item():
            labels = labels[:, 1:]

        batch["labels"] = labels
        return batch


def prepare_dataset(batch: dict, processor: WhisperProcessor) -> dict:
    audio = batch["audio"]
    batch["input_features"] = processor.feature_extractor(
        audio["array"], sampling_rate=audio["sampling_rate"]
    ).input_features[0]
    batch["labels"] = processor.tokenizer(batch["sentence"]).input_ids
    return batch


def compute_metrics(pred, processor: WhisperProcessor):
    wer_metric = evaluate.load("wer")
    pred_ids = pred.predictions
    label_ids = pred.label_ids
    label_ids[label_ids == -100] = processor.tokenizer.pad_token_id

    pred_str = processor.tokenizer.batch_decode(pred_ids, skip_special_tokens=True)
    label_str = processor.tokenizer.batch_decode(label_ids, skip_special_tokens=True)

    wer = wer_metric.compute(predictions=pred_str, references=label_str)
    return {"wer": round(wer, 4)}


def load_model_with_lora(base_model: str, hf_token: str | None) -> tuple:
    processor = WhisperProcessor.from_pretrained(
        base_model, language=LANGUAGE, task=TASK, token=hf_token
    )

    model = WhisperForConditionalGeneration.from_pretrained(
        base_model,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        token=hf_token,
        low_cpu_mem_usage=True,
    )
    model.config.forced_decoder_ids = None
    model.config.suppress_tokens = []
    model.config.use_cache = False

    lora_config = LoraConfig(
        r=32,
        lora_alpha=64,
        target_modules=["q_proj", "v_proj"],
        lora_dropout=0.05,
        bias="none",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    return model, processor


def merge_and_save(output_dir: str, push_to_hub: str | None, hf_token: str | None) -> None:
    from peft import PeftModel
    print(f"Loading base + LoRA adapter from {output_dir} ...")
    base_model_id = open(os.path.join(output_dir, "base_model_id.txt")).read().strip()
    processor = WhisperProcessor.from_pretrained(output_dir)
    base = WhisperForConditionalGeneration.from_pretrained(base_model_id)
    model = PeftModel.from_pretrained(base, output_dir)
    merged = model.merge_and_unload()
    merged_dir = output_dir + "-merged"
    merged.save_pretrained(merged_dir)
    processor.save_pretrained(merged_dir)
    print(f"Merged model saved to {merged_dir}")
    if push_to_hub:
        from huggingface_hub import login
        if hf_token:
            login(hf_token)
        merged.push_to_hub(push_to_hub)
        processor.push_to_hub(push_to_hub)
        print(f"Pushed merged model to {push_to_hub}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset_dir", default="./reyd_whisper_dataset")
    parser.add_argument("--output_dir", default="./yiddish-whisper-finetuned")
    parser.add_argument("--base_model", default="ivrit-ai/yi-whisper-large-v3")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch_size", type=int, default=8)
    parser.add_argument("--grad_accum", type=int, default=2)
    parser.add_argument("--learning_rate", type=float, default=1e-4)
    parser.add_argument("--warmup_steps", type=int, default=100)
    parser.add_argument("--eval_steps", type=int, default=200)
    parser.add_argument("--save_steps", type=int, default=400)
    parser.add_argument("--fp16", action="store_true", default=torch.cuda.is_available())
    parser.add_argument("--hf_token", default=os.environ.get("HF_TOKEN"))
    parser.add_argument("--merge_and_push", action="store_true")
    parser.add_argument("--push_to_hub", default=None)
    args = parser.parse_args()

    if args.merge_and_push:
        merge_and_save(args.output_dir, args.push_to_hub, args.hf_token)
        return

    # 1. Load dataset
    print(f"Loading dataset from {args.dataset_dir} ...")
    dataset: DatasetDict = load_from_disk(args.dataset_dir)
    print(dataset)

    # 2. Load model + LoRA
    model, processor = load_model_with_lora(args.base_model, args.hf_token)

    # Save base model id so merge step can reload it
    os.makedirs(args.output_dir, exist_ok=True)
    with open(os.path.join(args.output_dir, "base_model_id.txt"), "w") as f:
        f.write(args.base_model)

    # 3. Data collator — feature extraction happens on-the-fly during training
    collator = DataCollator(
        processor=processor,
        decoder_start_token_id=model.config.decoder_start_token_id,
    )

    # 5. Training args
    training_args = Seq2SeqTrainingArguments(
        output_dir=args.output_dir,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.learning_rate,
        warmup_steps=args.warmup_steps,
        num_train_epochs=args.epochs,
        eval_strategy="steps",
        eval_steps=args.eval_steps,
        save_strategy="steps",
        save_steps=args.save_steps,
        logging_steps=25,
        load_best_model_at_end=True,
        metric_for_best_model="wer",
        greater_is_better=False,
        fp16=args.fp16,
        predict_with_generate=True,
        generation_max_length=225,
        report_to=["tensorboard"],
        push_to_hub=bool(args.push_to_hub),
        hub_model_id=args.push_to_hub,
        hub_token=args.hf_token,
        dataloader_num_workers=0,
        remove_unused_columns=False,
    )

    # 6. Trainer
    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset["train"],
        eval_dataset=dataset["test"],
        data_collator=collator,
        compute_metrics=partial(compute_metrics, processor=processor),
    )

    # 7. Train
    print("Starting fine-tuning ...")
    trainer.train()

    # 8. Save final adapter + processor
    trainer.save_model(args.output_dir)
    processor.save_pretrained(args.output_dir)
    print(f"Fine-tuned adapter saved to {args.output_dir}")
    print("Run with --merge_and_push to produce a standalone model.")


if __name__ == "__main__":
    main()
