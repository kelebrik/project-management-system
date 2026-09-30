import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { groupByProject, shiftWeek, type Confidence, type MyWork, type MyWorkItem, type TeamWeek } from "../app/myWork";
import { SegmentedFilter } from "../components/SegmentedFilter";
import { useI18n } from "../i18n/I18nProvider";
import "../styles/my-work.css";
import { usePageContext } from "./PageContext";

const CONFIDENCE: Confidence[] = ["ON_TRACK", "AT_RISK", "OFF_TRACK"];
type Tab = "mine" | "team";

/** One row of my work with this week's word on it. */
function CheckInRow({ item, onSaved }: { item: MyWorkItem; onSaved: () => void }) {
  const { t, formatters } = useI18n();
  const [confidence, setConfidence] = useState<Confidence | null>(item.checkIn?.confidence ?? null);
  const [done, setDone] = useState(item.checkIn?.done ?? "");
  const [blocker, setBlocker] = useState(item.checkIn?.blocker ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!confidence) return;
    setBusy(true);
    setError("");
    try {
      await apiClient.put("/api/my-work/check-ins", { wbsItemId: item.id, confidence, done, blocker }, t("ui.myWork.failed"));
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.myWork.failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`my-work-row ${item.overdue ? "overdue" : ""}`}>
      <div className="my-work-head">
        <strong>
          {item.code} {item.title}
        </strong>
        <span>
          {formatters.date(item.startDate)} – {formatters.date(item.dueDate)}
          {item.overdue && <b className="my-work-overdue"> · {t("ui.myWork.overdue")}</b>}
        </span>
        {item.checkIn && <small>{t("ui.myWork.savedAt", { when: formatters.dateTime(item.checkIn.updatedAt) })}</small>}
      </div>
      <div className="my-work-confidence" role="radiogroup" aria-label={t("ui.myWork.confidence", { row: item.code })}>
        {CONFIDENCE.map((value) => (
          <button aria-checked={confidence === value} className={confidence === value ? `active ${value}` : value} disabled={busy} key={value} onClick={() => setConfidence(value)} role="radio" type="button">
            {t(`ui.myWork.conf.${value}`)}
          </button>
        ))}
      </div>
      <div className="my-work-notes">
        <input aria-label={t("ui.myWork.done")} disabled={busy} maxLength={1000} onChange={(event) => setDone(event.target.value)} placeholder={t("ui.myWork.done")} value={done} />
        <input aria-label={t("ui.myWork.blocker")} disabled={busy} maxLength={1000} onChange={(event) => setBlocker(event.target.value)} placeholder={t("ui.myWork.blocker")} value={blocker} />
        <button className="primary" disabled={busy || !confidence} onClick={() => void save()} type="button">
          {t("ui.myWork.save")}
        </button>
      </div>
      {error && (
        <p className="automation-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

/**
 * My work across projects with a weekly word on each piece (on track, at risk,
 * off track, what got done, what is in the way), and for the chosen project
 * the team's words of a week and who has not given one.
 */
export function MyWorkPage() {
  const { t, formatters } = useI18n();
  const { project } = usePageContext();
  const [tab, setTab] = useState<Tab>("mine");
  const [mine, setMine] = useState<MyWork | null>(null);
  const [team, setTeam] = useState<TeamWeek | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadMine = useCallback(() => {
    apiClient
      .get<MyWork>("/api/my-work", t("ui.myWork.failed"))
      .then(setMine)
      .catch((failure) => setError(failure instanceof Error ? failure.message : t("ui.myWork.failed")));
  }, [t]);
  useEffect(loadMine, [loadMine]);
  useEffect(() => {
    if (tab !== "team" || !project) return;
    let active = true;
    apiClient
      .get<TeamWeek>(`/api/projects/${project.id}/check-ins${week ? `?week=${week}` : ""}`, t("ui.myWork.failed"))
      .then((answer) => active && setTeam(answer))
      .catch((failure) => active && setError(failure instanceof Error ? failure.message : t("ui.myWork.failed")));
    return () => {
      active = false;
    };
  }, [project, t, tab, week]);

  return (
    <section className="v2-page my-work-page">
      <div className="v2-compact-header">
        <div>
          <h2>{t("ui.myWork.title")}</h2>
          <span>{t("ui.myWork.description")}</span>
        </div>
      </div>
      <SegmentedFilter<Tab>
        ariaLabel={t("ui.myWork.title")}
        onChange={setTab}
        options={[
          { value: "mine", label: t("ui.myWork.tabMine") },
          { value: "team", label: t("ui.myWork.tabTeam") },
        ]}
        value={tab}
      />
      {error && <p className="automation-error">{error}</p>}
      {tab === "mine" && mine && (
        <>
          {mine.reason === "NOT_LINKED" ? (
            <p className="my-work-hint">{t("ui.myWork.notLinked")}</p>
          ) : (
            <p className="my-work-hint">{t("ui.myWork.intro", { person: mine.person ?? "", week: formatters.date(mine.weekStart) })}</p>
          )}
          {mine.person && mine.items.length === 0 && <p>{t("ui.myWork.none")}</p>}
          {groupByProject(mine.items).map((group) => (
            <section className="my-work-group" key={group.code}>
              <h3>
                {group.code} {group.name}
              </h3>
              {group.items.map((item) => (
                <CheckInRow item={item} key={`${item.id}:${item.checkIn?.updatedAt ?? ""}`} onSaved={loadMine} />
              ))}
            </section>
          ))}
        </>
      )}
      {tab === "team" && (
        <>
          {!project && <p>{t("ui.raci.chooseProject")}</p>}
          {project && team && (
            <>
              <div className="my-work-week">
                <button onClick={() => setWeek(shiftWeek(team.weekStart, -1))} type="button">
                  ←
                </button>
                <span>{t("ui.myWork.week", { week: formatters.date(team.weekStart) })}</span>
                <button onClick={() => setWeek(shiftWeek(team.weekStart, 1))} type="button">
                  →
                </button>
              </div>
              {team.notCheckedIn.length > 0 && <p className="my-work-missing">{t("ui.myWork.notCheckedIn", { people: team.notCheckedIn.join(", ") })}</p>}
              {team.checkIns.length === 0 ? (
                <p>{t("ui.myWork.noCheckIns")}</p>
              ) : (
                <table className="my-work-team">
                  <thead>
                    <tr>
                      <th>{t("ui.myWork.person")}</th>
                      <th>{t("ui.raci.row")}</th>
                      <th>{t("ui.myWork.confidenceTitle")}</th>
                      <th>{t("ui.myWork.done")}</th>
                      <th>{t("ui.myWork.blocker")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.checkIns.map((row) => (
                      <tr key={`${row.wbsItemId}:${row.personName}`}>
                        <td>{row.personName}</td>
                        <td>
                          {row.wbsItem.code} {row.wbsItem.title}
                        </td>
                        <td className={row.confidence}>{t(`ui.myWork.conf.${row.confidence}`)}</td>
                        <td>{row.done}</td>
                        <td>{row.blocker}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
