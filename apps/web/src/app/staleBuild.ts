import { lazy, type ComponentType } from "react";

/**
 * A tab opened before a new version of the application went out still asks
 * for the files of the old one; the server no longer has them, so a page
 * loaded on demand fails to load. The tab then reloads itself, once: the new
 * version is what it gets. Another failure soon after is not a stale build and
 * is shown as an error instead of reloading again and again.
 */
const RELOADED_AT = "pms:stale-build-reloaded-at";
const RELOAD_PAUSE_MS = 30_000;

/** Whether an error is a file of the application that could not be loaded. */
export function isStaleBuildError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load module script|Unable to preload CSS|ChunkLoadError|Loading chunk .* failed/i.test(message);
}

type ReloadDeps = { now: () => number; read: () => string | null; write: (value: string) => void; reload: () => void };

const browser: ReloadDeps = {
  now: () => Date.now(),
  read: () => window.sessionStorage.getItem(RELOADED_AT),
  write: (value) => window.sessionStorage.setItem(RELOADED_AT, value),
  reload: () => window.location.reload(),
};

/**
 * Reloads the tab for a newer build, unless it did so a moment ago; answers
 * whether it did. Without a place to remember the reload (storage refused or
 * not kept) it does not reload at all: a failure that lasts would otherwise
 * reload the tab again and again.
 */
export function reloadForNewBuild(deps: ReloadDeps = browser) {
  try {
    const last = Number(deps.read() ?? 0);
    if (Number.isFinite(last) && deps.now() - last < RELOAD_PAUSE_MS) return false;
    const stamp = String(deps.now());
    deps.write(stamp);
    if (deps.read() !== stamp) return false;
  } catch {
    return false;
  }
  deps.reload();
  return true;
}

/** A page or part loaded on demand: a file of an old build makes the tab reload instead of failing. */
export function lazyWithReload<T extends ComponentType<never>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((error: unknown) => {
      // While the tab reloads, the part waits rather than failing.
      if (isStaleBuildError(error) && reloadForNewBuild()) return new Promise<{ default: T }>(() => undefined);
      throw error;
    }),
  );
}

/** A part loaded on demand outside React's lazy: a file of an old build reloads the tab once, else the error stands. */
export function loadOrReload<T>(load: () => Promise<T>): Promise<T> {
  return load().catch((error: unknown) => {
    if (isStaleBuildError(error) && reloadForNewBuild()) return new Promise<T>(() => undefined);
    throw error;
  });
}
