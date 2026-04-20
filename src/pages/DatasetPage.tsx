import { useState, useEffect, useCallback } from "react";
import { Database } from "lucide-react";
import AppHeader from "../components/AppHeader";
import UploadForm from "../components/dataset/UploadForm";
import DatasetItemRow from "../components/dataset/DatasetItemRow";
import ExportPanel from "../components/dataset/ExportPanel";
import { supabase, type DatasetItem } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export default function DatasetPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<DatasetItem[]>([]);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(true);

  const loadItems = useCallback(async () => {
    if (!user) return;
    setLoadingItems(true);
    const { data, error: err } = await supabase
      .from("dataset_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (err) {
      setError("Failed to load dataset items.");
    } else if (data) {
      setItems(data as DatasetItem[]);
      await resolveAudioUrls(data as DatasetItem[]);
    }
    setLoadingItems(false);
  }, [user]);

  const resolveAudioUrls = async (dataItems: DatasetItem[]) => {
    const urlMap: Record<string, string> = {};
    await Promise.all(
      dataItems.map(async (item) => {
        const { data } = await supabase.storage
          .from("dataset-audio")
          .createSignedUrl(item.storage_path, 3600);
        if (data?.signedUrl) urlMap[item.id] = data.signedUrl;
      })
    );
    setAudioUrls(urlMap);
  };

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleUpload = async (file: File, transcription: string, language: string) => {
    if (!user) return;
    setIsUploading(true);
    setError(null);

    const ext = file.name.split(".").pop() ?? "mp3";
    const uniqueName = `${crypto.randomUUID()}.${ext}`;
    const storagePath = `${user.id}/${uniqueName}`;

    const { error: storageErr } = await supabase.storage
      .from("dataset-audio")
      .upload(storagePath, file, { contentType: file.type });

    if (storageErr) {
      setError("Failed to upload audio file. Please try again.");
      setIsUploading(false);
      return;
    }

    const { error: dbErr } = await supabase.from("dataset_items").insert({
      user_id: user.id,
      filename: file.name,
      storage_path: storagePath,
      transcription,
      language,
      file_size_bytes: file.size,
    });

    if (dbErr) {
      setError("Failed to save dataset entry. Please try again.");
      await supabase.storage.from("dataset-audio").remove([storagePath]);
      setIsUploading(false);
      return;
    }

    await loadItems();
    setIsUploading(false);
  };

  const handleDelete = async (id: string, storagePath: string) => {
    await supabase.storage.from("dataset-audio").remove([storagePath]);
    await supabase.from("dataset_items").delete().eq("id", id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setAudioUrls((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100/50">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-5 sm:space-y-8">
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-stone-200/80 shadow-lg shadow-stone-200/20 p-4 sm:p-6 md:p-8">
          <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-sm">
              <Database size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Build Dataset</h2>
              <p className="text-stone-400 text-sm">
                Upload audio clips with transcriptions to create a training dataset
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 mb-6 text-sm font-medium">
              {error}
            </div>
          )}

          <UploadForm onUpload={handleUpload} isUploading={isUploading} />
        </div>

        {items.length > 0 && (
          <ExportPanel items={items} />
        )}

        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-stone-200/80 shadow-lg shadow-stone-200/20 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-stone-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-stone-800">Dataset Items</h3>
              <p className="text-xs text-stone-400 mt-0.5">
                {loadingItems ? "Loading..." : `${items.length} item${items.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>

          {loadingItems ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
                <Database size={24} className="text-stone-300" />
              </div>
              <p className="text-stone-500 font-medium text-sm">No items yet</p>
              <p className="text-stone-400 text-xs mt-1 max-w-xs">
                Upload an audio file with its transcription above to start building your dataset.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {items.map((item) => (
                <DatasetItemRow
                  key={item.id}
                  item={item}
                  audioUrl={audioUrls[item.id] ?? null}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="text-center text-stone-400 text-xs py-8">
        Dataset Builder &middot; yi-whisper
      </footer>
    </div>
  );
}
