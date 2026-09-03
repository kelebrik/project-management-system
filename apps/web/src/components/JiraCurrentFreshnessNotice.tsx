import type { JiraCurrentFreshness } from "@pms/shared";
import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";

function refreshedAtLabel(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("ru-RU", {
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
  if (error) {
    return <div className="jira-current-freshness error" title={error}>
      <TriangleAlert size={14} />
      <span>Актуальность Jira не проверена</span>
    </div>;
  }
  if (!freshness || freshness.state === "NOT_CONFIGURED") return null;
  if (freshness.state === "REFRESHING") {
    const refreshedAt = refreshedAtLabel(freshness.refreshedAt);
    return <div className="jira-current-freshness refreshing">
      <RefreshCw size={14} />
      <span>{refreshedAt
        ? `Обновляю Jira; показаны данные на ${refreshedAt}`
        : "Обновляю Jira; ранее данные ещё не загружались"}</span>
    </div>;
  }
  if (freshness.state === "FRESH") {
    return <div className="jira-current-freshness fresh">
      <CheckCircle2 size={14} />
      <span>Jira актуальна на {refreshedAtLabel(freshness.refreshedAt)}</span>
    </div>;
  }
  const refreshedAt = refreshedAtLabel(freshness.refreshedAt);
  return <div className="jira-current-freshness stale">
    <TriangleAlert size={14} />
    <span>{refreshedAt
      ? `Данные Jira могут быть устаревшими; обновлены ${refreshedAt}`
      : "Данные Jira ещё не загружались"}</span>
  </div>;
}
