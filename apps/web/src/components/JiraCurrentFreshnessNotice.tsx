import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { intlLocale } from "../i18n/locale";
import { useI18n as useLocaleTranslation } from "../i18n/I18nProvider";
import type { Locale } from "../i18n/types";
import type { JiraCurrentFreshness } from "@pms/shared";
import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";

function refreshedAtLabel(value: string | null, uiLocale: Locale) {
  if (!value) return null;
  return new Intl.DateTimeFormat(intlLocale(uiLocale), {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function JiraCurrentFreshnessNotice({
  freshness,
  error,
}: {
  freshness: JiraCurrentFreshness | null;
  error: string | null;
}) {
  const { t: uiText } = useInterfaceTranslation();
  const { locale: uiLocale } = useLocaleTranslation();
  if (error) {
    return <div className="jira-current-freshness error" title={error}>
      <TriangleAlert size={14} />
      <span>{uiText("ui.jira.jiraFreshnessNotChecked")}</span>
    </div>;
  }
  if (!freshness || freshness.state === "NOT_CONFIGURED") return null;
  if (freshness.state === "REFRESHING") {
    const refreshedAt = refreshedAtLabel(freshness.refreshedAt, uiLocale);
    return <div className="jira-current-freshness refreshing">
      <RefreshCw size={14} />
      <span>{refreshedAt
        ? `Обновляю Jira; показаны данные на ${refreshedAt}`
        : uiText("ui.jira.jiraRefreshingNeverLoaded")}</span>
    </div>;
  }
  if (freshness.state === "FRESH") {
    return <div className="jira-current-freshness fresh">
      <CheckCircle2 size={14} />
      <span>{uiText("ui.jira.jiraCurrentAsOf")} {refreshedAtLabel(freshness.refreshedAt, uiLocale)}</span>
    </div>;
  }
  const refreshedAt = refreshedAtLabel(freshness.refreshedAt, uiLocale);
  return <div className="jira-current-freshness stale">
    <TriangleAlert size={14} />
    <span>{refreshedAt
      ? `Данные Jira могут быть устаревшими; обновлены ${refreshedAt}`
      : uiText("ui.jira.jiraDataNeverLoaded")}</span>
  </div>;
}
