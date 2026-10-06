import { useEffect, useState } from "react";
import type { PageDocument } from "@pms/shared";
import { apiClient } from "../../api/client";
import { pageErrorText } from "./pageErrors";
import { useI18n } from "../../i18n/I18nProvider";
import { pageQueryFingerprint, type PageAnswer } from "./pageModel";

/**
 * The answers for all widgets of a page in one request. Asked again only when
 * the scope, the period or a widget's question changes (moving or renaming a
 * widget does not ask), a moment after the last change; an older request is
 * cancelled. The previous answers stay on screen while the next ones load;
 * `current` tells whether the answer on screen is for the questions asked now.
 */
export function usePageAnswers(document: PageDocument | null, refreshKey: number) {
  const { t } = useI18n();
  const fingerprint = document ? pageQueryFingerprint(document) : "";
  const [answered, setAnswered] = useState<{ fingerprint: string; answer: PageAnswer } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const failedText = t("ui.pages.answersFailed");

  useEffect(() => {
    if (!fingerprint) return;
    const [scope, periodDays, queries] = JSON.parse(fingerprint) as [PageDocument["scope"], number, unknown[]];
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      apiClient
        .post<PageAnswer>("/api/pages/query", { scope, periodDays, queries, ...(refreshKey > 0 ? { fresh: true } : {}) }, failedText, controller.signal)
        .then((next) => {
          setAnswered({ fingerprint, answer: next });
          setError("");
        })
        .catch((failure) => {
          if (controller.signal.aborted) return;
          setError(pageErrorText(failure, t, failedText));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [failedText, fingerprint, refreshKey, t]);

  // `current` says the answer is for the questions on the page now, not an earlier set still on screen.
  return { answer: answered?.answer ?? null, current: answered !== null && answered.fingerprint === fingerprint, loading, error };
}
