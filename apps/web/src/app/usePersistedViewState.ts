import { useEffect, useRef, useState } from "react";

function readStored<T>(key: string, initial: T): T {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return typeof parsed === typeof initial && parsed !== null ? parsed as T : initial;
  } catch { return initial; }
}

export function usePersistedViewState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      return readStored(key, initial);
    } catch { return initial; }
  });
  const previousKey = useRef(key);
  useEffect(() => {
    if (previousKey.current !== key) {
      previousKey.current = key;
      setValue(readStored(key, initial));
      return;
    }
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ }
  }, [key, value, initial]);
  return [value, setValue] as const;
}
