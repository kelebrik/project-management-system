import { useI18n as useInterfaceTranslation } from "../../i18n/I18nProvider";
import { displayDay, useAutomationData } from './useAutomationData';
import type { AutomationInsight } from '@pms/shared';
import { AutomationPanel, AutomationError } from './AutomationPanel';

function ReadinessContent({ projectId }: { projectId: string }) {
  const { t: uiText } = useInterfaceTranslation();
  const states = {
    complete: uiText('ui.automation.readinessComplete'),
    ready: uiText('ui.automation.readinessReady'),
    blocked: uiText('ui.automation.readinessBlocked'),
    unknown: uiText('ui.automation.readinessUnknown'),
  };
  const { data, error } = useAutomationData<AutomationInsight>(`/api/projects/${encodeURIComponent(projectId)}/automation/insights`);
  return <><p>{uiText("ui.automation.readinessCheckDescription")}</p>
    <AutomationError error={error} />{!data && !error && <p role="status">{uiText("ui.automation.checkingMilestones")}</p>}
    {data?.readiness.length === 0 && <p>{uiText("ui.automation.noMilestonesOrGoalsYet")}</p>}
    {data?.readiness.map((item) => <article className="automation-card" key={item.id}>
      <div className="automation-row"><a href={item.href}>{item.code} {item.title}</a><span>{displayDay(item.dueDate)}</span><strong>{states[item.state]}</strong></div>
      {item.warnings.map((warning) => <p className="automation-warning" key={warning}>{warning}</p>)}
      {item.remaining.length > 0 && <details><summary>{uiText("ui.automation.workItemsRemaining")} {item.remaining.length}</summary><ul>{item.remaining.map((work) => <li key={work.id}><a href={work.href}>{work.code} {work.title}</a></li>)}</ul></details>}
      {item.blockers.length > 0 && <ul>{item.blockers.map((blocker) => <li key={blocker.id}><a href={blocker.href}>{blocker.title}</a></li>)}</ul>}
    </article>)}
  </>;
}
export function ReadinessPanel({ projectId }: { projectId: string }) {
  const { t: uiText } = useInterfaceTranslation(); return <AutomationPanel title={uiText("ui.automation.milestoneReadiness")}><ReadinessContent key={projectId} projectId={projectId} /></AutomationPanel>; }
