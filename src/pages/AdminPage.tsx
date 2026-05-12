import { useState, useEffect, useCallback, useRef } from "react";
import {
  Shield,
  Users,
  Mic2,
  Database,
  Mail,
  Search,
  RefreshCw,
  FileAudio,
  Send,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Play,
  Pause,
  Volume2,
  Save,
} from "lucide-react";
import AppHeader from "../components/AppHeader";
import { supabase, type Profile, type Transcription, type DatasetItem } from "../lib/supabase";
import { stripDiacritics } from "../lib/textUtils";
import { useAuth } from "../contexts/AuthContext";

const SEND_EMAIL_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const DEFAULT_SUBJECT = "היימיש גערעדט — חשובע ידיעות";

const DEFAULT_BODY_TEXT = `א גוט יאר יעדער איינער. א גרויסע שכויח קענען נוצן די גאנצע פלעטפארם. היימיש גערעדט, די פלעטפארם איז 100% פרי. די טרענסקריפטשענס ווערן איבערגעטייטשט אויף אידיש און פארבעסערט דורך איי איי אויב ס'מאכט זיך מיט ספעלינגס.

מיר ווילן בעטן יעדעם איינעם אז מען וויל לאזן קאמענטס אויף וואס מען קען פארבעסערן סיי די יו איי און אנדערע זאכן.

ווי אויך וויל מען לאזן וויסן אז ס'איז דא א קאמפאני וועבסייט ס'הייסט yiddishlabs.com — זיי זענען סאך בעסער פון אונז. אויב מען דארף עכטע אקוראטע טרענסקריפטשען זאל מען גיין צו זיי.

yiddishlabs.com

אויך וועלן מיר בעטן דעם עולם צו גיין איבער די טעקסט און אין די פיוטשער וועט עס זיין סאך בעסער.

עס איז דא א זאך וואס הייסט "דעיטא סעט" ווען איינער פארעכט א recording transcription וועט עס ווערן אריינגעלייגט אין די דאטא סעט און עס גייט ווערן בעסער אין די פיוטשער ווען אנדערע מענטשן וועלן עס נוצן.`;

