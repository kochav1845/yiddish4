import { useState } from "react";
import { Database, CheckCircle2, Loader2, FileAudio, Pencil, X } from "lucide-react";
import { stripDiacritics } from "../lib/textUtils";

interface AddToDatasetPanelProps {
  transcription: string;
  language: string;
  file: File;
  onSave: (correctedText: string) => Promise<void>;
  onDismiss: () => void;
}

const RTL_LANGUAGES = new Set(["yiddish", "hebrew"]);

export default function AddToDatasetPanel({
  transcription,
  language,
  file,
  onSave,
  onDismiss,
}: AddToDatasetPanelProps) {
  const [text, setText] = useState(stripDiacritics(transcription));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRtl = RTL_LANGUAGES.has(language);

  const fmt = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(text.trim());
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-5 flex items-center gap-4 animate-slide-up">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 size={20} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-emerald-800 font-semibold text-sm">Added to dataset</p>
          <p className="text-emerald-600 text-xs mt-0.5 truncate">
            {file.name} &middot; {fmt(file.size)}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-emerald-400 hover:text-emerald-600 transition-colors"
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-amber-100 bg-amber-50/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center flex-shrink-0">
            <Database size={13} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-stone-800">Edit &amp; Add to Dataset</p>
            <p className="text-xs text-stone-400 leading-none mt-0.5">
              Correct any errors, then save the audio and text to your dataset
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2 text-xs text-stone-500 bg-stone-50 rounded-xl px-3 py-2.5 border border-stone-100">
          <FileAudio size={13} className="text-amber-500 flex-shrink-0" />
          <span className="truncate font-medium">{file.name}</span>
          <span className="text-stone-300 flex-shrink-0">&middot;</span>
          <span className="flex-shrink-0">{fmt(file.size)}</span>
          <span className="text-stone-300 flex-shrink-0">&middot;</span>
          <span className="capitalize flex-shrink-0">{language}</span>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Pencil size={12} className="text-amber-500" />
            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
              Corrected Transcription
            </label>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            dir={isRtl ? "rtl" : "ltr"}
            lang={language === "yiddish" ? "yi" : language === "hebrew" ? "he" : "en"}
            rows={5}
            className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-sm leading-relaxed resize-y focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all placeholder:text-stone-300 font-hebrew ${isRtl ? "text-right" : "text-left"}`}
            placeholder={isRtl ? "הכנס תמלול..." : "Enter transcription..."}
          />
          <p className="text-xs text-stone-400 mt-1.5">
            Edit any errors above. The original audio will be stored alongside this corrected text.
          </p>
        </div>

        {error && (
          <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving || !text.trim()}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:from-stone-200 disabled:to-stone-200 disabled:text-stone-400 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Database size={14} />
            )}
            {saving ? "Saving…" : "Save to Dataset"}
          </button>
          <button
            onClick={onDismiss}
            className="text-stone-400 hover:text-stone-600 text-sm font-medium transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
