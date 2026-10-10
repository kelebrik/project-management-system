/**
 * An id for this tab, sent with every request, so the live updates of a
 * project can leave out the changes this very tab made; another tab of the
 * same person still hears them.
 */
export const liveClientId =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function liveClientHeaders(): Record<string, string> {
  return { "X-PMS-Client": liveClientId };
}
