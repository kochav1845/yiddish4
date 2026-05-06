import { createContext, useContext, useState } from "react";

export type Page = "transcription" | "dataset" | "admin" | "speak";

interface NavigationState {
  activePage: Page;
  navigate: (page: Page) => void;
}

const NavigationContext = createContext<NavigationState | undefined>(undefined);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [activePage, setActivePage] = useState<Page>("transcription");

  return (
    <NavigationContext.Provider value={{ activePage, navigate: setActivePage }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider");
  return ctx;
}
