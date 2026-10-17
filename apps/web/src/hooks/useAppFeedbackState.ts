import { useCallback, useRef, useState } from "react";

export type ToastTone = "error" | "success" | "warning";

export type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
};

const MAX_TOASTS = 4;

/**
 * The toasts with one more: a message already shown is not shown twice, and
 * when there are too many the oldest goes, an error last of all: errors stay
 * until they are closed or the next attempt succeeds, so they must not be
 * pushed out by notices that pile up.
 */
export function addToast(toasts: Toast[], toast: Toast): Toast[] {
  if (toasts.some((shown) => shown.tone === toast.tone && shown.message === toast.message)) return toasts;
  const next = [...toasts, toast];
  if (next.length <= MAX_TOASTS) return next;
  const victim = next.find((shown) => shown.tone !== "error" && shown.id !== toast.id) ?? next[0]!;
  return next.filter((shown) => shown.id !== victim.id);
}

export function useAppFeedbackState() {
  const [loading, setLoading] = useState(true);
  // error/notice оставлены для инлайн-ошибки на экране входа (AuthPage).
  const [error, setErrorState] = useState<string | null>(null);
  const [notice, setNoticeState] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((tone: ToastTone, message: string) => {
    setToasts((prev) => {
      if (prev.some((toast) => toast.tone === tone && toast.message === message)) return prev;
      return addToast(prev, { id: (idRef.current += 1), tone, message });
    });
  }, []);

  const setError = useCallback(
    (message: string | null) => {
      setErrorState(message);
      if (message) pushToast("error", message);
      else setToasts((prev) => prev.filter((toast) => toast.tone !== "error"));
    },
    [pushToast],
  );

  const setNotice = useCallback(
    (message: string | null) => {
      setNoticeState(message);
      if (message) pushToast("success", message);
      else setToasts((prev) => prev.filter((toast) => toast.tone !== "success"));
    },
    [pushToast],
  );

  return {
    loading,
    setLoading,
    error,
    setError,
    notice,
    setNotice,
    toasts,
    pushToast,
    dismissToast,
  };
}
