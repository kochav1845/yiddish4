import { useState } from "react";
import { Copy, Check, FileAudio, Type } from "lucide-react";
import { stripDiacritics } from "../lib/textUtils";

interface TranscriptionResultProps {
  text: string;
  filename: string;
  language?: string;
}

const RTL_LANGUAGES = new Set(["yiddish", "hebrew"]);

type YiddishFont = "tree" | "reponzel";

export default function TranscriptionResult({
  text,
  filename,
  language = "yiddish",
}: TranscriptionResultProps) {
  const [copied, setCopied] = useState(false);
  const [yiddishFont, setYiddishFont] = useState<YiddishFont>("tree");
  const isRtl = RTL_LANGUAGES.has(language);
  const isYiddish = language === "yiddish";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(stripDiacritics(text));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fontClass = isYiddish
    ? yiddishFont === "tree"
      ? "font-hebrew"
      : "font-display text-[3em] leading-[1.6]"
    : "font-hebrew";

  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden animate-slide-up">
      <div className="flex items-start sm:items-center justify-between px-3 sm:px-5 py-3 sm:py-3.5 border-b border-stone-100 bg-stone-50/60 gap-2 flex-wrap sm:flex-nowrap">
        <div
          className="flex items-center gap-2 text-stone-600 text-xs sm:text-sm font-medium min-w-0 font-hebrew"
          dir="ltr"
        >
          <FileAudio size={14} className="text-amber-600 shrink-0" />
          <span className="truncate max-w-[140px] sm:max-w-none">{filename}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 sm:mr-2">
          {isYiddish && (
            <button
              onClick={() =>
                setYiddishFont((f) => (f === "tree" ? "reponzel" : "tree"))
              }
              className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-medium px-2 sm:px-3 py-1.5 rounded-lg transition-colors duration-200 hover:bg-stone-200 text-stone-600 font-hebrew"
              title="Switch font"
            >
              <Type size={14} />
              <span className="text-xs">
                {yiddishFont === "tree" ? "עץ הדעת" : "רעפנצל"}
              </span>
            </button>
          )}
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-medium px-2 sm:px-3 py-1.5 rounded-lg transition-colors duration-200 font-hebrew ${
              copied
                ? "bg-emerald-100 text-emerald-700"
                : "hover:bg-amber-100 text-amber-700"
            }`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>
      <div
        dir={isRtl ? "rtl" : "ltr"}
        lang={language === "yiddish" ? "yi" : language === "hebrew" ? "he" : "en"}
        className={`p-4 sm:p-6 text-stone-800 whitespace-pre-wrap ${fontClass}`}
      >
        {text ? stripDiacritics(text) : (
          <span className="text-stone-400 italic font-hebrew text-base">
            No transcription returned.
          </span>
        )}
      </div>
    </div>
  );
}
