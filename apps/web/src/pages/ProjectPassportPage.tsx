import { useI18n } from "../i18n/I18nProvider";
import { useEffect, useRef, useState } from "react";
import { openProjectGoals } from "../app/projectTargetModel";
import { usePageContext } from "./PageContext";
import { useConfirm } from "../hooks/useConfirm";

export function ProjectPassportPage() {
  const { t } = useI18n();
  const ctx = usePageContext();
  const confirm = useConfirm();
  const initialPassportRef = useRef<string | null>(null);
  const {
    addPassportRow,
    date,
    deletePassportRow,
    passportRows,
    project,
    projectTargetApprovedBy,
    projectTargetChangeReason,
    projectTargetDateDraft,
    projectTargetSummary,
    saveProjectTargetDate,
    savePassportRows,
    savingPassportRows,
    savingProjectTargetDate,
    setProjectTargetApprovedBy,
    setProjectTargetChangeReason,
    signedDateDeltaDays,
    signedDaysLabel,
    updatePassportRow,
  } = ctx;

  // The goal to move: the active one unless another open goal is chosen.
  const openGoals = project ? openProjectGoals(project.wbsItems) : [];
  const hasGoals = Boolean(project?.wbsItems.some((item) => item.type === "GOAL" && item.status !== "CANCELLED"));
  const [chosenGoalId, setChosenGoalId] = useState<string | null>(null);
  const [notDelay, setNotDelay] = useState(false);
  const goal = openGoals.find((item) => item.id === chosenGoalId) ?? openGoals[0] ?? null;
  // The date typed belongs to the goal it was typed for; otherwise the form shows the goal's own date
  // (the project's, without goals), so the date sent is always the chosen goal's.
  const [typedDate, setTypedDate] = useState<{ goalId: string | null; value: string } | null>(null);
  const goalKey = goal?.id ?? null;
  const targetDraft =
    typedDate && typedDate.goalId === goalKey
      ? typedDate.value
      : goal
        ? goal.dueDate?.slice(0, 10) ?? ""
        : projectTargetDateDraft;
  // A saved move starts the form over: the answer brings a new history.
  const targetDateChanges = project?.targetDateChanges;
  const [shownChanges, setShownChanges] = useState(targetDateChanges);
  if (shownChanges !== targetDateChanges) {
    setShownChanges(targetDateChanges);
    setTypedDate(null);
    setNotDelay(false);
  }
  const approverMissing = notDelay && !projectTargetApprovedBy.trim();

  const passportSnapshot = JSON.stringify(passportRows);
  useEffect(() => {
    if (initialPassportRef.current === null || (initialPassportRef.current === "[]" && passportRows.length > 0)) {
      initialPassportRef.current = passportSnapshot;
    }
  }, [passportRows, passportSnapshot]);
  useEffect(() => {
    const dirty = initialPassportRef.current !== null && initialPassportRef.current !== passportSnapshot;
    (window as Window & { __pmsUnsaved?: boolean }).__pmsUnsaved = dirty;
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      (window as Window & { __pmsUnsaved?: boolean }).__pmsUnsaved = false;
    };
  }, [passportSnapshot]);

  return (
                  <article className="panel project-card">
                    <div className="panel-title">
                      <div>
                        <h2>{t("charter.title")}</h2>
                        <p>{t("charter.description")}</p>
                      </div>
                      <button
                      type="button"
                      onClick={() => addPassportRow(passportRows.length - 1)}
                    >
                      {t("charter.add")}
                    </button>
                  </div>
                  <div className="passport-table">
                    <div className="passport-head">
                      <span>{t("fields.field")}</span>
                      <span>{t("fields.description")}</span>
                      <span />
                    </div>
                    <div className="passport-row passport-row-readonly">
                      <span>{t("charter.initialTarget")}</span>
                      <span>
                        {date(
                          projectTargetSummary?.initialTargetDate ??
                            project?.targetDate ??
                            null,
                        )}
                      </span>
                      <span aria-hidden="true" />
                    </div>
                    <div className="passport-row passport-row-readonly">
                      <span>{t("charter.currentTarget")}</span>
                      <span>
                        {date(
                          projectTargetSummary?.currentTargetDate ??
                            project?.targetDate ??
                            null,
                        )}
                      </span>
                      <span aria-hidden="true" />
                    </div>
                    {passportRows.map((row, index) => (
                      <div className="passport-row" key={row.id}>
                        <input
                          value={row.field}
                          onChange={(event) =>
                            updatePassportRow(row.id, {
                              field: event.target.value,
                            })
                          }
                          placeholder={t("charter.fieldName")}
                        />
                        <textarea
                          value={row.description}
                          onChange={(event) =>
                            updatePassportRow(row.id, {
                              description: event.target.value,
                            })
                          }
                          rows={1}
                          placeholder={t("charter.value")}
                        />
                        <div className="passport-row-controls">
                          <button
                            type="button"
                            className="wbs-inline-insert-button"
                            onClick={() => addPassportRow(index)}
                            aria-label={t("charter.addBelow")}
                            title={t("charter.addBelow")}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="wbs-row-delete-button"
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: t("charter.deleteConfirm"),
                                  confirmLabel: t("fields.delete"),
                                })
                              ) {
                                void deletePassportRow(row.id);
                              }
                            }}
                            aria-label={t("charter.delete")}
                            title={t("charter.delete")}
                          >
                            x
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="form-actions passport-actions">
                    <button
                      type="button"
                      onClick={() => void savePassportRows()}
                      disabled={savingPassportRows}
                    >
                      {savingPassportRows ? t("fields.saving") : t("charter.save")}
                    </button>
                  </div>
                  <section className="passport-target-approval">
                    <div className="passport-targets-head">
                      <div>
                        <h3>{t("charter.approve")}</h3>
                      </div>
                    </div>
                    {hasGoals ? <p className="passport-target-note">{t("charter.targetFromGoal")}</p> : null}
                    <div className="passport-target-edit">
                      <label>
                        {t("charter.goal")}
                        {hasGoals ? (
                          <select
                            value={goal?.id ?? ""}
                            disabled={openGoals.length === 0}
                            onChange={(event) => setChosenGoalId(event.target.value)}
                          >
                            {openGoals.length === 0 ? <option value="">{t("charter.noOpenGoals")}</option> : null}
                            {openGoals.map((item) => (
                              <option key={item.id} value={item.id}>
                                {`${item.code} · ${item.title} · ${date(item.dueDate)}`}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="passport-target-goal-none">{t("charter.projectWithoutGoals")}</span>
                        )}
                      </label>
                      <label>
                        {t("charter.newDate")}
                        <input
                          type="date"
                          value={targetDraft}
                          onChange={(event) =>
                            setTypedDate({ goalId: goalKey, value: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        {t("charter.changeReason")}
                        <input
                          value={projectTargetChangeReason}
                          onChange={(event) =>
                            setProjectTargetChangeReason(event.target.value)
                          }
                          placeholder={t("charter.reasonExample")}
                        />
                      </label>
                      <label>
                        {notDelay ? t("charter.approverRequired") : t("fields.approvedBy")}
                        <input
                          value={projectTargetApprovedBy}
                          onChange={(event) =>
                            setProjectTargetApprovedBy(event.target.value)
                          }
                          placeholder={t("charter.approverExample")}
                          required={notDelay}
                          aria-invalid={approverMissing || undefined}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void saveProjectTargetDate({ goalId: goalKey, notDelay: Boolean(goal) && notDelay, targetDate: targetDraft })}
                        disabled={savingProjectTargetDate || (hasGoals && !goal) || approverMissing}
                      >
                        {savingProjectTargetDate ? t("fields.saving") : t("charter.saveTarget")}
                      </button>
                    </div>
                    {goal ? (
                      <label className="passport-target-not-delay">
                        <input
                          type="checkbox"
                          checked={notDelay}
                          onChange={(event) => setNotDelay(event.target.checked)}
                        />
                        <span>
                          {t("charter.notDelay")}
                          <small>{t("charter.notDelayHint")}</small>
                        </span>
                      </label>
                    ) : null}
                    <div className="passport-target-history">
                      <div className="passport-target-history-head">
                        <span>{t("fields.date")}</span>
                        <span>{t("charter.goal")}</span>
                        <span>{t("fields.before")}</span>
                        <span>{t("fields.after")}</span>
                        <span>{t("fields.change")}</span>
                        <span>{t("fields.reason")}</span>
                        <span>{t("fields.approvedBy")}</span>
                      </div>
                      {project?.targetDateChanges?.length ? (
                        project.targetDateChanges.map((change) => (
                          <div className="passport-target-history-row" key={change.id}>
                            <span>{date(change.createdAt)}</span>
                            <span>{change.goalCode ? `${change.goalCode} · ${change.goalTitle ?? ""}` : "—"}</span>
                            <span>{change.previousDate ? date(change.previousDate) : "—"}</span>
                            <span>{date(change.newDate)}</span>
                            <span>
                              {signedDaysLabel(
                                signedDateDeltaDays(
                                  change.previousDate,
                                  change.newDate,
                                ),
                              )}
                            </span>
                            <span>
                              {change.reason}
                              {change.notDelay ? <em className="passport-target-not-delay-mark">{t("charter.notDelayMark")}</em> : null}
                            </span>
                            <span>{change.approvedBy || t("fields.notSpecified")}</span>
                          </div>
                        ))
                      ) : (
                        <div className="passport-target-history-empty">
                          {t("charter.emptyHistory")}
                        </div>
                      )}
                    </div>
                  </section>
                </article>
              );
}
