import { useEffect, useState } from "react";
import { X, Mail, MessageSquare } from "lucide-react";

const CHECK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-visitor`;
const CONTACT_EMAIL = "heimischgerett@stardev.dev";

export default function ContactPopup() {
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Fast local check first — avoids flicker on repeat visits
      if (localStorage.getItem("contact_popup_dismissed")) return;

      try {
        const res = await fetch(CHECK_URL, { method: "POST" });
        const data = await res.json();
        if (!data.show || cancelled) return;
      } catch {
        return;
      }

      // Delay slightly so the page settles before the popup appears
      await new Promise((r) => setTimeout(r, 1800));
      if (cancelled) return;

      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimateIn(true));
      });
    }

    check();
    return () => { cancelled = true; };
  }, []);

  function dismiss() {
    setAnimateIn(false);
    localStorage.setItem("contact_popup_dismissed", "1");
    setTimeout(() => setVisible(false), 300);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 sm:p-6"
      style={{
        background: animateIn ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0)",
        backdropFilter: animateIn ? "blur(3px)" : "none",
        transition: "background 0.3s ease, backdrop-filter 0.3s ease",
      }}
      onClick={(e) => e.target === e.currentTarget && dismiss()}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
        style={{
          transform: animateIn ? "translateY(0) scale(1)" : "translateY(40px) scale(0.96)",
          opacity: animateIn ? 1 : 0,
          transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease",
        }}
      >
        {/* Gradient top bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md shadow-amber-200/60 flex-shrink-0">
                <MessageSquare size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-stone-900 font-bold text-lg leading-tight">Share Your Thoughts</h2>
                <p className="text-stone-400 text-xs font-medium mt-0.5">We'd love to hear from you</p>
              </div>
            </div>
            <button
              onClick={dismiss}
              className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors flex-shrink-0 ml-2"
              aria-label="Close"
            >
              <X size={15} className="text-stone-500" />
            </button>
          </div>

          {/* Body */}
          <p className="text-stone-600 text-sm leading-relaxed mb-2">
            We're always working to make Yiddish Labs better. If you have comments, ideas, or suggestions — we genuinely want to hear them.
          </p>
          <p className="text-stone-600 text-sm leading-relaxed mb-6">
            Drop us a line at any time. Every message is read personally.
          </p>

          {/* Email card */}
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Comments%20%26%20Ideas%20%E2%80%94%20Yiddish%20Labs`}
            className="group flex items-center gap-3 w-full bg-amber-50 hover:bg-amber-100 border border-amber-200 hover:border-amber-300 rounded-2xl px-4 py-3.5 transition-all duration-200 mb-5"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-500 group-hover:bg-amber-600 flex items-center justify-center shadow-sm flex-shrink-0 transition-colors">
              <Mail size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-amber-700 font-semibold uppercase tracking-wider mb-0.5">Email us</p>
              <p className="text-stone-800 font-semibold text-sm truncate">{CONTACT_EMAIL}</p>
            </div>
            <span className="text-amber-500 text-xs font-semibold group-hover:translate-x-0.5 transition-transform">
              Open →
            </span>
          </a>

          {/* Dismiss */}
          <button
            onClick={dismiss}
            className="w-full py-2.5 rounded-xl text-stone-400 hover:text-stone-600 text-sm font-medium transition-colors hover:bg-stone-50"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
