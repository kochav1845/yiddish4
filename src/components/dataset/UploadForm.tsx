import { useState, useRef } from "react";
import { Upload, FileAudio, Loader2, Plus } from "lucide-react";

interface UploadFormProps {
  onUpload: (file: File, transcription: string, language: string) => Promise<void>;
  isUploading: boolean;
}

const LANGUAGE_OPTIONS = [
  { value: "yiddish", label: "Yiddish" },
  { value: "hebrew", label: "Hebrew" },
  { value: "english", label: "English" },
  { value: "other", label: "Other" },
];

export default function UploadForm({ onUpload, isUploading }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState("");
  const [language, setLanguage] = useState("yiddish");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("audio/")) handleFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !transcription.trim()) return;
    await onUpload(file, transcription.trim(), language);
    setFile(null);
    setTranscription("");
  };

  const canSubmit = file && transcription.trim().length > 0 && !isUploading;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-150 ${
          dragOver
            ? "border-amber-400 bg-amber-50"
            : file
            ? "border-green-400 bg-green-50"
            : "border-stone-200 hover:border-amber-300 hover:bg-amber-50/30"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <FileAudio size={20} className="text-green-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-stone-800 truncate max-w-[160px] sm:max-w-[280px]">{file.name}</p>
              <p className="text-xs text-stone-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center">
              <Upload size={22} className="text-stone-400" />
            </div>
            <p className="text-sm font-medium text-stone-600">Drop audio file here or click to browse</p>
            <p className="text-xs text-stone-400">MP3, WAV, M4A, FLAC, OGG — up to 50 MB</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
            Transcription / Description
          </label>
          <textarea
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            placeholder="Type the exact transcription of this audio clip..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none text-sm text-stone-800 resize-none placeholder:text-stone-300 transition-all font-hebrew"
            dir="auto"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
            Language
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none text-sm text-stone-800 bg-white transition-all"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className={`w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-150 ${
          canSubmit
            ? "bg-amber-500 hover:bg-amber-600 text-white shadow-sm hover:shadow"
            : "bg-stone-100 text-stone-400 cursor-not-allowed"
        }`}
      >
        {isUploading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Plus size={16} />
            Add to Dataset
          </>
        )}
      </button>
    </form>
  );
}
