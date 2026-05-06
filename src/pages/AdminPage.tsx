import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Users,
  Mic2,
  Database,
  ChevronLeft,
  Search,
  RefreshCw,
  FileAudio,
} from "lucide-react";
import AppHeader from "../components/AppHeader";
import { supabase, type Profile, type Transcription, type DatasetItem } from "../lib/supabase";
import { stripDiacritics } from "../lib/textUtils";

interface Stats {
  users: number;
  transcriptions: number;
  datasetItems: number;
}

export default function AdminPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [datasetItems, setDatasetItems] = useState<DatasetItem[]>([]);
  const [stats, setStats] = useState<Stats>({ users: 0, transcriptions: 0, datasetItems: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"users" | "transcriptions" | "dataset">("users");

  const load = useCallback(async () => {
    setLoading(true);
    const [profilesRes, transcriptionsRes, datasetRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("transcriptions").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("dataset_items").select("*").order("created_at", { ascending: false }).limit(500),
    ]);
    const p = (profilesRes.data ?? []) as Profile[];
    const t = (transcriptionsRes.data ?? []) as Transcription[];
    const d = (datasetRes.data ?? []) as DatasetItem[];
    setProfiles(p);
    setTranscriptions(t);
    setDatasetItems(d);
    setStats({ users: p.length, transcriptions: t.length, datasetItems: d.length });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const fmtSize = (bytes: number | null) => {
    if (!bytes) return "—";
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const emailFor = (userId: string | null) => {
    if (!userId) return "—";
    return profiles.find((p) => p.id === userId)?.email ?? userId.slice(0, 8) + "…";
  };

  const filteredProfiles = profiles.filter((p) =>
    !search || p.email?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredTranscriptions = transcriptions.filter((t) =>
    !search ||
    t.transcription?.toLowerCase().includes(search.toLowerCase()) ||
    t.filename?.toLowerCase().includes(search.toLowerCase()) ||
    emailFor(t.user_id).toLowerCase().includes(search.toLowerCase())
  );
  const filteredDataset = datasetItems.filter((d) =>
    !search ||
    d.transcription?.toLowerCase().includes(search.toLowerCase()) ||
    d.filename?.toLowerCase().includes(search.toLowerCase()) ||
    emailFor(d.user_id).toLowerCase().includes(search.toLowerCase())
  );

  const statCards = [
    { label: "Total Users", value: stats.users, icon: Users, color: "from-blue-500 to-blue-700" },
    { label: "Transcriptions", value: stats.transcriptions, icon: Mic2, color: "from-amber-500 to-amber-700" },
    { label: "Dataset Items", value: stats.datasetItems, icon: Database, color: "from-emerald-500 to-emerald-700" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100/50">
      <AppHeader />

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-6">

        {/* Page title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-stone-700 to-stone-900 flex items-center justify-center shadow-sm">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">Admin Dashboard</h2>
            <p className="text-stone-400 text-sm">All users and activity across the platform</p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="ml-auto flex items-center gap-2 text-stone-500 hover:text-stone-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3 sm:gap-5">
          {statCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-stone-200/80 shadow-sm p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-sm flex-shrink-0`}>
                <Icon size={18} className="text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-stone-900">{loading ? "—" : value.toLocaleString()}</p>
                <p className="text-xs text-stone-400 font-medium">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search + tabs */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-4 border-b border-stone-100">
            {/* Tabs */}
            <div className="flex items-center bg-stone-100 rounded-xl p-1 gap-0.5">
              {([
                { id: "users", label: "Users", icon: Users, count: stats.users },
                { id: "transcriptions", label: "Transcriptions", icon: Mic2, count: stats.transcriptions },
                { id: "dataset", label: "Dataset", icon: Database, count: stats.datasetItems },
              ] as const).map(({ id, label, icon: Icon, count }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    tab === id
                      ? "bg-white text-stone-900 shadow-sm"
                      : "text-stone-500 hover:text-stone-700"
                  }`}
                >
                  <Icon size={13} />
                  <span className="hidden sm:inline">{label}</span>
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${tab === id ? "bg-amber-100 text-amber-700" : "bg-stone-200 text-stone-500"}`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="relative sm:ml-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-4 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all w-full sm:w-56"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Users tab */}
              {tab === "users" && (
                <div className="divide-y divide-stone-100">
                  {filteredProfiles.length === 0 ? (
                    <EmptyState icon={Users} text="No users found" />
                  ) : (
                    filteredProfiles.map((p) => (
                      <div key={p.id} className="flex items-center gap-4 px-4 sm:px-6 py-3.5 hover:bg-stone-50 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-stone-200 to-stone-300 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-stone-600">
                            {(p.email ?? "?")[0].toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-800 truncate">{p.email ?? "—"}</p>
                          <p className="text-xs text-stone-400">ID: {p.id.slice(0, 16)}…</p>
                        </div>
                        <p className="text-xs text-stone-400 flex-shrink-0 hidden sm:block">{fmtDate(p.created_at)}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Transcriptions tab */}
              {tab === "transcriptions" && (
                <div className="divide-y divide-stone-100">
                  {filteredTranscriptions.length === 0 ? (
                    <EmptyState icon={Mic2} text="No transcriptions found" />
                  ) : (
                    filteredTranscriptions.map((t) => (
                      <div key={t.id} className="px-4 sm:px-6 py-3.5 hover:bg-stone-50 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileAudio size={12} className="text-amber-500 flex-shrink-0" />
                            <span className="text-xs text-stone-500 truncate">{t.filename}</span>
                            <span className="text-xs text-stone-300">·</span>
                            <span className="text-xs text-stone-400 capitalize">{t.language ?? "—"}</span>
                            <span className="text-xs text-stone-300">·</span>
                            <span className="text-xs text-stone-400">{fmtSize(t.file_size_bytes)}</span>
                          </div>
                          <p className="text-xs text-stone-400 flex-shrink-0 hidden sm:block">{fmtDate(t.created_at)}</p>
                        </div>
                        <p
                          className="text-sm text-stone-800 leading-relaxed font-hebrew line-clamp-2"
                          dir="auto"
                        >
                          {stripDiacritics(t.transcription ?? "")}
                        </p>
                        <p className="text-xs text-stone-400 mt-1 flex items-center gap-1">
                          <Users size={10} />
                          {emailFor(t.user_id)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Dataset tab */}
              {tab === "dataset" && (
                <div className="divide-y divide-stone-100">
                  {filteredDataset.length === 0 ? (
                    <EmptyState icon={Database} text="No dataset items found" />
                  ) : (
                    filteredDataset.map((d) => (
                      <div key={d.id} className="px-4 sm:px-6 py-3.5 hover:bg-stone-50 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileAudio size={12} className="text-emerald-500 flex-shrink-0" />
                            <span className="text-xs text-stone-500 truncate">{d.filename}</span>
                            <span className="text-xs text-stone-300">·</span>
                            <span className="text-xs text-stone-400 capitalize">{d.language ?? "—"}</span>
                            <span className="text-xs text-stone-300">·</span>
                            <span className="text-xs text-stone-400">{fmtSize(d.file_size_bytes)}</span>
                          </div>
                          <p className="text-xs text-stone-400 flex-shrink-0 hidden sm:block">{fmtDate(d.created_at)}</p>
                        </div>
                        <p
                          className="text-sm text-stone-800 leading-relaxed font-hebrew line-clamp-2"
                          dir="auto"
                        >
                          {stripDiacritics(d.transcription ?? "")}
                        </p>
                        <p className="text-xs text-stone-400 mt-1 flex items-center gap-1">
                          <Users size={10} />
                          {emailFor(d.user_id)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="text-center text-stone-400 text-xs py-8">
        Admin &middot; yi-whisper
      </footer>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mb-4">
        <Icon size={24} className="text-stone-300" />
      </div>
      <p className="text-stone-400 text-sm font-medium">{text}</p>
    </div>
  );
}
