import { useState, useEffect } from "react";
import {
  Mic2,
  Menu,
  X,
  ArrowRight,
  Send,
  Facebook,
  Twitter,
  Linkedin,
  Upload,
  Wand2,
  Download,
  Globe,
  BookOpen,
  Users,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from "lucide-react";

interface LandingPageProps {
  onGetStarted: () => void;
}

const FAQS = [
  {
    q: "What is Yiddish Labs?",
    a: "Yiddish Labs is a free AI-powered platform that transcribes spoken Yiddish into accurate written text. It supports all major Yiddish dialects and handles audio file uploads as well as live microphone recording.",
  },
  {
    q: "Is Yiddish transcription accurate?",
    a: "Yes. Yiddish Labs is built on a fine-tuned Whisper model trained specifically on Yiddish speech, achieving high accuracy across Ashkenazi, Litvish, and Galician dialects — far outperforming generic multilingual models.",
  },
  {
    q: "Is Yiddish speech-to-text free to use?",
    a: "Yes. Create a free account and start transcribing Yiddish audio immediately. Upload audio files (WAV, MP3, M4A, FLAC, OGG, WEBM) or record directly in your browser.",
  },
  {
    q: "Which Yiddish dialects are supported?",
    a: "Yiddish Labs supports the three main Yiddish dialect groups: Ashkenazi (American/Eastern European), Litvish (Lithuanian/Northeastern), and Galician (Polish/Southern).",
  },
  {
    q: "Can I translate Yiddish to English?",
    a: "Yes. In addition to Yiddish transcription, Yiddish Labs can output the result in English or Hebrew, making it a complete Yiddish translation and transcription solution.",
  },
  {
    q: "What file formats are supported for Yiddish transcription?",
    a: "Yiddish Labs accepts WAV, MP3, M4A, FLAC, OGG, and WEBM audio files, as well as MP4 video. You can also record directly from your microphone for instant Yiddish speech-to-text conversion.",
  },
];

const FEATURES = [
  {
    icon: Mic2,
    title: "Yiddish Audio Transcription",
    desc: "Upload any audio or video file and receive a precise Yiddish text transcription within seconds, powered by a fine-tuned AI model.",
  },
  {
    icon: Globe,
    title: "Multi-Dialect Yiddish Support",
    desc: "Accurately transcribes Ashkenazi, Litvish, and Galician Yiddish — the three major dialect groups spoken worldwide.",
  },
  {
    icon: Wand2,
    title: "Yiddish Translation to English & Hebrew",
    desc: "Optionally translate Yiddish speech directly to English or Hebrew text. The only AI tool combining Yiddish transcription and translation.",
  },
  {
    icon: Download,
    title: "Export & Copy Yiddish Text",
    desc: "Copy your Yiddish transcription to clipboard instantly, or export your entire transcription history in multiple formats.",
  },
  {
    icon: FlaskConical,
    title: "Yiddish Dataset Builder",
    desc: "Build and export labelled Yiddish speech datasets for AI training — export in CSV, JSON, or HuggingFace JSONL format.",
  },
  {
    icon: BookOpen,
    title: "Oral History & Research Tools",
    desc: "Purpose-built for Yiddish language researchers, archivists, and educators who need reliable Yiddish transcription at scale.",
  },
];

const USE_CASES = [
  {
    icon: Users,
    title: "Yiddish Language Researchers",
    desc: "Transcribe hours of recorded Yiddish speech from oral history projects, field recordings, and archival audio in minutes.",
  },
  {
    icon: BookOpen,
    title: "Educators & Students",
    desc: "Create accurate Yiddish study materials. Transcribe Yiddish lectures, songs, and stories to build learning resources.",
  },
  {
    icon: Globe,
    title: "Heritage & Community Organizations",
    desc: "Preserve Yiddish culture by digitizing spoken recordings. Convert family interviews and community tapes to searchable text.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Upload or Record Yiddish Audio",
    desc: "Drop in an audio or video file, or click to record live from your microphone. Supports WAV, MP3, M4A, FLAC, OGG, and WEBM.",
  },
  {
    step: "2",
    title: "AI Transcribes Your Yiddish Speech",
    desc: "Our fine-tuned Yiddish AI model processes the audio and converts every word of spoken Yiddish into accurate written text.",
  },
  {
    step: "3",
    title: "Copy, Export, or Translate",
    desc: "Your Yiddish transcription appears instantly. Copy to clipboard, download, or translate to English or Hebrew in one click.",
  },
];

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen font-sans">

      {/* ===== HEADER ===== */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-white/95 backdrop-blur-md shadow-md py-2.5 sm:py-3"
            : "bg-transparent py-4 sm:py-5"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2 sm:gap-2.5 group"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-200/40 group-hover:shadow-amber-300/60 transition-shadow">
              <Mic2 size={16} className="sm:hidden text-white" strokeWidth={1.8} />
              <Mic2 size={20} className="hidden sm:block text-white" strokeWidth={1.8} />
            </div>
            <span className={`text-base sm:text-xl font-bold transition-colors ${scrolled ? "text-stone-900" : "text-white"}`}>
              Yiddish Labs
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            {[
              { label: "Features", id: "features" },
              { label: "How It Works", id: "how-it-works" },
              { label: "FAQ", id: "faq" },
              { label: "Contact", id: "contact" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className={`text-sm font-medium transition-colors hover:text-amber-500 ${scrolled ? "text-stone-700" : "text-white/90"}`}
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={onGetStarted}
              className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 lg:px-5 py-2.5 rounded-lg transition-all shadow-md shadow-amber-200/30 hover:shadow-lg hover:shadow-amber-200/50"
            >
              Get Started Free
            </button>
          </nav>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X size={22} className={scrolled ? "text-stone-900" : "text-white"} />
            ) : (
              <Menu size={22} className={scrolled ? "text-stone-900" : "text-white"} />
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-stone-100 shadow-xl animate-fade-in">
            <div className="px-4 py-3 space-y-1">
              {[
                { label: "Features", id: "features" },
                { label: "How It Works", id: "how-it-works" },
                { label: "FAQ", id: "faq" },
                { label: "Contact", id: "contact" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className="block w-full text-left px-4 py-3 text-stone-700 hover:bg-stone-50 rounded-lg text-sm font-medium transition-colors"
                >
                  {item.label}
                </button>
              ))}
              <button
                onClick={onGetStarted}
                className="w-full mt-2 bg-amber-500 text-white font-semibold py-3 rounded-lg text-sm"
              >
                Get Started Free
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ===== HERO ===== */}
      <section
        id="hero"
        className="relative min-h-screen flex items-center overflow-hidden"
        style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-amber-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-4 sm:right-10 w-64 sm:w-96 h-64 sm:h-96 bg-amber-600/8 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[500px] lg:w-[600px] h-[300px] sm:h-[500px] lg:h-[600px] bg-amber-400/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-16 sm:pt-32 sm:pb-20 lg:py-32 grid md:grid-cols-2 gap-8 md:gap-12 items-center w-full">
          <div className="animate-slide-up text-center md:text-left">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 mb-5 sm:mb-7">
              <Mic2 size={13} className="text-amber-400" />
              <span className="text-white/80 text-xs sm:text-sm font-medium">AI-Powered Yiddish Tool</span>
            </div>

            {/* PRIMARY H1 — contains "Yiddish Translation" for SEO */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-4 sm:mb-5">
              Yiddish Translation
              <br />
              <em className="not-italic bg-gradient-to-r from-amber-400 to-amber-500 bg-clip-text text-transparent">
                &amp; AI Transcription
              </em>
            </h1>

            {/* This paragraph mirrors the meta description closely — Google will pick it up */}
            <p className="text-white/75 text-base sm:text-lg leading-relaxed mb-4 max-w-lg mx-auto md:mx-0">
              AI-powered Yiddish speech-to-text transcription. Convert Yiddish audio and video to accurate text instantly — all dialects supported, free online.
            </p>
            <p className="text-white/55 text-sm sm:text-base leading-relaxed mb-7 sm:mb-9 max-w-lg mx-auto md:mx-0">
              Transcribe Ashkenazi, Litvish, and Galician Yiddish with a fine-tuned Whisper AI model. The most accurate Yiddish transcription tool available online.
            </p>

            <div className="flex flex-wrap gap-3 sm:gap-4 justify-center md:justify-start">
              <button
                onClick={onGetStarted}
                className="group flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl transition-all shadow-xl shadow-amber-500/25 hover:shadow-2xl hover:shadow-amber-500/30 text-sm sm:text-base"
              >
                Start Transcribing Free
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => scrollTo("how-it-works")}
                className="flex items-center gap-2 text-white/70 hover:text-white border border-white/20 hover:border-white/40 font-medium px-5 sm:px-6 py-3.5 rounded-xl transition-all text-sm sm:text-base"
              >
                How It Works
              </button>
            </div>

            {/* Trust signals */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-8 justify-center md:justify-start">
              {["Free to use", "All dialects", "Instant results"].map((tag) => (
                <div key={tag} className="flex items-center gap-1.5 text-white/50 text-xs sm:text-sm">
                  <CheckCircle2 size={13} className="text-amber-400" />
                  <span>{tag}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mock UI card */}
          <div className="hidden md:flex justify-center">
            <div className="relative w-full max-w-[360px] lg:max-w-[420px]">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-transparent rounded-3xl blur-2xl scale-110" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-5 lg:p-8">
                <div className="flex items-center gap-2 mb-4 lg:mb-6">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                  <span className="ml-2 text-white/30 text-xs">Yiddish Labs</span>
                </div>
                <div className="space-y-3 lg:space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <Mic2 size={16} className="text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <div className="h-2 bg-white/20 rounded-full w-3/4 mb-2" />
                      <div className="h-2 bg-white/10 rounded-full w-1/2" />
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 lg:p-4 border border-white/10">
                    <p className="text-white/40 text-[10px] mb-1.5 font-mono">Yiddish Transcription</p>
                    <p className="text-white/70 text-xs lg:text-sm font-hebrew leading-relaxed" dir="rtl">
                      דאס איז א ביישפיל פון א טראנסקריפציע...
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-7 bg-amber-500/20 rounded-lg flex-1 flex items-center px-2">
                      <span className="text-amber-400 text-[10px]">Copy</span>
                    </div>
                    <div className="h-7 bg-white/10 rounded-lg flex-1 flex items-center px-2">
                      <span className="text-white/40 text-[10px]">Translate</span>
                    </div>
                    <div className="h-7 bg-white/10 rounded-lg w-14 flex items-center px-2">
                      <span className="text-white/40 text-[10px]">Export</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-16 sm:h-24 bg-gradient-to-t from-white to-transparent" />
      </section>

      {/* ===== STATS TRUST BAR ===== */}
      <section className="bg-stone-900 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
            {[
              { value: "3", label: "Yiddish Dialects", sub: "Ashkenazi · Litvish · Galician" },
              { value: "8+", label: "Audio Formats", sub: "WAV · MP3 · M4A · FLAC · more" },
              { value: "100%", label: "Free to Use", sub: "No credit card required" },
              { value: "AI", label: "Fine-Tuned Model", sub: "Whisper — Yiddish-specific" },
            ].map(({ value, label, sub }) => (
              <div key={label} className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-amber-400 mb-1">{value}</p>
                <p className="text-white font-semibold text-xs sm:text-sm">{label}</p>
                <p className="text-white/40 text-[10px] sm:text-xs mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="py-16 sm:py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            {/* H2 with key SEO phrase */}
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-stone-900 mb-4">
              Free Yiddish Speech to Text Online
            </h2>
            <p className="text-stone-500 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              Everything you need to transcribe, translate, and preserve Yiddish language audio — in one free online tool built for researchers, educators, and communities.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group bg-stone-50 hover:bg-amber-50 border border-stone-200 hover:border-amber-200 rounded-2xl p-5 sm:p-6 transition-all duration-200 hover:shadow-md hover:shadow-amber-100/50"
              >
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center mb-4 shadow-sm group-hover:shadow-amber-200/40 transition-shadow">
                  <Icon size={18} className="text-white" />
                </div>
                <h3 className="font-bold text-stone-800 text-base sm:text-[1.05rem] mb-2">{title}</h3>
                <p className="text-stone-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section
        id="how-it-works"
        className="py-16 sm:py-20 lg:py-24"
        style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4">
              How Yiddish Transcription Works
            </h2>
            <p className="text-white/60 text-base sm:text-lg max-w-2xl mx-auto">
              Three steps to convert your Yiddish audio into accurate written text — no technical knowledge required.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 sm:gap-8 relative">
            {/* Connector line */}
            <div className="hidden sm:block absolute top-8 left-1/3 right-1/3 h-px bg-gradient-to-r from-amber-500/30 via-amber-400/50 to-amber-500/30" />

            {HOW_IT_WORKS.map(({ step, title, desc }) => (
              <div key={step} className="text-center relative">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-amber-500/20">
                  <span className="text-white font-bold text-xl sm:text-2xl">{step}</span>
                </div>
                <h3 className="text-white font-bold text-base sm:text-lg mb-3">{title}</h3>
                <p className="text-white/55 text-sm leading-relaxed max-w-xs mx-auto">{desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12 sm:mt-14">
            <button
              onClick={onGetStarted}
              className="group inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-7 sm:px-9 py-3.5 sm:py-4 rounded-xl transition-all shadow-xl shadow-amber-500/25 text-sm sm:text-base"
            >
              Try Yiddish Transcription Free
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </section>

      {/* ===== USE CASES ===== */}
      <section className="py-16 sm:py-20 lg:py-24 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-stone-900 mb-4">
              Who Uses Yiddish Labs
            </h2>
            <p className="text-stone-500 text-base sm:text-lg max-w-xl mx-auto">
              Trusted by the global Yiddish-speaking community for language preservation, research, and education.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-5 sm:gap-6">
            {USE_CASES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white border border-stone-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-4">
                  <Icon size={18} className="text-amber-600" />
                </div>
                <h3 className="font-bold text-stone-800 text-base mb-2">{title}</h3>
                <p className="text-stone-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== ABOUT YIDDISH — TOPICAL AUTHORITY CONTENT ===== */}
      <section className="py-16 sm:py-20 lg:py-24 bg-stone-50" itemScope itemType="https://schema.org/Article">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-2 gap-10 lg:gap-16 items-start">
            <div>
              <p className="text-amber-600 text-xs font-bold uppercase tracking-widest mb-3">About the Language</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 mb-5">
                What is Yiddish?
              </h2>
              <div className="space-y-4 text-stone-600 text-sm sm:text-base leading-relaxed" itemProp="description">
                <p>
                  Yiddish (<span lang="yi" dir="rtl">ייִדיש</span>) is a Germanic language spoken by Ashkenazi Jewish communities
                  for over a thousand years. It developed in the Rhineland region of Germany and spread
                  throughout Central and Eastern Europe, blending German, Hebrew, Aramaic, and Slavic
                  linguistic elements into a rich and expressive language.
                </p>
                <p>
                  Before World War II, Yiddish was spoken by an estimated 11 to 13 million people worldwide.
                  Today, the language is experiencing a revival — spoken by Hasidic communities, taught in
                  universities, and preserved through organizations like the
                  {" "}<strong>YIVO Institute for Jewish Research</strong> in New York.
                </p>
                <p>
                  Yiddish is written in <strong>Hebrew script</strong>, read right-to-left. The three main
                  dialect groups — <strong>Ashkenazi</strong> (Central), <strong>Litvish</strong> (Northeastern),
                  and <strong>Galician</strong> (Southeastern) — differ in pronunciation and vocabulary,
                  making dialect-aware transcription and translation tools essential.
                </p>
              </div>
            </div>
            <div>
              <p className="text-amber-600 text-xs font-bold uppercase tracking-widest mb-3">About the Technology</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 mb-5">
                How the AI Works
              </h2>
              <div className="space-y-4 text-stone-600 text-sm sm:text-base leading-relaxed">
                <p>
                  Yiddish Labs is powered by a <strong>fine-tuned Whisper AI model</strong> trained
                  specifically on Yiddish speech data. Unlike generic multilingual models that treat
                  Yiddish as a low-resource afterthought, our model is purpose-built for Yiddish
                  phonology, script, and dialect variation.
                </p>
                <p>
                  For <strong>Yiddish translation</strong>, the AI processes both the acoustic speech signal
                  and the semantic content of the transcribed Yiddish text to produce fluent, natural
                  English or Hebrew output — not a word-for-word gloss.
                </p>
                <p>
                  The <strong>Yiddish transcription</strong> output follows standard YIVO orthography
                  conventions, making it usable for academic research, publication, and archival work.
                  All processing happens server-side with privacy-safe handling of your audio data.
                </p>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                {["Whisper AI", "YIVO Orthography", "Ashkenazi", "Litvish", "Galician", "Hebrew Script"].map((tag) => (
                  <span key={tag} className="inline-flex items-center px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="py-16 sm:py-20 lg:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-stone-900 mb-4">
              Frequently Asked Questions about Yiddish Transcription
            </h2>
            <p className="text-stone-500 text-base sm:text-lg">
              Everything you need to know about our free Yiddish speech-to-text and translation tool.
            </p>
          </div>

          <div className="space-y-3">
            {FAQS.map(({ q, a }, i) => (
              <div
                key={i}
                className="border border-stone-200 rounded-2xl overflow-hidden hover:border-amber-200 transition-colors duration-150"
              >
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-stone-50 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <h3 className="font-semibold text-stone-800 text-sm sm:text-base pr-4">{q}</h3>
                  {openFaq === i ? (
                    <ChevronUp size={16} className="text-amber-500 flex-shrink-0" />
                  ) : (
                    <ChevronDown size={16} className="text-stone-400 flex-shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 animate-fade-in">
                    <p className="text-stone-600 text-sm leading-relaxed">{a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA BANNER ===== */}
      <section className="py-14 sm:py-16"
        style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4">
            Start Your Yiddish Translation Today
          </h2>
          <p className="text-white/60 text-base sm:text-lg mb-8 max-w-xl mx-auto">
            Join researchers, educators, and communities using Yiddish Labs to preserve and digitize the Yiddish language. Free to use, no credit card required.
          </p>
          <button
            onClick={onGetStarted}
            className="group inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-8 sm:px-10 py-4 rounded-xl transition-all shadow-xl shadow-amber-500/30 text-sm sm:text-base"
          >
            Get Started for Free
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* ===== FOOTER / CONTACT ===== */}
      <footer id="contact" className="bg-stone-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
          <div className="grid md:grid-cols-2 gap-10 lg:gap-16">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold mb-5 sm:mb-6">Get In Touch</h2>
              <form onSubmit={(e) => e.preventDefault()} className="space-y-3 sm:space-y-4">
                <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                  <input
                    type="text"
                    placeholder="Full Name"
                    className="bg-white/10 border border-white/10 rounded-xl px-4 sm:px-5 py-3 sm:py-3.5 text-white placeholder:text-white/40 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all text-sm w-full"
                  />
                  <input
                    type="email"
                    placeholder="E-Mail Address"
                    className="bg-white/10 border border-white/10 rounded-xl px-4 sm:px-5 py-3 sm:py-3.5 text-white placeholder:text-white/40 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all text-sm w-full"
                  />
                </div>
                <textarea
                  rows={4}
                  placeholder="Your Message"
                  className="w-full bg-white/10 border border-white/10 rounded-xl px-4 sm:px-5 py-3 sm:py-3.5 text-white placeholder:text-white/40 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition-all text-sm resize-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl transition-all shadow-lg shadow-amber-500/20 text-sm"
                >
                  <Send size={15} />
                  Send Message
                </button>
              </form>
            </div>

            <div className="md:pl-4 lg:pl-12">
              <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">
                About <em className="not-italic text-amber-400">Yiddish Labs</em>
              </h2>
              <p className="text-white/60 leading-relaxed mb-4 text-sm">
                Yiddish Labs is a free AI-powered platform for Yiddish transcription and translation. Built on fine-tuned Whisper models trained specifically for Yiddish speech, it delivers the most accurate Yiddish speech-to-text results available today.
              </p>
              <p className="text-white/60 leading-relaxed mb-6 text-sm">
                Whether you are a researcher digitizing oral history, an educator creating Yiddish learning materials, or a community organization preserving Yiddish heritage recordings — Yiddish Labs gives you professional-grade Yiddish transcription for free.
              </p>
              <div className="flex gap-3">
                {[Facebook, Twitter, Linkedin].map((Icon, i) => (
                  <button
                    key={i}
                    className="w-10 h-10 rounded-xl bg-white/10 hover:bg-amber-500 flex items-center justify-center transition-all duration-200"
                    aria-label="Social link"
                  >
                    <Icon size={16} className="text-white" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer nav — more page links for SEO */}
        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
              <div>
                <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-3">Tools</p>
                <ul className="space-y-2">
                  {["Yiddish Transcription", "Yiddish Translation", "Speech to Text", "Audio to Text"].map((l) => (
                    <li key={l}>
                      <button
                        onClick={onGetStarted}
                        className="text-white/55 hover:text-amber-400 text-xs transition-colors"
                      >
                        {l}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-3">Languages</p>
                <ul className="space-y-2">
                  {["Yiddish to English", "Yiddish to Hebrew", "Ashkenazi Yiddish", "Litvish Yiddish"].map((l) => (
                    <li key={l}>
                      <button
                        onClick={onGetStarted}
                        className="text-white/55 hover:text-amber-400 text-xs transition-colors"
                      >
                        {l}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-3">Use Cases</p>
                <ul className="space-y-2">
                  {["Research", "Education", "Heritage Orgs", "Dataset Building"].map((l) => (
                    <li key={l}>
                      <button
                        onClick={() => scrollTo("features")}
                        className="text-white/55 hover:text-amber-400 text-xs transition-colors"
                      >
                        {l}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-3">Support</p>
                <ul className="space-y-2">
                  {["FAQ", "How It Works", "Features", "Contact Us"].map((l, i) => (
                    <li key={l}>
                      <button
                        onClick={() => scrollTo(["faq", "how-it-works", "features", "contact"][i])}
                        className="text-white/55 hover:text-amber-400 text-xs transition-colors"
                      >
                        {l}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-white/30 text-xs text-center sm:text-left">
                Copyright 2026 Yiddish Labs. All rights reserved. &middot; Free Yiddish Transcription &amp; Translation Online.
              </p>
              <button
                onClick={onGetStarted}
                className="text-amber-400 hover:text-amber-300 text-xs font-medium transition-colors"
              >
                Sign In to Dashboard
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
