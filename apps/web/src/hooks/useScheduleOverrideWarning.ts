import { useCallback } from "react";
import type { WbsItem, WbsSnapshotResponse } from "../app/domainTypes";
import type { WbsFormState } from "../app/formState";
import { scheduleOverrideNotices } from "../app/scheduleOverride";
import { useI18n } from "../i18n/I18nProvider";
import { intlLocale } from "../i18n/locale";
import type { ToastTone } from "./useAppFeedbackState";

/**
 * After a structure save, warns about dates the user typed that links put back,
 * so a finish held by a finish-to-finish link does not just silently revert.
 * Returns whether it warned, so the caller can leave out the plain "saved".
 */
export function useScheduleOverrideWarning(pushToast: (tone: ToastTone, message: string) => void) {
  const { t, locale } = useI18n();
  return useCallback(
    (sentDrafts: Record<string, WbsFormState>, before: WbsItem[], result: WbsSnapshotResponse) => {
      if (!result.wbsItems) return false;
      const format = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
      const notices = scheduleOverrideNotices({
        sent: Object.fromEntries(
          Object.entries(sentDrafts).map(([id, draft]) => [
            id,
            { startDate: draft.startDate, dueDate: draft.dueDate, workDays: draft.workDays.trim() },
          ]),
        ),
        before,
        saved: result.wbsItems,
        dependencies: result.wbsDependencies ?? [],
        t,
        formatDay: (day) => format.format(new Date(`${day}T00:00:00Z`)),
      });
      for (const notice of notices) pushToast("warning", notice);
      return notices.length > 0;
    },
    [locale, pushToast, t],
  );
}
