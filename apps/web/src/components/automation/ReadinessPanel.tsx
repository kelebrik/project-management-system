import { displayDay, useAutomationData } from './useAutomationData';
import type { AutomationInsight } from '@pms/shared';
import { AutomationPanel, AutomationError } from './AutomationPanel';

const states = { complete: 'Завершена', ready: 'Предшественники выполнены', blocked: 'Есть незавершенные условия', unknown: 'Недостаточно связей' };
function ReadinessContent({ projectId }: { projectId: string }) {
  const { data, error } = useAutomationData<AutomationInsight>(`/api/projects/${encodeURIComponent(projectId)}/automation/insights`);
  return <><p>Проверка по предшественникам WBS и связанным вопросам и рискам. Готовность подтверждается только в пределах заданных связей.</p>
    <AutomationError error={error} />{!data && !error && <p role="status">Проверяем вехи…</p>}
    {data?.readiness.length === 0 && <p>Вехи и цели пока не заданы.</p>}
    {data?.readiness.map((item) => <article className="automation-card" key={item.id}>
      <div className="automation-row"><a href={item.href}>{item.code} {item.title}</a><span>{displayDay(item.dueDate)}</span><strong>{states[item.state]}</strong></div>
      {item.warnings.map((warning) => <p className="automation-warning" key={warning}>{warning}</p>)}
      {item.remaining.length > 0 && <details><summary>Осталось работ: {item.remaining.length}</summary><ul>{item.remaining.map((work) => <li key={work.id}><a href={work.href}>{work.code} {work.title}</a></li>)}</ul></details>}
      {item.blockers.length > 0 && <ul>{item.blockers.map((blocker) => <li key={blocker.id}><a href={blocker.href}>{blocker.title}</a></li>)}</ul>}
    </article>)}
  </>;
}
export function ReadinessPanel({ projectId }: { projectId: string }) { return <AutomationPanel title="Готовность вех"><ReadinessContent key={projectId} projectId={projectId} /></AutomationPanel>; }
