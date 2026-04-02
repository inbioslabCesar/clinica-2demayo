import { createContext } from "react";

export const DEFAULT_THEME = {
  tema_preset: "purple",
  tema_primary: "#7c3aed",
  tema_primary_dark: "#5b21b6",
  tema_primary_light: "#ede9fe",
  tema_secondary: "#4338ca",
  tema_accent: "#6366f1",
  tema_navbar_bg: "#6b21a8",
  tema_sidebar_from: "#9333ea",
  tema_sidebar_via: "#7e22ce",
  tema_sidebar_to: "#3730a3",
  tema_login_from: "#1e3a8a",
  tema_login_via: "#6b21a8",
  tema_login_to: "#312e81",
};

export const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  presets: {},
  loading: true,
  refreshTheme: () => {},
});