function buildHtml(bodyText: string): string {
  const paragraphs = bodyText
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px 0;">${p.replace(/yiddishlabs\.com/g, '<a href="https://yiddishlabs.com" style="color:#b45309;font-weight:600;">yiddishlabs.com</a>')}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="yi" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#f59e0b,#b45309);padding:28px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">היימיש גערעדט</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">heimishgeredt.com</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;direction:rtl;text-align:right;font-size:16px;line-height:1.7;color:#292524;">
            ${paragraphs}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #e7e5e4;text-align:center;color:#a8a29e;font-size:12px;">
            heimishgeredt.com
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

interface Stats {
  users: number;
  transcriptions: number;
  datasetItems: number;
}

type Tab = "users" | "transcriptions" | "dataset" | "email";

export default function AdminPage() {
  const { session } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [datasetItems, setDatasetItems] = useState<DatasetItem[]>([]);
  const [stats, setStats] = useState<Stats>({ users: 0, transcriptions: 0, datasetItems: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("users");

  // Email state
  const [emailSubject, setEmailSubject] = useState(DEFAULT_SUBJECT);
  const [emailBody, setEmailBody] = useState(DEFAULT_BODY_TEXT);
  const [recipientMode, setRecipientMode] = useState<"all" | "specific">("all");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  // Audio playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [profilesRes, transcriptionsRes, datasetRes, draftRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("transcriptions").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("dataset_items").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("site_content").select("content_key, content_value").in("content_key", ["email_draft_subject", "email_draft_body"]),
    ]);
    const p = (profilesRes.data ?? []) as Profile[];
    const t = (transcriptionsRes.data ?? []) as Transcription[];
    const d = (datasetRes.data ?? []) as DatasetItem[];
    setProfiles(p);
    setTranscriptions(t);
    setDatasetItems(d);
    setStats({ users: p.length, transcriptions: t.length, datasetItems: d.length });

    if (draftRes.data) {
      const map: Record<string, string> = {};
      draftRes.data.forEach((row) => { map[row.content_key] = row.content_value; });
      if (map["email_draft_subject"]) setEmailSubject(map["email_draft_subject"]);
      if (map["email_draft_body"]) setEmailBody(map["email_draft_body"]);
    }

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

  const handlePlayAudio = async (id: string, storagePath: string) => {
    if (playingId === id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
    }
    let url = audioUrls[id];
    if (!url && storagePath) {
      setLoadingAudioId(id);
      const { data } = await supabase.storage
        .from("dataset-audio")
        .createSignedUrl(storagePath, 3600);
      setLoadingAudioId(null);
      if (data?.signedUrl) {
        url = data.signedUrl;
        setAudioUrls((prev) => ({ ...prev, [id]: url }));
      }
    }
    if (url) {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play();
      setPlayingId(id);
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
    }
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

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return;
    if (recipientMode === "specific" && selectedUserIds.size === 0) return;

    setSending(true);
    setSendError(null);
    setSendResult(null);

    try {
      const res = await fetch(SEND_EMAIL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: emailSubject.trim(),
          html: buildHtml(emailBody),
          sendToAll: recipientMode === "all",
          userIds: recipientMode === "specific" ? Array.from(selectedUserIds) : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setSendError(data.error ?? "Failed to send emails.");
      } else {
        setSendResult({ sent: data.sent, failed: data.failed, total: data.total });
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    setDraftSaved(false);
    await supabase.from("site_content").upsert(
      [
        { content_key: "email_draft_subject", content_value: emailSubject, updated_at: new Date().toISOString() },
        { content_key: "email_draft_body", content_value: emailBody, updated_at: new Date().toISOString() },
      ],
      { onConflict: "content_key" }
    );
    setSavingDraft(false);
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 3000);
  };

  const statCards = [
    { label: "Total Users", value: stats.users, icon: Users, color: "from-blue-500 to-blue-700" },
    { label: "Transcriptions", value: stats.transcriptions, icon: Mic2, color: "from-amber-500 to-amber-700" },
    { label: "Dataset Items", value: stats.datasetItems, icon: Database, color: "from-emerald-500 to-emerald-700" },
  ];

  const dataTabs = [
    { id: "users" as const, label: "Users", icon: Users, count: stats.users },
    { id: "transcriptions" as const, label: "Transcriptions", icon: Mic2, count: stats.transcriptions },
    { id: "dataset" as const, label: "Dataset", icon: Database, count: stats.datasetItems },
    { id: "email" as const, label: "Email", icon: Mail, count: null },
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

        {/* Tabs + content */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-4 border-b border-stone-100">
            <div className="flex items-center bg-stone-100 rounded-xl p-1 gap-0.5 overflow-x-auto">
              {dataTabs.map(({ id, label, icon: Icon, count }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    tab === id
                      ? "bg-white text-stone-900 shadow-sm"
                      : "text-stone-500 hover:text-stone-700"
                  }`}
                >
                  <Icon size={13} />
                  <span className="hidden sm:inline">{label}</span>
                  {count !== null && (
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${tab === id ? "bg-amber-100 text-amber-700" : "bg-stone-200 text-stone-500"}`}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {tab !== "email" && (
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
            )}
          </div>

          {/* Email tab */}
          {tab === "email" && (
            <div className="p-4 sm:p-6 space-y-5">
              {/* Recipients */}
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Recipients</p>
                <div className="flex gap-3 mb-4">
                  <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${recipientMode === "all" ? "border-amber-400 bg-amber-50" : "border-stone-200 hover:border-stone-300"}`}>
                    <input
                      type="radio"
                      name="recipient"
                      value="all"
                      checked={recipientMode === "all"}
                      onChange={() => setRecipientMode("all")}
                      className="accent-amber-500"
                    />
                    <span className="text-sm font-medium text-stone-700">
                      All users <span className="text-stone-400">({stats.users})</span>
                    </span>
                  </label>
                  <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${recipientMode === "specific" ? "border-amber-400 bg-amber-50" : "border-stone-200 hover:border-stone-300"}`}>
                    <input
                      type="radio"
                      name="recipient"
                      value="specific"
                      checked={recipientMode === "specific"}
                      onChange={() => setRecipientMode("specific")}
                      className="accent-amber-500"
                    />
                    <span className="text-sm font-medium text-stone-700">Specific users</span>
                  </label>
                </div>
                {recipientMode === "specific" && (
                  <div className="border border-stone-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {profiles.length === 0 ? (
                      <p className="text-sm text-stone-400 p-4 text-center">No users found</p>
                    ) : (
                      profiles.map((p) => (
                        <label key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 cursor-pointer border-b border-stone-100 last:border-0">
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(p.id)}
                            onChange={() => toggleUser(p.id)}
                            className="accent-amber-500"
                          />
                          <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-stone-600">
                            {(p.email ?? "?")[0].toUpperCase()}
                          </div>
                          <span className="text-sm text-stone-700 truncate">{p.email ?? p.id}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2 block">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  dir="rtl"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-sm font-hebrew focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                />
              </div>

              {/* Body */}
              <div>
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2 block">
                  Message body <span className="text-stone-400 font-normal normal-case">(plain text — rendered as HTML email)</span>
                </label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  dir="rtl"
                  lang="yi"
                  rows={14}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-sm font-hebrew text-right leading-relaxed resize-y focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all"
                />
              </div>

              {/* Result / error */}
              {sendResult && (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3.5">
                  <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
                  <p className="text-sm font-medium text-emerald-800">
                    Sent to {sendResult.sent} of {sendResult.total} recipients.
                    {sendResult.failed > 0 && ` ${sendResult.failed} failed.`}
                  </p>
                </div>
              )}
              {sendError && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3.5">
                  <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
                  <p className="text-sm font-medium text-red-700">{sendError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-1 flex-wrap">
                <button
                  onClick={handleSendEmail}
                  disabled={
                    sending ||
                    !emailSubject.trim() ||
                    !emailBody.trim() ||
                    (recipientMode === "specific" && selectedUserIds.size === 0)
                  }
                  className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:from-stone-200 disabled:to-stone-200 disabled:text-stone-400 text-white font-bold text-sm px-6 py-3 rounded-xl transition-all shadow-sm"
                >
                  {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {sending ? "Sending…" : `Send Email${recipientMode === "all" ? " to All" : selectedUserIds.size > 0 ? ` to ${selectedUserIds.size}` : ""}`}
                </button>

                <button
                  onClick={handleSaveDraft}
                  disabled={savingDraft}
                  className="flex items-center gap-2 bg-white hover:bg-stone-50 border border-stone-200 hover:border-stone-300 text-stone-700 font-semibold text-sm px-5 py-3 rounded-xl transition-all"
                >
                  {savingDraft ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  {savingDraft ? "Saving…" : "Save Draft"}
                </button>

                {draftSaved && (
                  <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                    <CheckCircle2 size={15} />
                    Draft saved
                  </span>
                )}

                {sendResult && (
                  <button
                    onClick={() => setSendResult(null)}
                    className="text-sm text-stone-400 hover:text-stone-600 transition-colors ml-auto"
                  >
                    Send another
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Data tabs */}
          {tab !== "email" && (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
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
                            <p className="text-sm text-stone-800 leading-relaxed font-hebrew line-clamp-2" dir="auto">
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

                  {tab === "dataset" && (
                    <div className="divide-y divide-stone-100">
                      {filteredDataset.length === 0 ? (
                        <EmptyState icon={Database} text="No dataset items found" />
                      ) : (
                        filteredDataset.map((d) => {
                          const hasAudio = !!d.storage_path;
                          const isPlaying = playingId === d.id;
                          const isLoadingAudio = loadingAudioId === d.id;
                          return (
                            <div key={d.id} className="px-4 sm:px-6 py-3.5 hover:bg-stone-50 transition-colors">
                              <div className="flex items-start gap-3">
                                {/* Play button */}
                                <div className="flex-shrink-0 mt-0.5">
                                  {hasAudio ? (
                                    <button
                                      onClick={() => handlePlayAudio(d.id, d.storage_path)}
                                      disabled={isLoadingAudio}
                                      title={isPlaying ? "Pause" : "Play recording"}
                                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm border ${
                                        isPlaying
                                          ? "bg-emerald-500 hover:bg-emerald-600 border-emerald-400 text-white"
                                          : isLoadingAudio
                                          ? "bg-stone-100 border-stone-200 text-stone-400"
                                          : "bg-white hover:bg-emerald-50 border-stone-200 hover:border-emerald-300 text-stone-500 hover:text-emerald-600"
                                      }`}
                                    >
                                      {isLoadingAudio ? (
                                        <Loader2 size={13} className="animate-spin" />
                                      ) : isPlaying ? (
                                        <Pause size={13} />
                                      ) : (
                                        <Play size={13} className="translate-x-0.5" />
                                      )}
                                    </button>
                                  ) : (
                                    <div
                                      className="w-8 h-8 rounded-full flex items-center justify-center bg-stone-50 border border-stone-100 text-stone-300"
                                      title="No audio file"
                                    >
                                      <Volume2 size={12} />
                                    </div>
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
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
                                  <p className="text-sm text-stone-800 leading-relaxed font-hebrew line-clamp-2" dir="auto">
                                    {stripDiacritics(d.transcription ?? "")}
                                  </p>
                                  <p className="text-xs text-stone-400 mt-1 flex items-center gap-1">
                                    <Users size={10} />
                                    {emailFor(d.user_id)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </>
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