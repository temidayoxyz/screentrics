import { useEffect, useState } from "react";

export type ThemeName = "light" | "dark";

const KEY = "screentrics-theme";

export function applyStoredTheme() {
  const stored = localStorage.getItem(KEY);
  const theme: ThemeName =
    stored === "light" || stored === "dark"
      ? stored
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  document.documentElement.dataset.theme = theme;
}

export function Icon({ name }: { name: string }) {
  return <i className={`bi bi-${name}`} aria-hidden="true" />;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeName>(
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const dark = theme === "dark";
  return (
    <button
      className="icon-button"
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}
