import { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { stripDiacritics } from "../lib/textUtils";
import AudioInput from "../components/AudioInput";
import TranscriptionResult from "../components/TranscriptionResult";
import TranscriptionHistory from "../components/TranscriptionHistory";
import AddToDatasetPanel from "../components/AddToDatasetPanel";
import AppHeader from "../components/AppHeader";
import LanguageSelector, {
  type Language,
} from "../components/LanguageSelector";
import EditableText from "../components/EditableText";
import { supabase, type Transcription } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import {
  isDirectRunPodConfigured,
  submitDirectToRunPod,
  pollDirectRunPodStatus,
  checkWorkerHealth,
  type WorkerHealth,
} from "../services/runpod";

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const SUBMIT_TIMEOUT_MS = 120_000;

export default function TranscriptionPage() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [inputLanguage, setInputLanguage] = useState<Language>("yiddish");
  const [outputLanguage, setOutputLanguage] = useState<Language>("yiddish");
  const [result, setResult] = useState<{
    text: string;
    textIvrit: string | null;
    ivritError: string | null;
    filename: string;
    outputLang: Language;
    isYiddishJob: boolean;
  } | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [showDatasetPanel, setShowDatasetPanel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<Transcription[]>([]);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealth>({
    status: "checking",
    readyWorkers: 0,
    runningWorkers: 0,
    initializingWorkers: 0,
  });
  const [healthChecking, setHealthChecking] = useState(false);
  const healthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshHealth = useCallback(async () => {
    setHealthChecking(true);
    const health = await checkWorkerHealth();
    setWorkerHealth(health);
    setHealthChecking(false);
  }, []);

  useEffect(() => {
    refreshHealth();
    healthIntervalRef.current = setInterval(refreshHealth, 60_000);
    return () => {
      if (healthIntervalRef.current) clearInterval(healthIntervalRef.current);
    };
  }, [refreshHealth]);;

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from("transcriptions")
      .select("*")
      .eq("user_id", user?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) setHistory(data as Transcription[]);
  }, [user?.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const authHeaders = {
    Authorization: `Bearer ${ANON_KEY}`,
  };

  const processText = async (
    rawText: string,
    inputLang: string,
    outputLang: string
  ): Promise<string> => {
    setStatusMsg("פֿאַרבעסערט טעקסט...");

    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ rawText, inputLang, outputLang }),
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error ?? "Processing failed");
    return data.transcription ?? rawText;
  };

  const pollEdgeStatus = async (jobId: string): Promise<{ rawText: string; rawTextIvrit: string | null; ivritError: string | null }> => {
    const maxWait = 900_000;
    const pollInterval = 3_000;
    const started = Date.now();

    while (Date.now() - started < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));
      const elapsed = Math.round((Date.now() - started) / 1000);
      setStatusMsg(`טראַנסקריבירט... ${elapsed}s`);

      const res = await fetch(`${EDGE_URL}?jobId=${encodeURIComponent(jobId)}`, {
        headers: authHeaders,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `Status check failed: ${res.status}`);
      }

      const data = await res.json();

      if (data.status === "COMPLETED") return {
        rawText: data.rawText ?? "",
        rawTextIvrit: data.rawTextIvrit ?? null,
        ivritError: data.ivritError ?? null,
      };
      if (data.status === "FAILED" || data.status === "CANCELLED") {
        throw new Error(data.error ?? "Transcription job failed");
      }
    }

    throw new Error("Transcription timed out after 15 minutes");
  };

  const saveResult = async (
    file: File,
    rawText: string,
    transcriptionText: string,
    inLang: string,
    outLang: string
  ) => {
    let storagePath: string | null = null;

    if (user?.id) {
      const ext = file.name.split(".").pop() ?? "webm";
      const uniqueName = `${crypto.randomUUID()}.${ext}`;
      storagePath = `${user.id}/${uniqueName}`;
      const { error: uploadErr } = await supabase.storage
        .from("transcription-audio")
        .upload(storagePath, file, { contentType: file.type });
      if (uploadErr) {
        console.error("Audio upload error:", uploadErr);
        storagePath = null;
      }
    }

    const { error: dbError } = await supabase.from("transcriptions").insert({
      filename: file.name,
      raw_transcription: rawText,
      transcription: transcriptionText,
      file_size_bytes: file.size,
      language: inLang,
      output_language: outLang,
      user_id: user?.id,
      storage_path: storagePath,
    });

    if (dbError) {
      console.error("DB insert error:", dbError);
    }

    await loadHistory();
  };

  const handleSaveToDataset = async (correctedText: string) => {
    if (!user || !currentFile) throw new Error("No file available");

    const ext = currentFile.name.split(".").pop() ?? "webm";
    const uniqueName = `${crypto.randomUUID()}.${ext}`;
    const storagePath = `${user.id}/${uniqueName}`;

    const { error: storageErr } = await supabase.storage
      .from("dataset-audio")
      .upload(storagePath, currentFile, { contentType: currentFile.type });

    if (storageErr) throw new Error("Failed to upload audio. Please try again.");

    const { error: dbErr } = await supabase.from("dataset_items").insert({
      user_id: user.id,
      filename: currentFile.name,
      storage_path: storagePath,
      transcription: correctedText,
      language: outputLanguage,
      file_size_bytes: currentFile.size,
    });

    if (dbErr) {
      await supabase.storage.from("dataset-audio").remove([storagePath]);
      throw new Error("Failed to save dataset entry. Please try again.");
    }
  };

  const handleTranscribe = async (file: File) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setCurrentFile(file);
    setShowDatasetPanel(false);
    setStatusMsg("שיקט אַודיאָ...");

    try {
      let inLang: string = inputLanguage;
      let outLang: string = outputLanguage;
      let rawText = "";
      let rawTextIvrit: string | null = null;
      let ivritError: string | null = null;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);

      let submitTimedOut = false;

      try {
        const formData = new FormData();
        formData.append("audio", file);
        formData.append("input_language", inputLanguage);
        formData.append("output_language", outputLanguage);

        const submitRes = await fetch(EDGE_URL, {
          method: "POST",
          headers: authHeaders,
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timer);

        const submitData = await submitRes.json();

        if (!submitRes.ok || submitData.error) {
          setError(submitData.error ?? "Transcription failed. Please try again.");
          return;
        }

        inLang = submitData.inputLang ?? inputLanguage;
        outLang = submitData.outputLang ?? outputLanguage;

        if (submitData.status === "COMPLETED") {
          rawText = submitData.rawText ?? "";
          rawTextIvrit = submitData.rawTextIvrit ?? null;
          ivritError = submitData.ivritError ?? null;
        } else if (submitData.jobId) {
          setStatusMsg("טראַנסקריבירט...");
          const polled = await pollEdgeStatus(submitData.jobId);
          rawText = polled.rawText;
          rawTextIvrit = polled.rawTextIvrit;
          ivritError = polled.ivritError;
        } else {
          setError("Unexpected response from server.");
          return;
        }
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof Error && err.name === "AbortError") {
          submitTimedOut = true;
        } else {
          throw err;
        }
      }

      if (submitTimedOut) {
        if (!isDirectRunPodConfigured()) {
          setError("Edge function timed out and direct RunPod fallback is not configured.");
          return;
        }

        setStatusMsg("דירעקט צו RunPod...");
        const jobId = await submitDirectToRunPod(file);

        setStatusMsg("טראַנסקריבירט...");
        rawText = await pollDirectRunPodStatus(jobId, (elapsed) => {
          setStatusMsg(`טראַנסקריבירט... ${elapsed}s`);
        });
      }

      if (!rawText.trim()) {
        setError("No transcription returned. Please try again.");
        return;
      }

      const transcriptionText = await processText(rawText, inLang, outLang);

      setResult({
        text: transcriptionText,
        textIvrit: rawTextIvrit,
        ivritError,
        filename: file.name,
        outputLang: outputLanguage,
        isYiddishJob: inputLanguage === "yiddish",
      });

      await saveResult(file, rawText, transcriptionText, inputLanguage, outputLanguage);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Network error. Please try again."
      );
    } finally {
      setIsLoading(false);
      setStatusMsg(null);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("transcriptions").delete().eq("id", id);
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const handleEdited = (id: string, newText: string) => {
    setHistory((prev) =>
      prev.map((item) => (item.id === id ? { ...item, transcription: newText } : item))
    );
  };

  const handleAddHistoryItemToDataset = async (
    _id: string,
    transcription: string,
    language: string,
    filename: string
  ) => {
    if (!user) throw new Error("Not logged in");
    const { error } = await supabase.from("dataset_items").insert({
      user_id: user.id,
      filename,
      storage_path: "",
      transcription,
      language,
    });
    if (error) throw new Error("Failed to save to dataset. Please try again.");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100/50">
      <AppHeader />

      <main className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-10">

        {/* Service status banner */}
        <div className="bg-stone-800 border border-stone-700 rounded-2xl px-4 sm:px-5 py-4 mb-5 sm:mb-6">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-stone-700 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertTriangle size={13} className="text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-semibold text-white">
                  Transcription Server Status
                </p>
                <div className="flex items-center gap-2">
                  {/* Status pill */}
                  {workerHealth.status === "checking" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-700 text-stone-300 text-xs font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-pulse" />
                      Checking...
                    </span>
                  ) : workerHealth.status === "online" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-900/60 border border-emerald-700/50 text-emerald-300 text-xs font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Online
                    </span>
                  ) : workerHealth.status === "cold" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-900/40 border border-amber-700/40 text-amber-300 text-xs font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Cold / Starting
                    </span>
                  ) : workerHealth.status === "offline" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-900/40 border border-red-700/40 text-red-300 text-xs font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      Offline
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-700 text-stone-400 text-xs font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-500" />
                      Unknown
                    </span>
                  )}
                  <button
                    onClick={refreshHealth}
                    disabled={healthChecking}
                    className="p-1 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-700 transition-colors disabled:opacity-40"
                    title="Refresh status"
                  >
                    <RefreshCw size={13} className={healthChecking ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {workerHealth.status === "online" && (
                <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
                  The transcription worker is active and ready to accept requests.
                  {workerHealth.readyWorkers + workerHealth.runningWorkers > 0 && (
                    <span className="text-stone-500">
                      {" "}({workerHealth.readyWorkers} ready, {workerHealth.runningWorkers} running)
                    </span>
                  )}
                </p>
              )}
              {workerHealth.status === "cold" && (
                <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
                  The worker is warming up. Your first request may take 1-2 minutes while it initializes.
                </p>
              )}
              {workerHealth.status === "offline" && (
                <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
                  The transcription server appears to be offline. Due to limited funds, it shuts down after inactivity and may need to be restarted. Please try again later.
                </p>
              )}
              {(workerHealth.status === "unknown" || workerHealth.status === "checking") && (
                <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
                  Due to limited funds, the transcription server shuts down automatically after 30 minutes of inactivity.
                </p>
              )}

              <p className="text-xs text-stone-500 mt-2">
                Interested in sponsoring this project?{" "}
                <a
                  href="mailto:heimischgerett@stardev.dev"
                  className="text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors font-medium"
                >
                  Get in touch
                </a>
                {" "}and help keep it running.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-stone-200/80 shadow-lg shadow-stone-200/20 p-4 sm:p-6 md:p-8 mb-6 sm:mb-8">
          <EditableText
            contentKey="main_heading"
            defaultValue="טראַנסקריבירט אַודיאָ"
            as="h2"
            className="text-xl sm:text-2xl font-bold text-stone-900 mb-1 font-hebrew"
            dir="rtl"
          />
          <p
            className="text-stone-500 text-base sm:text-[1.5rem] md:text-[2rem] leading-[1.5] mb-5 sm:mb-6 font-display"
            dir="rtl"
          >
            קלייבט אויס די שפראך פון{" "}
            <span className="font-hebrew">audio</span>{" "}
            און די שפראך פון{" "}
            <span className="font-hebrew">result</span>{" "}
            וואס איר ווילט, דאן קענט איר אפלאודן אדער נעמט אויף.
          </p>

          <div className="mb-6">
            <LanguageSelector
              inputLanguage={inputLanguage}
              outputLanguage={outputLanguage}
              onInputChange={setInputLanguage}
              onOutputChange={setOutputLanguage}
              disabled={isLoading}
            />
          </div>

          <AudioInput onTranscribe={handleTranscribe} isLoading={isLoading} statusMsg={statusMsg} />
        </div>

        {error && (
          <div
            className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 mb-6 text-sm font-medium animate-fade-in font-hebrew"
            dir="rtl"
          >
            {stripDiacritics(error)}
          </div>
        )}

        {result && (
          <div className="mb-8 space-y-6">
            {/* Our fine-tuned model */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-stone-500 uppercase tracking-wider font-hebrew">
                  טראַנסקריפּציע
                </span>
                <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  yiddishstt (fine-tuned)
                </span>
              </div>
              <TranscriptionResult
                text={result.text}
                filename={result.filename}
                language={result.outputLang}
                onAddToDataset={
                  currentFile && !showDatasetPanel
                    ? () => setShowDatasetPanel(true)
                    : undefined
                }
              />
              {showDatasetPanel && currentFile && (
                <AddToDatasetPanel
                  transcription={result.text}
                  language={result.outputLang}
                  file={currentFile}
                  onSave={handleSaveToDataset}
                  onDismiss={() => setShowDatasetPanel(false)}
                />
              )}
            </div>

            {/* Baseline model — always shown for Yiddish jobs */}
            {result.isYiddishJob && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-stone-500 uppercase tracking-wider font-hebrew">
                    טראַנסקריפּציע
                  </span>
                  <span className="text-xs font-medium text-stone-600 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-full">
                    ivrit-ai yi-whisper (baseline)
                  </span>
                </div>
                {result.textIvrit ? (
                  <TranscriptionResult
                    text={result.textIvrit}
                    filename={result.filename}
                    language={result.outputLang}
                  />
                ) : (
                  <div className="bg-stone-50 border border-stone-200 rounded-2xl px-5 py-4 text-sm text-stone-400 font-hebrew">
                    {result.ivritError
                      ? `Baseline model error: ${result.ivritError}`
                      : "Baseline model output not available — the server may be running an older version. Trigger a new RunPod worker cold-start to reload both models."}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <TranscriptionHistory
          items={history}
          onDelete={handleDelete}
          onEdited={handleEdited}
          onAddToDataset={user ? handleAddHistoryItemToDataset : undefined}
        />
      </main>

      <footer className="text-center text-stone-400 text-xs py-6 sm:py-8 font-hebrew">
        yi-whisper &middot; Gemini &middot; Claude
      </footer>
    </div>
  );
}
