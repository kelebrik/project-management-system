import { useCallback, useEffect, useRef, useState } from "react";
import { clearFormDraft, readFormDraft, writeFormDraft, type StoredFormDraft } from "../app/formDrafts";

type Options<T> = {
  /** Where the draft is kept; a new key (another project) starts a new session. */
  key: string;
  value: T;
  setValue: (value: T) => void;
  /** Nothing typed: a blank form keeps no draft and a blank stored draft is not offered. Keep it stable (module level or memoised). */
  isBlank: (value: T) => boolean;
  /** Off while the form is not open: nothing is read or written then; turning on starts a new session. */
  enabled?: boolean;
};

type Session<T> = {
  key: string;
  enabled: boolean;
  offer: StoredFormDraft<T> | null;
  /** The value the session started with: it may belong to the session before (another project). */
  held: T;
  token: object;
};

function startSession<T>(key: string, enabled: boolean, value: T, isBlank: (value: T) => boolean): Session<T> {
  // A form that already holds typing goes on being kept; only a blank one is offered what was kept before.
  const stored = enabled && isBlank(value) ? readFormDraft<T>(key) : null;
  return { key, enabled, offer: stored && !isBlank(stored.value) ? stored : null, held: value, token: {} };
}

/**
 * Keeps a form's unfinished value on the device and, on return, offers it:
 * `offer` is the kept draft until the person goes on with it (`restore`) or
 * drops it (`discard`). While an offer waits nothing is written, so what was
 * kept is not lost under a few new keystrokes. A blank form clears the draft;
 * a save that resets the form must clear it itself (clearFormDraft), since
 * the form often closes in the same breath.
 */
export function useRecoverableDraft<T>({ key, value, setValue, isBlank, enabled = true }: Options<T>) {
  const [session, setSession] = useState<Session<T>>(() => startSession(key, enabled, value, isBlank));
  if (session.key !== key || session.enabled !== enabled) setSession(startSession(key, enabled, value, isBlank));
  const { offer, held, token } = session;
  // Once the value has changed in this session, every value is kept, the starting one included.
  const changedRef = useRef<{ token: object; changed: boolean } | null>(null);
  useEffect(() => {
    if (!enabled || offer) return;
    const changed = changedRef.current?.token === token ? changedRef.current.changed : false;
    // The starting value is not written under this key until it changes once: it may be another project's.
    if (!changed && held === value && !isBlank(value)) return;
    changedRef.current = { token, changed: true };
    if (isBlank(value)) clearFormDraft(key);
    else writeFormDraft(key, value);
  }, [enabled, offer, held, token, key, value, isBlank]);
  const restore = useCallback(() => {
    if (offer) setValue(offer.value);
    setSession((current) => ({ ...current, offer: null, held: offer ? offer.value : current.held }));
  }, [offer, setValue]);
  const discard = useCallback(() => {
    clearFormDraft(key);
    setSession((current) => ({ ...current, offer: null }));
  }, [key]);
  return { offer, restore, discard };
}
