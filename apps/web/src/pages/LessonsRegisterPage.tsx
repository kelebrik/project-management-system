import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { LESSON_CATEGORIES, type LessonWithProject } from "../app/lessons";
import { useI18n } from "../i18n/I18nProvider";
import "../styles/lessons.css";
import { usePageContext } from "./PageContext";

type Page = { total: number; page: number; pageSize: number; rows: LessonWithProject[] };

/** Lessons of all projects the user can read, newest first, filtered and paged on the server. */
export function LessonsRegisterPage() {
  const { t, formatters } = useI18n();
  const { selectProject } = usePageContext();
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), ...(category ? { category } : {}), ...(search ? { q: search } : {}) });
    apiClient
      .get<Page>(`/api/lessons?${params}`, t("ui.lessons.failed"))
      .then((answer) => {
        if (!active) return;
        setData(answer);
        setError("");
      })
      .catch((failure) => active && setError(failure instanceof Error ? failure.message : t("ui.lessons.failed")));
    return () => {
      active = false;
    };
  }, [category, page, search, t]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <section className="v2-page lessons-register">
      <div className="v2-compact-header">
        <div>
          <h2>{t("view.lessons-register")}</h2>
          <span>{t("ui.lessons.registerHint")}</span>
        </div>
      </div>
      <div className="lessons-register-filters">
        <label>
          {t("ui.lessons.category")}
          <select
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(0);
            }}
            value={category}
          >
            <option value="">{t("ui.lessons.allCategories")}</option>
            {LESSON_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {t(`ui.lessons.cat.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("ui.lessons.search")}
          <input
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            value={query}
          />
        </label>
        {data && <span>{t("ui.lessons.found", { count: data.total })}</span>}
      </div>
      {error && <p className="automation-error">{error}</p>}
      {data?.rows.map((lesson) => (
        <article className="lesson-card" key={lesson.id}>
          <span className="lesson-category">{t(`ui.lessons.cat.${lesson.category}`)}</span>
          <strong>{lesson.title}</strong>
          {lesson.text && <p>{lesson.text}</p>}
          {lesson.recommendation && <p className="lesson-advice">{t("ui.lessons.advice", { text: lesson.recommendation })}</p>}
          <small>
            <button className="link-button" onClick={() => selectProject(lesson.project.id, "project-overview")} type="button">
              {lesson.project.code} {lesson.project.name}
            </button>{" "}
            · {formatters.date(lesson.createdAt)}
          </small>
        </article>
      ))}
      {data && data.total > data.pageSize && (
        <div className="lessons-register-pages">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} type="button">
            ←
          </button>
          <span>{t("ui.lessons.page", { page: page + 1, pages })}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} type="button">
            →
          </button>
        </div>
      )}
    </section>
  );
}
