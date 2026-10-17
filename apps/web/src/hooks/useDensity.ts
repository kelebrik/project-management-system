import { useCallback, useEffect, useState } from "react";

export type DensityMode = "comfortable" | "compact";

const STORAGE_KEY = "pms-density";

function readInitialDensity(): DensityMode {
  if (typeof window === "undefined") return "comfortable";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "comfortable" || stored === "compact") return stored;
  } catch {
    /* localStorage может быть недоступен — игнорируем */
  }
  return "comfortable";
}

function applyDensity(mode: DensityMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = mode;
}

/* Плотность строк в таблицах: обычная или компактная; выбор живёт в localStorage, как тема. */
export function useDensity() {
  const [density, setDensity] = useState<DensityMode>(readInitialDensity);

  useEffect(() => {
    applyDensity(density);
    try {
      window.localStorage.setItem(STORAGE_KEY, density);
    } catch {
      /* игнорируем недоступность localStorage */
    }
  }, [density]);

  const toggleDensity = useCallback(() => {
    setDensity((prev) => (prev === "compact" ? "comfortable" : "compact"));
  }, []);

  return { density, toggleDensity };
}
