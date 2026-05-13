import { useRef, useEffect, useCallback } from "react";
import { Mic2, LogOut, Database, Shield, Volume2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigation } from "../contexts/NavigationContext";
import EditableText from "./EditableText";
import { ADMIN_EMAIL, supabase } from "../lib/supabase";
import { useSiteContent } from "../contexts/SiteContentContext";

const LOGO_PATH = "logo";
const LOGO_BUCKET = "logos";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const { activePage, navigate } = useNavigation();
  const { content, updateContent } = useSiteContent();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fPressTimesRef = useRef<number[]>([]);

  const logoUrl = content["logo_url"] || null;

  const handleLogoUpload = useCallback(async (file: File) => {
    const { error } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(LOGO_PATH, file, { upsert: true, contentType: file.type });

    if (error) {
      console.error("Logo upload failed:", error.message);
      return;
    }

    // Cache-bust with timestamp so browsers re-fetch after replacement
    const url = `${SUPABASE_URL}/storage/v1/object/public/${LOGO_BUCKET}/${LOGO_PATH}?t=${Date.now()}`;
    await updateContent("logo_url", url);
  }, [updateContent]);

  // Triple-F keypress listener — admin only
  useEffect(() => {
    if (!isAdmin) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "f") return;
      const now = Date.now();
      fPressTimesRef.current = [...fPressTimesRef.current, now].filter(
        (t) => now - t < 1500
      );
      if (fPressTimesRef.current.length >= 3) {
        fPressTimesRef.current = [];
        fileInputRef.current?.click();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAdmin]);

  const navItems = [
    { id: "transcription" as const, label: "Transcribe", icon: Mic2 },
    { id: "speak" as const, label: "Speak", icon: Volume2 },
    { id: "dataset" as const, label: "Dataset", icon: Database },
    ...(isAdmin ? [{ id: "admin" as const, label: "Admin", icon: Shield }] : []),
  ];

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-stone-200/80 sticky top-0 z-50">
      {/* Hidden logo upload input */}
      {isAdmin && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleLogoUpload(file);
            e.target.value = "";
          }}
        />
      )}

      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-4">

        {/* Logo */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0" dir="rtl">
          <div
            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl overflow-hidden flex-shrink-0 ${logoUrl ? "" : "bg-gradient-to-br from-amber-500 to-amber-700 shadow-sm flex items-center justify-center"}`}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="w-full h-full object-contain"
              />
            ) : (
              <>
                <Mic2 size={16} className="sm:hidden text-white" strokeWidth={1.8} />
                <Mic2 size={20} className="hidden sm:block text-white" strokeWidth={1.8} />
              </>
            )}
          </div>
          <div className="min-w-0">
            <EditableText
              contentKey="header_title"
              defaultValue="יידיש טרענסילעישן"
              as="h1"
              className="text-sm sm:text-base md:text-lg font-bold text-stone-900 leading-tight font-hebrew truncate"
              dir="rtl"
            />
            <p className="text-stone-400 text-[10px] sm:text-[11px] font-hebrew hidden sm:block" dir="ltr">
              ivrit-ai / yi-whisper-large-v3-turbo
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex items-center bg-stone-100 rounded-xl p-1 gap-0.5 sm:gap-1 flex-shrink-0">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-150 ${
                activePage === id
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>

        {/* User / logout */}
        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          <span
            className="text-stone-400 text-[0.75rem] font-hebrew hidden lg:block truncate max-w-[160px] xl:max-w-[200px]"
            dir="ltr"
          >
            {user?.email}
          </span>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-stone-500 hover:text-red-600 hover:bg-red-50 px-2 sm:px-3 py-2 rounded-lg transition-colors duration-150 text-xs sm:text-sm font-medium"
            dir="rtl"
            title="ארויסלאגן"
          >
            <LogOut size={14} />
            <EditableText
              contentKey="header_logout"
              defaultValue="אַרויסלאָגן"
              as="span"
              className="hidden md:inline font-hebrew"
              dir="rtl"
            />
          </button>
        </div>
      </div>
    </header>
  );
}
