import { useCallback, useRef, useState } from "react";

export type ToastTone = "error" | "success";

export type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
};

const MAX_TOASTS = 4;

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
      // не дублируем идентичное сообщение, которое уже висит
      if (prev.some((toast) => toast.tone === tone && toast.message === message)) {
        return prev;
      }
      const id = (idRef.current += 1);
      const next = [...prev, { id, tone, message }];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
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
