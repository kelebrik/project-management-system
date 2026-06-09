import { useState } from "react";

export function useAppFeedbackState() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return {
    loading,
    setLoading,
    error,
    setError,
    notice,
    setNotice,
  };
}
