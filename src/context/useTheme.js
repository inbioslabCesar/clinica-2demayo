import { useContext } from "react";
import { ThemeContext } from "./themeConstants";

export function useTheme() {
  return useContext(ThemeContext);
}
