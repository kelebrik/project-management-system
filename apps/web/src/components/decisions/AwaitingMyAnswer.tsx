import { useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import type { Decision } from "../../app/decisions";
import { useI18n } from "../../i18n/I18nProvider";
import { usePageContext } from "../../pages/PageContext";

type Awaiting = Decision & { project: { id: string; code: string; name: string } };

/** Decisions across the projects I can read that wait for my answer; each opens its project's decision log. */
export function AwaitingMyAnswer() {
  const { t, formatters } = useI18n();
  const { selectProject } = usePageContext();
  const [rows, setRows] = useState<Awaiting[]>([]);
  useEffect(() => {
    let active = true;
    apiClient
      .get<Awaiting[]>("/api/decisions/awaiting-me")
      .then((answer) => active && setRows(answer))
      .catch(() => active && setRows([]));
    return () => {
      active = false;
    };
  }, []);
  if (rows.length === 0) return null;
  return (
    <section className="awaiting-my-answer" aria-label={t("ui.decisions.awaitingTitle")}>
      <h3>{t("ui.decisions.awaitingTitle")}</h3>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <button className="link-button" onClick={() => selectProject(row.project.id, "project-decisions")} type="button">
              {row.project.code} · {row.title}
            </button>{" "}
            <span>{t("ui.decisions.awaitingSince", { when: formatters.date(row.requestedAt), who: row.createdByName ?? "—" })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
