/**
 * Asks to be the one tab of a person that sends their kept writes. The lock
 * is held until released or the tab closes; then the next tab waiting gets
 * it. Without Web Locks no tab sends (they only read). Answers the release.
 */
export function requestLeadership(name: string, onLead: () => void, locks: LockManager | undefined = typeof navigator !== "undefined" ? navigator.locks : undefined) {
  if (!locks) return () => undefined;
  const controller = new AbortController();
  let release: (() => void) | null = null;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  void locks
    .request(name, { mode: "exclusive", signal: controller.signal }, async () => {
      onLead();
      await held;
    })
    .catch(() => undefined);
  return () => {
    controller.abort();
    release?.();
  };
}
