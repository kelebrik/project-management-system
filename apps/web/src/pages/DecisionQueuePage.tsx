import { useMemo, useState } from "react";
import { signedDaysUntil } from "../app/dateUtils";
import type { Issue } from "../app/domainTypes";
import { usePageContext } from "./PageContext";
import { SegmentedFilter } from "../components/SegmentedFilter";

type DecisionRow = Issue & {
  projectName: string;
};

type DecisionFilter = "all" | "overdue" | "week";

function isOpenDecision(issue: Issue) {
  return issue.decisionRequired && issue.status !== "Closed" && issue.status !== "Resolved";
}

export function DecisionQueuePage() {
  const { openView, project, setExpandedIssueId } = usePageContext();
  const [filter, setFilter] = useState<DecisionFilter>("all");
  const rows = useMemo(
    () =>
      (project?.issues ?? [])
        .filter(isOpenDecision)
        .map((issue: Issue) => ({
            ...issue,
            projectName: project?.name ?? "Проект не выбран",
          }))
        .filter((issue) => {
          const days = signedDaysUntil(issue.dueDate);
          if (filter === "overdue") return days !== null && days < 0;
          if (filter === "week") return days !== null && days >= 0 && days <= 7;
          return true;
        })
        .sort(
          (left, right) =>
            (signedDaysUntil(left.dueDate) ?? Number.POSITIVE_INFINITY) -
              (signedDaysUntil(right.dueDate) ?? Number.POSITIVE_INFINITY) ||
            left.title.localeCompare(right.title, "ru"),
        ) as DecisionRow[],
    [filter, project?.issues, project?.name],
  );

  return (
    <section className="v2-page decision-queue-page">
      <div className="v2-compact-header">
        <div>
          <h2>Очередь решений</h2>
          <span>Вопросы, по которым требуется управленческое решение</span>
        </div>
        <SegmentedFilter<DecisionFilter>
          ariaLabel="Фильтр очереди решений"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Все" },
            { value: "overdue", label: "Просрочено" },
            { value: "week", label: "7 дней" },
          ]}
        />
      </div>
      <div className="decision-queue-table">
        <div className="decision-queue-head">
          <span>Проект</span><span>Вопрос</span><span>Ответственный</span><span>Срок</span>
        </div>
        {rows.map((issue) => (
          <button
            type="button"
            className={(signedDaysUntil(issue.dueDate) ?? 0) < 0 ? "overdue" : ""}
            key={issue.id}
            onClick={() => {
              setExpandedIssueId(issue.id);
              openView("project-issues");
            }}
          >
            <b>{issue.projectName}</b>
            <span>{issue.title}</span>
            <span>{issue.owner || "не назначен"}</span>
            <span>{issue.dueDate ? new Date(issue.dueDate).toLocaleDateString("ru-RU") : "не задан"}</span>
          </button>
        ))}
        {rows.length === 0 && <div className="v2-empty">Вопросов по выбранному фильтру нет.</div>}
      </div>
    </section>
  );
}
