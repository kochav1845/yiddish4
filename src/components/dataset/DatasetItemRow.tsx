import { useState } from "react";
import { Trash2, Play, Pause, FileAudio } from "lucide-react";
import type { DatasetItem } from "../../lib/supabase";
import { stripDiacritics } from "../../lib/textUtils";

interface DatasetItemRowProps {
  item: DatasetItem;
  audioUrl: string | null;
  onDelete: (id: string, storagePath: string) => void;
}

export default function DatasetItemRow({ item, audioUrl, onDelete }: DatasetItemRowProps) {
  const [playing, setPlaying] = useState(false);
  const [audio] = useState(() => audioUrl ? new Audio(audioUrl) : null);

  const togglePlay = () => {
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
      audio.onended = () => setPlaying(false);
    }
  };

  const fmt = (bytes: number | null) => {
    if (!bytes) return "";
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="flex items-start gap-2 sm:gap-4 p-3 sm:p-4 rounded-xl hover:bg-stone-50 transition-colors duration-100 group">
      <button
        onClick={togglePlay}
        disabled={!audioUrl}
        className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all duration-150 ${
          audioUrl
            ? playing
              ? "bg-amber-100 text-amber-600"
              : "bg-stone-100 hover:bg-amber-100 text-stone-500 hover:text-amber-600"
            : "bg-stone-50 text-stone-300 cursor-not-allowed"
        }`}
        title={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <FileAudio size={12} className="text-stone-400 flex-shrink-0" />
          <span className="text-xs text-stone-400 truncate">{item.filename}</span>
          <span className="text-xs text-stone-300">·</span>
          <span className="text-xs text-stone-400 capitalize">{item.language}</span>
          {item.file_size_bytes && (
            <>
              <span className="text-xs text-stone-300">·</span>
              <span className="text-xs text-stone-400">{fmt(item.file_size_bytes)}</span>
            </>
          )}
        </div>
        <p
          className="text-sm text-stone-800 leading-relaxed font-hebrew line-clamp-2"
          dir="auto"
        >
          {stripDiacritics(item.transcription ?? "")}
        </p>
        <p className="text-xs text-stone-400 mt-1">{fmtDate(item.created_at)}</p>
      </div>

      <button
        onClick={() => onDelete(item.id, item.storage_path)}
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-stone-300 hover:text-red-500 hover:bg-red-50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-150"
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
