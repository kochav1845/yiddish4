import { useState, useRef } from "react";
import { Volume2, Loader2, Play, Pause, RotateCcw, User } from "lucide-react";
import AppHeader from "../components/AppHeader";

const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tts`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const SPEAKERS = [
  { id: 0, label: "קול א", sublabel: "Lithuanian dialect, female" },
  { id: 1, label: "קול ב", sublabel: "Lithuanian dialect, male" },
  { id: 2, label: "קול ג", sublabel: "Polish dialect, female" },
];

const EXAMPLE_TEXTS = [
  "א גוטן טאג",
  "ווי גייסטו?",
  "איך בין א ייד",
  "שבת שלום",
];

export default function SpeakPage() {
  const [text, setText] = useState("");
  const [speakerId, setSpeakerId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleSpeak = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setAudioUrl(null);

    try {
      const res = await fetch(TTS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: text.trim(), speaker_id: speakerId }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error ?? "TTS failed. Please try again.");
        return;
      }

      // Convert base64 WAV to blob URL
      const byteStr = atob(data.audio_b64);
      const bytes = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      // Auto-play
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play();
          setPlaying(true);
        }
      }, 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  const handleRestart = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play();
    setPlaying(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100/50">
      <AppHeader />

      <main className="max-w-2xl mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-5">

        {/* Title */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-sm">
            <Volume2 size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900 font-hebrew" dir="rtl">
              ייִדיש רעדן
            </h2>
            <p className="text-stone-400 text-sm">Yiddish Text-to-Speech &mdash; REYD system</p>
          </div>
        </div>

        {/* Main card */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-stone-200/80 shadow-lg shadow-stone-200/20 p-4 sm:p-6 space-y-5">

          {/* Speaker selector */}
          <div>
            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3 block">
              Choose a voice
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SPEAKERS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSpeakerId(s.id)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
                    speakerId === s.id
                      ? "border-amber-400 bg-amber-50 shadow-sm"
                      : "border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    speakerId === s.id ? "bg-amber-100" : "bg-stone-100"
                  }`}>
                    <User size={16} className={speakerId === s.id ? "text-amber-600" : "text-stone-400"} />
                  </div>
                  <span className={`text-sm font-bold font-hebrew ${speakerId === s.id ? "text-amber-700" : "text-stone-700"}`}>
                    {s.label}
                  </span>
                  <span className="text-[10px] text-stone-400 leading-tight">{s.sublabel}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Text input */}
          <div>
            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2 block">
              Yiddish text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              dir="rtl"
              lang="yi"
              rows={5}
              placeholder="שרייבט דא אייַדיש טעקסט..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 text-lg leading-relaxed font-hebrew text-right resize-y focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all placeholder:text-stone-300"
            />
            {/* Quick examples */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {EXAMPLE_TEXTS.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setText(ex)}
                  className="text-xs font-hebrew text-stone-500 hover:text-amber-700 bg-stone-100 hover:bg-amber-50 border border-stone-200 hover:border-amber-200 px-2.5 py-1 rounded-lg transition-all"
                  dir="rtl"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* Speak button */}
          <button
            onClick={handleSpeak}
            disabled={loading || !text.trim()}
            className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:from-stone-200 disabled:to-stone-200 disabled:text-stone-400 text-white font-bold text-base py-3.5 rounded-xl transition-all shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Creating speech…</span>
              </>
            ) : (
              <>
                <Volume2 size={18} />
                <span>Speak</span>
              </>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm font-medium">
            {error}
          </div>
        )}

        {/* Audio player */}
        {audioUrl && (
          <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-5 animate-slide-up">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4">
              Audio output
            </p>
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handlePlayPause}
                className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-md hover:shadow-lg transition-all active:scale-95"
              >
                {playing
                  ? <Pause size={20} className="text-white" />
                  : <Play size={20} className="text-white ml-0.5" />
                }
              </button>
              <button
                onClick={handleRestart}
                className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors"
                title="Restart"
              >
                <RotateCcw size={15} className="text-stone-500" />
              </button>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-medium text-stone-700 font-hebrew leading-relaxed line-clamp-2"
                  dir="rtl"
                >
                  {text}
                </p>
                <p className="text-xs text-stone-400 mt-0.5">
                  {SPEAKERS[speakerId].label} &middot; {SPEAKERS[speakerId].sublabel}
                </p>
              </div>
              <a
                href={audioUrl}
                download="yiddish-tts.wav"
                className="text-xs text-stone-400 hover:text-amber-600 transition-colors underline underline-offset-2 flex-shrink-0"
              >
                Download
              </a>
            </div>
          </div>
        )}

        {/* Info box */}
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-5 space-y-2">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">About this voice system</p>
          <p className="text-sm text-stone-600 leading-relaxed">
            Powered by <strong>REYD</strong> (Reading Electronic Yiddish Documents) — the first dedicated Yiddish
            text-to-speech system, developed at the University of Edinburgh (Interspeech 2022). Uses FastSpeech&nbsp;2
            + HiFi-GAN, trained on ~8 hours of speech from three native speakers across Lithuanian and Polish dialects.
          </p>
        </div>
      </main>

      <footer className="text-center text-stone-400 text-xs py-8">
        REYD TTS &middot; University of Edinburgh &middot; Interspeech 2022
      </footer>
    </div>
  );
}
