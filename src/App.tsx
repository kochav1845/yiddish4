import { useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { SiteContentProvider } from "./contexts/SiteContentContext";
import { NavigationProvider, useNavigation } from "./contexts/NavigationContext";
import LoginPage from "./pages/LoginPage";
import TranscriptionPage from "./pages/TranscriptionPage";
import DatasetPage from "./pages/DatasetPage";
import LandingPage from "./pages/LandingPage";
import { Loader2 } from "lucide-react";

function AppContent() {
  const { user, loading } = useAuth();
  const { activePage } = useNavigation();
  const [showApp, setShowApp] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-amber-600" />
      </div>
    );
  }

  if (user) {
    return (
      <SiteContentProvider>
        {activePage === "dataset" ? <DatasetPage /> : <TranscriptionPage />}
      </SiteContentProvider>
    );
  }

  if (showApp) {
    return <LoginPage onBack={() => setShowApp(false)} />;
  }

  return <LandingPage onGetStarted={() => setShowApp(true)} />;
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationProvider>
        <AppContent />
      </NavigationProvider>
    </AuthProvider>
  );
}
