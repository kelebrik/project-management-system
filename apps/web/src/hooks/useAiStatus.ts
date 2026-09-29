import { useEffect, useState } from "react";
import { apiClient } from "../api/client";

export type AiStatus = { enabled: boolean; allowed: boolean; provider?: string; model?: string; setup?: "gigachat" | null };

/** Whether the AI helpers can be used here: a model is configured and allowed for this user. */
export function useAiStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    let active = true;
    apiClient
      .get<AiStatus>("/api/ai/status")
      .then((next) => active && setStatus(next))
      .catch(() => active && setStatus({ enabled: false, allowed: false }));
    return () => {
      active = false;
    };
  }, []);
  return {
    status,
    usable: Boolean(status?.enabled && status.allowed),
  };
}
