import { useCallback, useLayoutEffect, useRef } from "react";

/** A callback that always calls the latest one, though the charts using it are not drawn anew for it. */
export function useLatest<T extends (...args: never[]) => void>(callback: T) {
  const current = useRef(callback);
  useLayoutEffect(() => {
    current.current = callback;
  });
  return useCallback((...args: Parameters<T>) => current.current(...args), []);
}
