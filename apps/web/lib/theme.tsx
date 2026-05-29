/**
 * theme.tsx — Dark-first theme with a light toggle (PRD §6.11).
 *
 * Dark is the default. We persist the user's choice in localStorage and apply
 * it by toggling the `.light` class on <html>, which flips the CSS variables in
 * globals.css. A small inline script in the layout sets the class before paint
 * to avoid a flash of the wrong theme.
 */
"use client";

import * as React from "react";

type Theme = "dark" | "light";
const ThemeContext = React.createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>("dark");

  React.useEffect(() => {
    const stored = (localStorage.getItem("aiab_theme") as Theme) || "dark";
    setTheme(stored);
    document.documentElement.classList.toggle("light", stored === "light");
  }, []);

  const toggle = React.useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("aiab_theme", next);
      document.documentElement.classList.toggle("light", next === "light");
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => React.useContext(ThemeContext);
