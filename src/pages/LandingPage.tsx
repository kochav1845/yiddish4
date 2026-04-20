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
} from "lucide-react";

interface LandingPageProps {
  onGetStarted: () => void;
}

export default function LandingPage({ onGetStarted }: LandingPageProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            <span
              className={`text-base sm:text-xl font-bold transition-colors ${
                scrolled ? "text-stone-900" : "text-white"
              }`}
            >
              YidTranscribe
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            {[
              { label: "Home", id: "hero" },
              { label: "Contact", id: "contact" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className={`text-sm font-medium transition-colors hover:text-amber-500 ${
                  scrolled ? "text-stone-700" : "text-white/90"
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={onGetStarted}
              className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 lg:px-5 py-2.5 rounded-lg transition-all shadow-md shadow-amber-200/30 hover:shadow-lg hover:shadow-amber-200/50"
            >
              Get Started
            </button>
          </nav>

          {/* Mobile hamburger */}
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

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-stone-100 shadow-xl animate-fade-in">
            <div className="px-4 py-3 space-y-1">
              {[
                { label: "Home", id: "hero" },
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
                Get Started
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ===== HERO ===== */}
      <section
        id="hero"
        className="relative min-h-screen flex items-center overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        }}
      >
        {/* Background blobs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 left-4 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 bg-amber-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-4 sm:right-10 w-64 sm:w-96 h-64 sm:h-96 bg-amber-600/8 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[500px] lg:w-[600px] h-[300px] sm:h-[500px] lg:h-[600px] bg-amber-400/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-28 pb-16 sm:pt-32 sm:pb-20 lg:py-32 grid md:grid-cols-2 gap-8 md:gap-12 items-center w-full">
          {/* Copy */}
          <div className="animate-slide-up text-center md:text-left">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-3 sm:px-4 py-1.5 sm:py-2 mb-6 sm:mb-8">
              <Mic2 size={12} className="text-amber-400 sm:hidden" />
              <Mic2 size={14} className="text-amber-400 hidden sm:block" />
              <span className="text-white/80 text-xs sm:text-sm">AI-Powered Transcription</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-4 sm:mb-6">
              Transcribe Yiddish
              <br />
              <em className="not-italic bg-gradient-to-r from-amber-400 to-amber-500 bg-clip-text text-transparent">
                with AI Precision
              </em>
            </h1>
            <p className="text-white/70 text-base sm:text-lg leading-relaxed mb-7 sm:mb-10 max-w-lg mx-auto md:mx-0">
              Transform spoken Yiddish into accurate text instantly. Our advanced
              AI model understands dialect nuances and delivers professional-grade
              transcriptions.
            </p>
            <div className="flex flex-wrap gap-3 sm:gap-4 justify-center md:justify-start">
              <button
                onClick={onGetStarted}
                className="group flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl transition-all shadow-xl shadow-amber-500/25 hover:shadow-2xl hover:shadow-amber-500/30 text-sm sm:text-base"
              >
                Start Transcribing
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform sm:hidden" />
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform hidden sm:block" />
              </button>
            </div>
          </div>

          {/* Mock UI card — visible on tablet+ */}
          <div className="hidden md:flex justify-center">
            <div className="relative w-full max-w-[360px] lg:max-w-[420px]">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-transparent rounded-3xl blur-2xl scale-110" />
              <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-5 lg:p-8">
                <div className="flex items-center gap-2 lg:gap-3 mb-4 lg:mb-6">
                  <div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-amber-400" />
                  <div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full bg-green-400" />
                </div>
                <div className="space-y-3 lg:space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <Mic2 size={15} className="text-amber-400 lg:hidden" />
                      <Mic2 size={18} className="text-amber-400 hidden lg:block" />
                    </div>
                    <div className="flex-1">
                      <div className="h-2 bg-white/20 rounded-full w-3/4 mb-2" />
                      <div className="h-2 bg-white/10 rounded-full w-1/2" />
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 lg:p-4 border border-white/10">
                    <p className="text-white/60 text-xs lg:text-sm font-hebrew leading-relaxed" dir="rtl">
                      דאס איז א ביישפיל פון א טראנסקריפציע...
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-7 lg:h-8 bg-amber-500/20 rounded-lg flex-1" />
                    <div className="h-7 lg:h-8 bg-white/10 rounded-lg flex-1" />
                    <div className="h-7 lg:h-8 bg-white/10 rounded-lg w-14 lg:w-20" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-16 sm:h-24 bg-gradient-to-t from-white to-transparent" />
      </section>

      {/* ===== FOOTER / CONTACT ===== */}
      <footer id="contact" className="bg-stone-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
          <div className="grid md:grid-cols-2 gap-10 lg:gap-16">
            {/* Contact form */}
            <div>
              <h3 className="text-xl sm:text-2xl font-bold mb-5 sm:mb-6">Get In Touch</h3>
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

            {/* About */}
            <div className="md:pl-4 lg:pl-12">
              <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">
                More About <em className="not-italic text-amber-400">YidTranscribe</em>
              </h2>
              <p className="text-white/60 leading-relaxed mb-6 sm:mb-8 text-sm">
                YidTranscribe is an AI-powered platform dedicated to preserving and
                digitizing Yiddish speech. Built on cutting-edge whisper models fine-tuned
                for Yiddish, we deliver the most accurate Yiddish transcription available today.
                Whether you are a researcher, educator, or language enthusiast, our tools
                make Yiddish accessible to everyone.
              </p>
              <div className="flex gap-3">
                {[Facebook, Twitter, Linkedin].map((Icon, i) => (
                  <button
                    key={i}
                    className="w-10 h-10 rounded-xl bg-white/10 hover:bg-amber-500 flex items-center justify-center transition-all duration-200"
                  >
                    <Icon size={16} className="text-white" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <p className="text-white/40 text-xs sm:text-sm text-center sm:text-left">
              Copyright 2026 YidTranscribe. All rights reserved.
            </p>
            <button
              onClick={onGetStarted}
              className="text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors"
            >
              Sign In to Dashboard
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
