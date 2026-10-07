import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * The width of an element in pixels, from a ResizeObserver: read without
 * making the browser lay out the page. Follows the element the ref points to,
 * also when it appears later or is replaced.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  const observed = useRef<{ element: HTMLElement | null; observer: ResizeObserver | null }>({ element: null, observer: null });
  useEffect(() => {
    const element = ref.current;
    if (element === observed.current.element) return;
    observed.current.observer?.disconnect();
    const observer = element ? new ResizeObserver(([entry]) => setWidth(Math.round(entry?.contentRect.width ?? 0))) : null;
    if (element && observer) observer.observe(element);
    observed.current = { element, observer };
  });
  useEffect(() => {
    const current = observed;
    return () => {
      current.current.observer?.disconnect();
      // Forgotten, so a remount (React's strict mode does one) observes the element again.
      current.current = { element: null, observer: null };
    };
  }, []);
  return width;
}
