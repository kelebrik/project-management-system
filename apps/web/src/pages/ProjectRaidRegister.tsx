import { usePageContext } from "./PageContext";
import { X } from "lucide-react";
import type { RaidItemStatus, RaidItemType } from "../app/domainTypes";
import type { RaidTypeFilter } from "../app/raidModels";

export function ProjectRaidRegister() {
  const {
    addRaidStatusUpdate,
    closeRaidItem,
    closedRaidItems,
    convertRiskToAssumption,
    convertRiskToProblem,
    date,
    deleteRaidItem,
    expandedRaidId,
    groupedRaidItems,
    isoDate,
    latestRaidStatusUpdate,
    raidDecisionOnly,
    raidDrafts,
    raidHighOnly,
    raidOverdueOnly,
    raidStatusDrafts,
    raidStatusLabel,
    raidSummary,
    raidTypeFilter,
    raidTypeLabel,
    riskTone,
    saveRaidItem,
    setExpandedRaidId,
    setRaidDecisionOnly,
    setRaidHighOnly,
    setRaidOverdueOnly,
    setRaidTypeFilter,
    updateRaidDraft,
    updateRaidStatusDraft,
  } = usePageContext();

  return <div className="raid-main-column">
                    <div className="wbs-kpis raid-kpis">
                      <div>
                        <span>Активные записи</span>
                        <strong>{raidSummary.activeRaid}</strong>
                        <small>открыто / в работе / нарушено</small>
                      </div>
                      <div>
                        <span>Высокие риски</span>
                        <strong>{raidSummary.highRisks}</strong>
                        <small>оценка 15+</small>
                      </div>
                      <div>
                        <span>Проблемы</span>
                        <strong>{raidSummary.problems}</strong>
                        <small>активные записи</small>
                      </div>
                      <div>
                        <span>Допущения</span>
                        <strong>{raidSummary.assumptions}</strong>
                        <small>активные записи</small>
                      </div>
                    </div>
                    <section className="raid-register">
                      <div className="subhead">Реестр рисков и проблем</div>
                      <section className="raid-filter-card">
                        <div className="subhead">Фильтры</div>
                        <div className="raid-filter-bar">
                          {[
                            ["ALL", "Все"],
                            ["RISK", raidTypeLabel("RISK")],
                            ["DEPENDENCY", raidTypeLabel("DEPENDENCY")],
                            ["ASSUMPTION", raidTypeLabel("ASSUMPTION")],
                          ].map(([value, label]) => (
                            <button
                              type="button"
                              key={value}
                              className={raidTypeFilter === value ? "active" : ""}
                              onClick={() => setRaidTypeFilter(value as RaidTypeFilter)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="raid-check-filters">
                          <label>
                            <input
                              type="checkbox"
                              checked={raidDecisionOnly}
                              onChange={(event) =>
                                setRaidDecisionOnly(event.target.checked)
                              }
                            />
                            Требуют решения
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={raidOverdueOnly}
                              onChange={(event) =>
                                setRaidOverdueOnly(event.target.checked)
                              }
                            />
                            Просрочены
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={raidHighOnly}
                              onChange={(event) =>
                                setRaidHighOnly(event.target.checked)
                              }
                            />
                            Высокий риск
                          </label>
                        </div>
                      </section>
                      {([
                        { key: "risks", title: "Риски", items: groupedRaidItems.risks },
                        {
                          key: "problems",
                          title: "Проблемы",
                          items: groupedRaidItems.problems,
                        },
                        {
                          key: "assumptions",
                          title: "Допущения",
                          items: groupedRaidItems.assumptions,
                        },
                      ] as const).map(({ key, title, items }) => (
                        <section className="raid-section" key={key}>
                          <h3>{title}</h3>
                      <div className="raid-list">
                        <div className="raid-head">
                          <span>Запись</span>
                          <span>Ключ Jira</span>
                          <span>Оценка</span>
                          <span>Срок</span>
                          <span>Ответственный</span>
                          <span />
                        </div>
                        {items.map((item) => (
                          <div
                            className="raid-item"
                            id={`raid-item-${item.id}`}
                            key={item.id}
                          >
                            <div
                              className="raid-row"
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                setExpandedRaidId(
                                  expandedRaidId === item.id ? null : item.id,
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setExpandedRaidId(
                                    expandedRaidId === item.id ? null : item.id,
                                  );
                                }
                              }}
                            >
                              <span className="raid-title">{item.title}</span>
                              <span>
                                {item.jiraTicketUrl ? (
                                  <a
                                    className="raid-jira-link"
                                    href={item.jiraTicketUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(event) => event.stopPropagation()}
                                    onKeyDown={(event) => event.stopPropagation()}
                                  >
                                    {item.jiraTicketKey || "Jira"}
                                  </a>
                                ) : (
                                  <span className="raid-jira-empty">
                                    {item.jiraTicketKey || "не задан"}
                                  </span>
                                )}
                              </span>
                              <span className={`risk-score ${riskTone(item.riskScore)}`}>
                                {item.riskScore}
                              </span>
                              <span>{date(item.dueDate)}</span>
                              <span>{item.owner}</span>
                              <span className="issue-chevron">
                                {expandedRaidId === item.id ? "-" : "+"}
                              </span>
                            </div>
                            {expandedRaidId === item.id && raidDrafts[item.id] && (
                              <div className="raid-details">
                                <div className="raid-edit-drawer-header">
                                  <div>
                                    <strong>{item.title}</strong>
                                    <span>{item.owner || "ответственный не задан"}</span>
                                  </div>
                                  <button
                                    type="button"
                                    aria-label="Закрыть редактирование"
                                    title="Закрыть"
                                    onClick={() => setExpandedRaidId(null)}
                                  >
                                    <X size={17} />
                                  </button>
                                </div>
                                {(() => {
                                  const latestStatus = latestRaidStatusUpdate(item);
                                  const statusHistory = [...(item.statusUpdates ?? [])]
                                    .filter(
                                      (statusUpdate) =>
                                        statusUpdate.id !== latestStatus?.id,
                                    )
                                    .sort((left, right) => {
                                      const statusDelta =
                                        new Date(right.statusAt).getTime() -
                                        new Date(left.statusAt).getTime();
                                      if (statusDelta !== 0) return statusDelta;
                                      return (
                                        new Date(right.createdAt).getTime() -
                                        new Date(left.createdAt).getTime()
                                      );
                                    });
                                  return (
                                    <section className="raid-status-panel">
                                      <div className="subhead">Статус</div>
                                      {latestStatus ? (
                                        <div className="raid-status-latest">
                                          <strong>{date(latestStatus.statusAt)}</strong>
                                          <p>{latestStatus.text}</p>
                                        </div>
                                      ) : (
                                        <p className="muted-text">
                                          Статус пока не добавлен.
                                        </p>
                                      )}
                                      {statusHistory.length > 0 && (
                                        <div className="raid-status-history">
                                          {statusHistory.map((statusUpdate) => (
                                            <div
                                              className="raid-status-history-row"
                                              key={statusUpdate.id}
                                            >
                                              <span>{date(statusUpdate.statusAt)}</span>
                                              <p>{statusUpdate.text}</p>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      <div className="raid-status-add">
                                        <input
                                          type="date"
                                          value={
                                            raidStatusDrafts[item.id]?.statusAt ??
                                            isoDate(new Date())
                                          }
                                          onChange={(event) =>
                                            updateRaidStatusDraft(item.id, {
                                              statusAt: event.target.value,
                                            })
                                          }
                                        />
                                        <textarea
                                          rows={2}
                                          value={raidStatusDrafts[item.id]?.text ?? ""}
                                          onChange={(event) =>
                                            updateRaidStatusDraft(item.id, {
                                              text: event.target.value,
                                            })
                                          }
                                          placeholder="Новый статус: что изменилось, что требуется, следующий шаг"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => addRaidStatusUpdate(item.id)}
                                        >
                                          Добавить статус
                                        </button>
                                      </div>
                                    </section>
                                  );
                                })()}
                                <div className="raid-detail-meta">
                                  <span>{raidStatusLabel(item.status)}</span>
                                  <span>{raidTypeLabel(item.type)}</span>
                                  <span>Остаточный риск: {item.residualRisk}</span>
                                  <span>
                                    Сроки: {item.scheduleImpactDays} дн.
                                  </span>
                                  {item.jiraTicketKey && (
                                    <span>Jira: {item.jiraTicketKey}</span>
                                  )}
                                    {item.decisionRequired && (
                                    <b>Требует решения</b>
                                  )}
                                </div>
                                <p>{item.description}</p>
                                {item.jiraTicketUrl && (
                                  <a
                                    className="jira-detail-link"
                                    href={item.jiraTicketUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {item.jiraTicketKey || item.jiraTicketUrl}
                                  </a>
                                )}
                                <div className="raid-edit-grid">
                                  <select
                                    value={raidDrafts[item.id].type}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        type: event.target.value as RaidItemType,
                                      })
                                    }
                                  >
                                    <option value="RISK">{raidTypeLabel("RISK")}</option>
                                    <option value="ASSUMPTION">
                                      {raidTypeLabel("ASSUMPTION")}
                                    </option>
                                    <option value="DEPENDENCY">
                                      {raidTypeLabel("DEPENDENCY")}
                                    </option>
                                  </select>
                                  <select
                                    value={raidDrafts[item.id].status}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        status: event.target.value as RaidItemStatus,
                                      })
                                    }
                                  >
                                    <option value="OPEN">{raidStatusLabel("OPEN")}</option>
                                    <option value="IN_PROGRESS">
                                      {raidStatusLabel("IN_PROGRESS")}
                                    </option>
                                    <option value="MITIGATED">
                                      {raidStatusLabel("MITIGATED")}
                                    </option>
                                    <option value="VALIDATED">
                                      {raidStatusLabel("VALIDATED")}
                                    </option>
                                    <option value="BREACHED">
                                      {raidStatusLabel("BREACHED")}
                                    </option>
                                    <option value="CLOSED">
                                      {raidStatusLabel("CLOSED")}
                                    </option>
                                  </select>
                                  <input
                                    value={raidDrafts[item.id].title}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        title: event.target.value,
                                      })
                                    }
                                    placeholder="Наименование"
                                  />
                                  <input
                                    value={raidDrafts[item.id].owner}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        owner: event.target.value,
                                      })
                                    }
                                    placeholder="Ответственный"
                                  />
                                  <input
                                    value={raidDrafts[item.id].jiraTicketKey}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        jiraTicketKey: event.target.value,
                                      })
                                    }
                                    placeholder="Ключ Jira"
                                  />
                                  <input
                                    value={raidDrafts[item.id].jiraTicketUrl}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        jiraTicketUrl: event.target.value,
                                      })
                                    }
                                    placeholder="Jira URL"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    max="5"
                                    value={raidDrafts[item.id].probability}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        probability: event.target.value,
                                      })
                                    }
                                    placeholder="Вероятность"
                                  />
                                  <input
                                    type="number"
                                    min="0"
                                    max="5"
                                    value={raidDrafts[item.id].impact}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        impact: event.target.value,
                                      })
                                    }
                                    placeholder="Влияние"
                                  />
                                  <input
                                    type="date"
                                    value={raidDrafts[item.id].dueDate}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        dueDate: event.target.value,
                                      })
                                    }
                                  />
                                  <input
                                    type="date"
                                    value={raidDrafts[item.id].validationDate}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        validationDate: event.target.value,
                                      })
                                    }
                                  />
                                    <label className="checkbox-line compact-checkbox">
                                    <input
                                      type="checkbox"
                                      checked={raidDrafts[item.id].decisionRequired}
                                      onChange={(event) =>
                                        updateRaidDraft(item.id, {
                                          decisionRequired: event.target.checked,
                                        })
                                      }
                                    />
                                    Требует решения
                                  </label>
                                  <textarea
                                    className="span-2"
                                    value={raidDrafts[item.id].description}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        description: event.target.value,
                                      })
                                    }
                                    rows={2}
                                  />
                                  <textarea
                                    value={raidDrafts[item.id].mitigationPlan}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        mitigationPlan: event.target.value,
                                      })
                                    }
                                    rows={2}
                                    placeholder="План действий"
                                  />
                                  <textarea
                                    value={raidDrafts[item.id].contingencyPlan}
                                    onChange={(event) =>
                                      updateRaidDraft(item.id, {
                                        contingencyPlan: event.target.value,
                                      })
                                    }
                                    rows={2}
                                    placeholder="Резервный план"
                                  />
                                  <div className="issue-actions">
                                    <button
                                      type="button"
                                      onClick={() => saveRaidItem(item.id)}
                                    >
                                      Сохранить запись
                                    </button>
                                    {item.type === "RISK" && (
                                      <>
                                        <button
                                          type="button"
                                          className="secondary-button"
                                          onClick={() => convertRiskToProblem(item.id)}
                                        >
                                          В проблему
                                        </button>
                                        <button
                                          type="button"
                                          className="secondary-button"
                                          onClick={() => convertRiskToAssumption(item.id)}
                                        >
                                          В допущение
                                        </button>
                                      </>
                                    )}
                                    {(item.type === "RISK" ||
                                      item.type === "DEPENDENCY") &&
                                      item.status !== "CLOSED" && (
                                        <button
                                          type="button"
                                          className="secondary-button"
                                          onClick={() => closeRaidItem(item.id)}
                                        >
                                          Закрыть
                                        </button>
                                      )}
                                    <button
                                      type="button"
                                      className="danger-button"
                                      onClick={() => deleteRaidItem(item.id)}
                                    >
                                      Удалить
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        {items.length === 0 && (
                          <div className="empty-state">Записей пока нет.</div>
                        )}
                      </div>
                        </section>
                      ))}
                      <details className="raid-closed-section">
                        <summary>
                          <span>Закрытые риски и проблемы</span>
                          <strong>{closedRaidItems.length}</strong>
                        </summary>
                        <div className="raid-list">
                          <div className="raid-head raid-closed-head">
                            <span>Запись</span>
                            <span>Тип</span>
                            <span>Статус</span>
                            <span>Срок</span>
                            <span>Ответственный</span>
                          </div>
                          {closedRaidItems.map((item) => (
                            <div className="raid-item raid-closed-item" key={item.id}>
                              <div className="raid-row raid-closed-row">
                                <span className="raid-title">{item.title}</span>
                                <span>{raidTypeLabel(item.type)}</span>
                                <span>{raidStatusLabel(item.status)}</span>
                                <span>{date(item.dueDate)}</span>
                                <span>{item.owner}</span>
                              </div>
                            </div>
                          ))}
                          {closedRaidItems.length === 0 && (
                            <div className="empty-state">
                              Закрытых рисков и проблем пока нет.
                            </div>
                          )}
                        </div>
                      </details>
                    </section>
                    </div>;
}
