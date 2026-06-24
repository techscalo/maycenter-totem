import { useEffect, useState } from "react";

type Theme = "light" | "dark";

// El tema real se aplica antes de hidratar con el script inline de __root.tsx.
// Acá arrancamos en "light" (SSR-safe) y sincronizamos con el DOM al montar.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  };

  return { theme, toggle };
}
