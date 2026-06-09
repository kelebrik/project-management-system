import { usePageContext } from "./PageContext";

export function ProjectPassportPage() {
  const ctx = usePageContext();
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
                  <section className="passport-targets">
                    <div className="passport-targets-head">
                      <div>
                        <h3>Цели и сроки проекта</h3>
                        <p>Утвержденная цель, прогноз завершения и история изменений</p>
                      </div>
                    </div>
                    <div className="passport-target-metrics">
                      <div>
                        <span>Стартовая цель</span>
                        <b>{date(projectTargetSummary?.initialTargetDate ?? project?.targetDate ?? null)}</b>
                      </div>
                      <div>
                        <span>Текущая цель</span>
                        <b>{date(projectTargetSummary?.currentTargetDate ?? project?.targetDate ?? null)}</b>
                        <small>{signedDaysLabel(projectTargetSummary?.targetChangeDays ?? null)}</small>
                      </div>
                      <div>
                        <span>Прогноз завершения</span>
                        <b>{date(projectTargetSummary?.forecastFinishDate ?? null)}</b>
                        <small>{signedDaysLabel(projectTargetSummary?.effectiveDelayDays ?? null)}</small>
                      </div>
                      <div>
                        <span>Полное отклонение</span>
                        <b>{signedDaysLabel(projectTargetSummary?.totalVarianceDays ?? null)}</b>
                      </div>
                    </div>
                    <div className="passport-target-edit">
                      <label>
                        Текущая утвержденная цель
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
                  <div className="passport-table">
                    <div className="passport-head">
                      <span>Поле</span>
                      <span>Описание</span>
                      <span />
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
                          rows={2}
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
                            onClick={() => deletePassportRow(row.id)}
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
                </article>
              );
}
