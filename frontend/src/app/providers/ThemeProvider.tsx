import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ThemeContext,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

const STORAGE_KEY = "azalens-theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "night";
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "day"
    : "night";
}

function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const storedPreference = window.localStorage.getItem(STORAGE_KEY);

  return storedPreference === "day" || storedPreference === "night"
    ? storedPreference
    : "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] =
    useState<ThemePreference>(getStoredPreference);
  const [systemTheme, setSystemTheme] =
    useState<ResolvedTheme>(getSystemTheme);
  const resolvedTheme =
    preference === "system" ? systemTheme : preference;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => {
      setSystemTheme(mediaQuery.matches ? "day" : "night");
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme =
      resolvedTheme === "day" ? "light" : "dark";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", resolvedTheme === "day" ? "#F5F8F6" : "#050807");
  }, [resolvedTheme]);

  function setPreference(nextPreference: ThemePreference) {
    setPreferenceState(nextPreference);

    if (nextPreference === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, nextPreference);
  }

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      setPreference,
    }),
    [preference, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
