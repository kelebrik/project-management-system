export type JiraSyncPollState = {
  status?: string;
  pollAfterMs?: number;
};

type PollOptions<T extends JiraSyncPollState> = {
  poll: () => Promise<T>;
  wait: (delayMs: number) => Promise<void>;
  isCurrent: () => boolean;
  initialDelayMs: number;
  maxDurationMs: number;
  maxConsecutiveFailures?: number;
  now?: () => number;
};

export async function pollJiraSyncRun<T extends JiraSyncPollState>(
  options: PollOptions<T>,
): Promise<{
  outcome: "COMPLETED" | "FAILED" | "BACKGROUND" | "STALE";
  state: T | null;
}> {
  const now = options.now ?? Date.now;
  const deadline = now() + options.maxDurationMs;
  let delayMs = Math.max(3_000, options.initialDelayMs || 3_000);
  let state: T | null = null;
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = Math.max(1, options.maxConsecutiveFailures ?? 3);
  while (now() < deadline) {
    await options.wait(delayMs);
    if (!options.isCurrent()) return { outcome: "STALE", state: null };
    if (now() >= deadline) return { outcome: "BACKGROUND", state };
    try {
      state = await options.poll();
      consecutiveFailures = 0;
    } catch {
      if (!options.isCurrent()) return { outcome: "STALE", state: null };
      consecutiveFailures += 1;
      if (consecutiveFailures >= maxConsecutiveFailures) {
        return { outcome: "BACKGROUND", state };
      }
      delayMs = Math.min(10_000, delayMs * 1.25);
      continue;
    }
    if (!options.isCurrent()) return { outcome: "STALE", state: null };
    if (["SUCCEEDED", "SUCCEEDED_WITH_RETRIES"].includes(state.status ?? "")) {
      return { outcome: "COMPLETED", state };
    }
    if (["FAILED", "CANCELLED", "STOPPED_CAPACITY"].includes(state.status ?? "")) {
      return { outcome: "FAILED", state };
    }
    delayMs = Math.min(
      10_000,
      Math.max(3_000, Number(state.pollAfterMs) || delayMs) * 1.25,
    );
  }
  return { outcome: "BACKGROUND", state };
}
