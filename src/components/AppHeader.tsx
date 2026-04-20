import { Mic2, LogOut, Database } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigation } from "../contexts/NavigationContext";
import EditableText from "./EditableText";

export default function AppHeader() {
  const { user, signOut } = useAuth();
  const { activePage, navigate } = useNavigation();

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-stone-200/80 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-4">

        {/* Logo */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0" dir="rtl">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-sm flex-shrink-0">
            <Mic2 size={16} className="sm:hidden text-white" strokeWidth={1.8} />
            <Mic2 size={20} className="hidden sm:block text-white" strokeWidth={1.8} />
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
          <button
            onClick={() => navigate("transcription")}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-150 ${
              activePage === "transcription"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            <Mic2 size={14} />
            <span className="hidden sm:inline">Transcribe</span>
          </button>
          <button
            onClick={() => navigate("dataset")}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-150 ${
              activePage === "dataset"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            <Database size={14} />
            <span className="hidden sm:inline">Dataset</span>
          </button>
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
