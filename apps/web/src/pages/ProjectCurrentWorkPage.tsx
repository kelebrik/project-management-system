import { createCurrentWorkRows } from "../app/currentWorkModel";
import { date } from "../app/dateUtils";
import { wbsStatusLabel } from "../app/labels";
import { usePageContext } from "./PageContext";

export function ProjectCurrentWorkPage() {
  const { project, wbsDrafts } = usePageContext();
  const rows = createCurrentWorkRows(project.wbsItems, wbsDrafts ?? {});

  return (
    <article className="panel project-card current-work-page">
      <div className="panel-title">
        <div>
          <h2>Текучка</h2>
          <p>Недавно закрытые, текущие и ближайшие работы проекта</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">Работ по заданным условиям нет.</div>
      ) : (
        <div className="current-work-table" role="table" aria-label="Текучка проекта">
          <div className="current-work-head" role="row">
            <span role="columnheader">Номер</span>
            <span role="columnheader">Пакет работ</span>
            <span role="columnheader">Наименование</span>
            <span role="columnheader">Статус</span>
            <span role="columnheader">Срок</span>
            <span role="columnheader">Исполнитель</span>
            <span role="columnheader">Комментарий</span>
          </div>
          {rows.map((row) => (
            <div className="current-work-row" role="row" key={row.id}>
              <span role="cell">{row.code}</span>
              <span role="cell">{row.workPackage}</span>
              <span role="cell" className="current-work-title">{row.title}</span>
              <span role="cell">{wbsStatusLabel(row.status)}</span>
              <span role="cell">{date(row.dueDate)}</span>
              <span role="cell">{row.owner || "—"}</span>
              <span role="cell">{row.comment || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
