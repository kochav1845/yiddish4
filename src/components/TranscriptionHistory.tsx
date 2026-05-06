import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  FileAudio,
  Trash2,
  ArrowLeft,
  Type,
  Pencil,
  Check,
  X,
  Loader2,
} from "lucide-react";
import type { Transcription } from "../lib/supabase";
import { supabase } from "../lib/supabase";
import EditableText from "./EditableText";
import { stripDiacritics } from "../lib/textUtils";

interface TranscriptionHistoryProps {
  items: Transcription[];
  onDelete?: (id: string) => void;
  onEdited?: (id: string, newText: string) => void;
}

const RTL_LANGUAGES = new Set(["yiddish", "hebrew"]);

const LANG_LABELS: Record<string, string> = {
  yiddish: "יידיש",
  hebrew: "עברית",
  english: "EN",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("he-IL", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function langBadgeColor(lang: string) {
  switch (lang) {
    case "yiddish":
      return "bg-amber-100 text-amber-700";
    case "hebrew":
      return "bg-sky-100 text-sky-700";
    case "english":
      return "bg-emerald-100 text-emerald-700";
    default:
      return "bg-stone-100 text-stone-600";
  }
}

export default function TranscriptionHistory({
  items,
  onDelete,
  onEdited,
}: TranscriptionHistoryProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fontOverrides, setFontOverrides] = useState<Record<string, "tree" | "reponzel">>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="text-center py-16 animate-fade-in" dir="rtl">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-stone-100 mb-4">
          <Clock size={24} className="text-stone-300" />
        </div>
        <EditableText
          contentKey="history_empty_title"
          defaultValue="נאָך נישטאָ קיין אויפֿנאַמעס"
          as="p"
          className="text-stone-400 font-medium font-display text-lg sm:text-[2rem]"
          dir="rtl"
        />
        <EditableText
          contentKey="history_empty_subtitle"
          defaultValue="אייערע טראַנסקריפּציעס וועלן דאָ אויפֿטרעטן"
          as="p"
          className="text-stone-300 text-base sm:text-[1.5rem] mt-1 font-display"
          dir="rtl"
        />
      </div>
    );
  }

  const toggleFont = (id: string) => {
    setFontOverrides((prev) => ({
      ...prev,
      [id]: prev[id] === "reponzel" ? "tree" : "reponzel",
    }));
  };

  const startEdit = (item: Transcription) => {
    setEditing(item.id);
    setEditText(stripDiacritics(item.transcription ?? ""));
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditText("");
    setSaveError(null);
  };

  const saveEdit = async (id: string) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setSaving(true);
    setSaveError(null);
    const { error } = await supabase
      .from("transcriptions")
      .update({ transcription: trimmed })
      .eq("id", id);
    setSaving(false);
    if (error) {
      setSaveError("Failed to save. Please try again.");
      return;
    }
    onEdited?.(id, trimmed);
    setEditing(null);
    setEditText("");
  };

  return (
    <div dir="rtl">
      <h2 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2 font-hebrew">
        <Clock size={18} className="text-amber-600" />
        <EditableText
          contentKey="history_heading"
          defaultValue="פֿריערדיקע אויפֿנאַמעס"
          as="span"
          className="font-hebrew"
          dir="rtl"
        />
      </h2>
      <div className="space-y-2">
        {items.map((item, i) => {
          const outLang = item.output_language || item.language;
          const isRtl = RTL_LANGUAGES.has(outLang);
          const isYiddish = outLang === "yiddish";
          const currentFont = fontOverrides[item.id] || "tree";
          const fontClass = isYiddish
            ? currentFont === "tree"
              ? "font-hebrew"
              : "font-display text-[3em] leading-[1.6]"
            : "font-hebrew";
          const isEditing = editing === item.id;

          return (
            <div
              key={item.id}
              className="bg-white border border-stone-200/80 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 animate-fade-in"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {/* Header toggle — only toggle/delete live here */}
              <button
                onClick={() =>
                  setExpanded(expanded === item.id ? null : item.id)
                }
                className="w-full flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 hover:bg-stone-50/60 transition-colors duration-150 text-right"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <FileAudio size={14} className="text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-stone-800 font-medium text-sm truncate font-hebrew">
                      {item.filename || "אן נאמען"}
                    </p>
                    <p
                      className="text-stone-400 text-[1.1rem] mt-0.5 flex items-center gap-1.5 flex-wrap font-hebrew"
                      dir="ltr"
                    >
                      <span>{formatDate(item.created_at)}</span>
                      {formatBytes(item.file_size_bytes) && (
                        <span>
                          &middot; {formatBytes(item.file_size_bytes)}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide ${langBadgeColor(
                            item.language
                          )}`}
                        >
                          {LANG_LABELS[item.language] ?? item.language}
                        </span>
                        {item.language !== outLang && (
                          <>
                            <ArrowLeft size={10} className="text-stone-400" />
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide ${langBadgeColor(
                                outLang
                              )}`}
                            >
                              {LANG_LABELS[outLang] ?? outLang}
                            </span>
                          </>
                        )}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mr-2">
                  {onDelete && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          onDelete(item.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 transition-colors duration-150"
                    >
                      <Trash2 size={14} />
                    </span>
                  )}
                  {expanded === item.id ? (
                    <ChevronUp size={16} className="text-stone-400 shrink-0" />
                  ) : (
                    <ChevronDown size={16} className="text-stone-400 shrink-0" />
                  )}
                </div>
              </button>

              {/* Expanded area — completely outside the toggle button, stopPropagation prevents any accidental bubbling */}
              {expanded === item.id && (
                <div
                  className="border-t border-stone-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-3 sm:px-5 pt-3 pb-1">
                    <div className="flex items-center gap-1.5">
                      {!isEditing && (
                        <button
                          onClick={() => startEdit(item)}
                          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors duration-200 hover:bg-amber-100 text-amber-600"
                          title="Edit transcription"
                        >
                          <Pencil size={12} />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>
                    {isYiddish && !isEditing && (
                      <button
                        onClick={() => toggleFont(item.id)}
                        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors duration-200 hover:bg-stone-200 text-stone-500 font-hebrew"
                      >
                        <Type size={12} />
                        <span>
                          {currentFont === "tree" ? "עץ הדעת" : "רעפנצל"}
                        </span>
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="px-3 sm:px-5 pb-4 sm:pb-5 pt-2 space-y-3">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        dir={isRtl ? "rtl" : "ltr"}
                        lang={outLang === "yiddish" ? "yi" : outLang === "hebrew" ? "he" : "en"}
                        rows={6}
                        className={`w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-sm leading-relaxed resize-y focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all font-hebrew ${isRtl ? "text-right" : "text-left"}`}
                        autoFocus
                      />
                      {saveError && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          {saveError}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => saveEdit(item.id)}
                          disabled={saving || !editText.trim()}
                          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-stone-200 disabled:text-stone-400 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                        >
                          {saving ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="flex items-center gap-1.5 text-stone-400 hover:text-stone-600 text-xs font-medium px-3 py-2 rounded-lg hover:bg-stone-100 transition-colors"
                        >
                          <X size={12} />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      dir={isRtl ? "rtl" : "ltr"}
                      lang={
                        outLang === "yiddish"
                          ? "yi"
                          : outLang === "hebrew"
                          ? "he"
                          : "en"
                      }
                      className={`px-3 sm:px-5 pb-4 sm:pb-5 pt-2 text-stone-700 ${fontClass}`}
                    >
                      {stripDiacritics(item.transcription ?? "")}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
