import type { ComponentType } from "react";
import { lazyWithReload } from "./staleBuild";

/** A page's render and navigation intent share one import, including its failure. */
export function preloadablePage<T extends ComponentType<never>>(load: () => Promise<{ default: T }>) {
  let pending: ReturnType<typeof load> | undefined;
  const get = () => pending ??= load();
  return Object.assign(lazyWithReload(get), {
    // Speculative loading must not reload the page or produce an unhandled rejection.
    // If navigation follows, lazyWithReload handles the error in the usual way.
    preload: () => { void get().catch(() => undefined); },
  });
}
