import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";
import type { RaidItemType } from "../app/domainTypes";
import { ProjectRaidMatrixCard } from "./ProjectRaidMatrixCard";

type ProjectRaidSidePanelProps = {
  showMatrix?: boolean;
};

export function ProjectRaidSidePanel({ showMatrix = true }: ProjectRaidSidePanelProps) {
  const { t: uiText } = useInterfaceTranslation();
  const {
    createRaidItem,
    raidForm,
    raidTypeLabel,
    setRaidForm,
  } = usePageContext();

  return <div className="raid-side-column">
                      {showMatrix && <ProjectRaidMatrixCard />}
                        <form className="raid-form stack-form" onSubmit={createRaidItem}>
                          <h3>{uiText("ui.projects.newEntryAction")}</h3>
                        <div className="form-section-title">{uiText("ui.projects.raidPanelGeneralTab")}</div>
                        <div className="two-col">
                        <label>
                          {uiText("ui.admin.type")}
                          <select
                            value={raidForm.type}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
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
                        </label>
                        <label>
                          {uiText("ui.automation.owner")}
                          <input
                            value={raidForm.owner}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                owner: event.target.value,
                              })
                            }
                            placeholder={uiText("ui.automation.owner")}
                          />
                        </label>
                      </div>
                      <div className="two-col">
                        <label>
                          {uiText("ui.projects.jiraKeyLabel")}
                          <input
                            value={raidForm.jiraTicketKey}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                jiraTicketKey: event.target.value,
                              })
                            }
                            placeholder="ERP-1842"
                          />
                        </label>
                        <label>
                          Jira URL
                          <input
                            value={raidForm.jiraTicketUrl}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                jiraTicketUrl: event.target.value,
                              })
                            }
                            placeholder="https://jira.company.ru/browse/ERP-1842"
                          />
                        </label>
                      </div>
                      <label>
                        {uiText("ui.admin.itemName")}
                        <input
                          value={raidForm.title}
                          onChange={(event) =>
                            setRaidForm({
                              ...raidForm,
                              title: event.target.value,
                            })
                          }
                          placeholder={uiText("ui.projects.raidPanelTitlePlaceholderExample")}
                        />
                      </label>
                      <label>
                        {uiText("ui.jira.description")}
                        <textarea
                          value={raidForm.description}
                          onChange={(event) =>
                            setRaidForm({
                              ...raidForm,
                              description: event.target.value,
                            })
                          }
                            rows={3}
                          />
                        </label>
                        <div className="form-section-title">{uiText("ui.projects.raidPanelScoreAndImpactTab")}</div>
                        <div className="two-col">
                        <label>
                          {uiText("ui.projects.raidProbabilityLabel")}
                          <input
                            type="number"
                            min="0"
                            max="5"
                            value={raidForm.probability}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                probability: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          {uiText("ui.projects.impact")}
                          <input
                            type="number"
                            min="0"
                            max="5"
                            value={raidForm.impact}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                impact: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="two-col">
                        <label>
                          {uiText("ui.automation.dueDate")}
                          <input
                            type="date"
                            value={raidForm.dueDate}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                dueDate: event.target.value,
                              })
                            }
                          />
                        </label>
                          </div>
                        <div className="form-section-title">{uiText("ui.projects.raidActionPlanLabel")}</div>
                        <label>
                          {uiText("ui.projects.raidActionPlanLabel")}
                        <textarea
                          value={raidForm.mitigationPlan}
                          onChange={(event) =>
                            setRaidForm({
                              ...raidForm,
                              mitigationPlan: event.target.value,
                            })
                          }
                          rows={2}
                        />
                      </label>
                      <label className="checkbox-line">
                        <input
                          type="checkbox"
                          checked={raidForm.decisionRequired}
                          onChange={(event) =>
                            setRaidForm({
                              ...raidForm,
                              decisionRequired: event.target.checked,
                            })
                          }
                        />
                        {uiText("ui.projects.requiresDecision")}
                      </label>
                      <button type="submit">{uiText("ui.automation.createRecord")}</button>
                    </form>
                    </div>;
}
