import { useEffect, useState, useCallback, useRef } from "react";
import { BASE_URL } from "../config/config";
import { ThemeContext, DEFAULT_THEME } from "./themeConstants";

const THEME_CACHE_KEY = "clinica_theme_cache";

function readThemeCache() {
  try {
    const raw = sessionStorage.getItem(THEME_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeThemeCache(tema) {
  try {
    sessionStorage.setItem(THEME_CACHE_KEY, JSON.stringify(tema));
  } catch {
    // quota exceeded, ignore
  }
}

function applyThemeToDom(tema) {
  const root = document.documentElement;
  root.style.setProperty("--color-primary", tema.tema_primary);
  root.style.setProperty("--color-primary-dark", tema.tema_primary_dark);
  root.style.setProperty("--color-primary-light", tema.tema_primary_light);
  root.style.setProperty("--color-secondary", tema.tema_secondary);
  root.style.setProperty("--color-accent", tema.tema_accent);
  root.style.setProperty("--color-navbar-bg", tema.tema_navbar_bg);
  root.style.setProperty("--color-sidebar-from", tema.tema_sidebar_from);
  root.style.setProperty("--color-sidebar-via", tema.tema_sidebar_via);
  root.style.setProperty("--color-sidebar-to", tema.tema_sidebar_to);
  root.style.setProperty("--color-login-from", tema.tema_login_from);
  root.style.setProperty("--color-login-via", tema.tema_login_via);
  root.style.setProperty("--color-login-to", tema.tema_login_to);
}

export function ThemeProvider({ children }) {
  const cached = readThemeCache();
  const [theme, setTheme] = useState(cached || DEFAULT_THEME);
  const [presets, setPresets] = useState({});
  const [loading, setLoading] = useState(true);
  const initialThemeRef = useRef(theme);

  // Apply immediately on mount from cache
  useEffect(() => {
    applyThemeToDom(initialThemeRef.current);
  }, []);

  const fetchTheme = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}api_tema.php`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.success && data.tema) {
        const merged = { ...DEFAULT_THEME, ...data.tema };
        setTheme(merged);
        writeThemeCache(merged);
        applyThemeToDom(merged);
        if (data.presets) setPresets(data.presets);
      }
    } catch {
      // keep cached/default
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTheme();
  }, [fetchTheme]);

  // Listen for theme updates from TemaPage
  useEffect(() => {
    const handler = (e) => {
      const newTheme = e?.detail;
      if (newTheme) {
        const merged = { ...DEFAULT_THEME, ...newTheme };
        setTheme(merged);
        writeThemeCache(merged);
        applyThemeToDom(merged);
      }
    };
    window.addEventListener("clinica-theme-updated", handler);
    return () => window.removeEventListener("clinica-theme-updated", handler);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, presets, loading, refreshTheme: fetchTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
