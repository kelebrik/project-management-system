import { useState } from 'react';
import { usePageContext } from './PageContext';
import type { ProjectListItem } from '../app/domainTypes';
import { ReconciliationContent } from '../components/automation/ReconciliationPanel';
import '../styles/automation.css';

export function JiraReconciliationPage() {
  const { projects: rawProjects, project, refreshProject } = usePageContext();
  const projects = rawProjects as ProjectListItem[];
  const [projectId, setProjectId] = useState('');
  const selected = projects.find((project) => project.id === projectId);
  return <section className="panel automation-body automation-page">
    <header className="automation-heading"><h1>Сверка Jira и WBS</h1><p>Выберите проект для проверки расхождений с загруженными данными Jira.</p></header>
    <div className="automation-actions"><label className="automation-project-field">Проект для сверки
      <select value={selected?.id ?? ''} onChange={(event) => setProjectId(event.target.value)}>
        <option value="">Выберите проект</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
      </select>
    </label></div>
    {selected && <ReconciliationContent key={selected.id} projectId={selected.id} readOnly={selected.status === 'CLOSED'} refresh={selected.id === project?.id ? refreshProject : undefined} />}
  </section>;
}
