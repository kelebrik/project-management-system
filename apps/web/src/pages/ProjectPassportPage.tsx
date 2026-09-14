import { useEffect, useRef } from "react";
import { usePageContext } from "./PageContext";
import { useConfirm } from "../hooks/useConfirm";

export function ProjectPassportPage() {
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
    setProjectTargetDateDraft,
    signedDateDeltaDays,
    signedDaysLabel,
    updatePassportRow,
  } = ctx;

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
                        <h2>Паспорт проекта</h2>
                        <p>Редактируемый набор полей паспорта проекта</p>
                      </div>
                      <button
                      type="button"
                      onClick={() => addPassportRow(passportRows.length - 1)}
                    >
                      + Добавить поле
                    </button>
                  </div>
                  <div className="passport-table">
                    <div className="passport-head">
                      <span>Поле</span>
                      <span>Описание</span>
                      <span />
                    </div>
                    <div className="passport-row passport-row-readonly">
                      <span>Цель на старте проекта</span>
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
                      <span>Текущая актуальная цель</span>
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
                          placeholder="Наименование поля"
                        />
                        <textarea
                          value={row.description}
                          onChange={(event) =>
                            updatePassportRow(row.id, {
                              description: event.target.value,
                            })
                          }
                          rows={1}
                          placeholder="Описание или значение"
                        />
                        <div className="passport-row-controls">
                          <button
                            type="button"
                            className="wbs-inline-insert-button"
                            onClick={() => addPassportRow(index)}
                            aria-label="Добавить поле ниже"
                            title="Добавить поле ниже"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="wbs-row-delete-button"
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: "Удалить поле паспорта?",
                                  confirmLabel: "Удалить",
                                })
                              ) {
                                void deletePassportRow(row.id);
                              }
                            }}
                            aria-label="Удалить поле"
                            title="Удалить поле"
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
                      {savingPassportRows ? "Сохраняю..." : "Сохранить паспорт"}
                    </button>
                  </div>
                  <section className="passport-target-approval">
                    <div className="passport-targets-head">
                      <div>
                        <h3>Утвердить новую цель</h3>
                      </div>
                    </div>
                    <div className="passport-target-edit">
                      <label>
                        Новая дата цели
                        <input
                          type="date"
                          value={projectTargetDateDraft}
                          onChange={(event) =>
                            setProjectTargetDateDraft(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Причина изменения
                        <input
                          value={projectTargetChangeReason}
                          onChange={(event) =>
                            setProjectTargetChangeReason(event.target.value)
                          }
                          placeholder="Например: согласованный перенос запуска"
                        />
                      </label>
                      <label>
                        Согласовано
                        <input
                          value={projectTargetApprovedBy}
                          onChange={(event) =>
                            setProjectTargetApprovedBy(event.target.value)
                          }
                          placeholder="ФИО или орган согласования"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void saveProjectTargetDate()}
                        disabled={savingProjectTargetDate}
                      >
                        {savingProjectTargetDate ? "Сохраняю..." : "Сохранить цель"}
                      </button>
                    </div>
                    <div className="passport-target-history">
                      <div className="passport-target-history-head">
                        <span>Дата</span>
                        <span>Было</span>
                        <span>Стало</span>
                        <span>Изменение</span>
                        <span>Причина</span>
                        <span>Согласовано</span>
                      </div>
                      {project?.targetDateChanges?.length ? (
                        project.targetDateChanges.map((change) => (
                          <div className="passport-target-history-row" key={change.id}>
                            <span>{date(change.createdAt)}</span>
                            <span>{date(change.previousDate)}</span>
                            <span>{date(change.newDate)}</span>
                            <span>
                              {signedDaysLabel(
                                signedDateDeltaDays(
                                  change.previousDate,
                                  change.newDate,
                                ),
                              )}
                            </span>
                            <span>{change.reason}</span>
                            <span>{change.approvedBy || "не указано"}</span>
                          </div>
                        ))
                      ) : (
                        <div className="passport-target-history-empty">
                          Истории изменения цели пока нет.
                        </div>
                      )}
                    </div>
                  </section>
                </article>
              );
}
