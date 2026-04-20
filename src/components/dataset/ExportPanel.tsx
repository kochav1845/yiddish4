import { FileDown, FileJson, FileText } from "lucide-react";
import type { DatasetItem } from "../../lib/supabase";

interface ExportPanelProps {
  items: DatasetItem[];
}

export default function ExportPanel({ items }: ExportPanelProps) {
  const exportCSV = () => {
    const header = "file_name,transcription,language";
    const rows = items.map(
      (item) =>
        `"${item.filename.replace(/"/g, '""')}","${item.transcription.replace(/"/g, '""')}","${item.language}"`
    );
    const csv = [header, ...rows].join("\n");
    download("dataset_metadata.csv", csv, "text/csv");
  };

  const exportJSON = () => {
    const data = items.map((item) => ({
      file_name: item.filename,
      transcription: item.transcription,
      language: item.language,
    }));
    download("dataset_metadata.json", JSON.stringify(data, null, 2), "application/json");
  };

  const exportHuggingFace = () => {
    const data = items.map((item) => ({
      file_name: item.filename,
      transcription: item.transcription,
    }));
    const lines = data.map((d) => JSON.stringify(d));
    download("metadata.jsonl", lines.join("\n"), "application/jsonl");
  };

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (items.length === 0) return null;

  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-stone-200/80 shadow-lg shadow-stone-200/20 p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-stone-800">Export Dataset</h3>
          <p className="text-xs text-stone-400 mt-0.5">
            {items.length} item{items.length !== 1 ? "s" : ""} ready to export
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={exportCSV}
          className="flex items-center gap-3 p-4 rounded-xl border border-stone-200 hover:border-amber-300 hover:bg-amber-50/40 transition-all duration-150 group text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-stone-100 group-hover:bg-amber-100 flex items-center justify-center transition-colors">
            <FileText size={18} className="text-stone-500 group-hover:text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-stone-700">CSV</p>
            <p className="text-xs text-stone-400">metadata.csv</p>
          </div>
          <FileDown size={14} className="ml-auto text-stone-300 group-hover:text-amber-500" />
        </button>

        <button
          onClick={exportJSON}
          className="flex items-center gap-3 p-4 rounded-xl border border-stone-200 hover:border-amber-300 hover:bg-amber-50/40 transition-all duration-150 group text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-stone-100 group-hover:bg-amber-100 flex items-center justify-center transition-colors">
            <FileJson size={18} className="text-stone-500 group-hover:text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-stone-700">JSON</p>
            <p className="text-xs text-stone-400">metadata.json</p>
          </div>
          <FileDown size={14} className="ml-auto text-stone-300 group-hover:text-amber-500" />
        </button>

        <button
          onClick={exportHuggingFace}
          className="flex items-center gap-3 p-4 rounded-xl border border-stone-200 hover:border-amber-300 hover:bg-amber-50/40 transition-all duration-150 group text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-stone-100 group-hover:bg-amber-100 flex items-center justify-center transition-colors">
            <FileJson size={18} className="text-stone-500 group-hover:text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-stone-700">JSONL</p>
            <p className="text-xs text-stone-400">HuggingFace format</p>
          </div>
          <FileDown size={14} className="ml-auto text-stone-300 group-hover:text-amber-500" />
        </button>
      </div>

      <p className="text-xs text-stone-400 mt-4 leading-relaxed">
        Audio files are stored in Supabase Storage. For full dataset download, export the metadata and
        download each audio file individually using the play button above.
      </p>
    </div>
  );
}
