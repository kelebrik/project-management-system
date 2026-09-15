import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { useState } from 'react';
import { usePageContext } from './PageContext';
import type { ProjectListItem } from '../app/domainTypes';
import { ReconciliationContent } from '../components/automation/ReconciliationPanel';
import '../styles/automation.css';

export function JiraReconciliationPage() {
  const { t: uiText } = useInterfaceTranslation();
  const { projects: rawProjects, project, refreshProject } = usePageContext();
  const projects = rawProjects as ProjectListItem[];
  const [projectId, setProjectId] = useState('');
  const selected = projects.find((project) => project.id === projectId);
  return <section className="panel automation-body automation-page">
    <header className="automation-heading"><h1>{uiText("ui.jira.jiraWbsReconciliation")}</h1><p>{uiText("ui.jira.selectProjectForReconciliation")}</p></header>
    <div className="automation-actions"><label className="automation-project-field">{uiText("ui.jira.projectToReconcile")}
      <select value={selected?.id ?? ''} onChange={(event) => setProjectId(event.target.value)}>
        <option value="">{uiText("ui.jira.selectProject")}</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
      </select>
    </label></div>
    {selected && <ReconciliationContent key={selected.id} projectId={selected.id} readOnly={selected.status === 'CLOSED'} refresh={selected.id === project?.id ? refreshProject : undefined} />}
  </section>;
}
