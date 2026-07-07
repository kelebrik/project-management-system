import { Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { wikiGroups, type WikiArticle, type WikiGroup } from "../app/wikiContent";

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function articleText(article: WikiArticle) {
  return [
    article.title,
    article.summary,
    ...article.keywords,
    ...article.sections.flatMap((section) => [
      section.heading,
      ...section.points,
    ]),
  ].join(" ");
}

function filterWikiGroups(query: string): WikiGroup[] {
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) {
    return wikiGroups;
  }

  return wikiGroups
    .map((group) => {
      const groupMatches = normalizeSearch(`${group.title} ${group.description}`).includes(
        normalizedQuery,
      );
      const articles = group.articles.filter((article) =>
        normalizeSearch(articleText(article)).includes(normalizedQuery),
      );

      return {
        ...group,
        articles: groupMatches && articles.length === 0 ? group.articles : articles,
      };
    })
    .filter((group) => group.articles.length > 0);
}

function highlightText(value: string, query: string): ReactNode {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return value;

  const normalizedValue = value.toLocaleLowerCase("ru-RU");
  const startIndex = normalizedValue.indexOf(normalizedQuery);
  if (startIndex === -1) return value;

  const endIndex = startIndex + query.trim().length;
  return (
    <>
      {value.slice(0, startIndex)}
      <mark>{value.slice(startIndex, endIndex)}</mark>
      {value.slice(endIndex)}
    </>
  );
}

export function WikiPage() {
  const [query, setQuery] = useState("");
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const filteredGroups = useMemo(() => filterWikiGroups(query), [query]);
  const articleCount = filteredGroups.reduce(
    (count, group) => count + group.articles.length,
    0,
  );
  const expandedBySearch = query.trim().length > 0;

  useEffect(() => {
    const headings = Array.from(
      document.querySelectorAll<HTMLElement>(".wiki-group, .wiki-article"),
    );
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              left.boundingClientRect.top - right.boundingClientRect.top,
          )[0];
        if (visibleEntry?.target.id) {
          setActiveAnchor(visibleEntry.target.id);
        }
      },
      { rootMargin: "-12% 0px -70% 0px", threshold: 0.01 },
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [filteredGroups]);

  useEffect(() => {
    document
      .querySelectorAll(".wiki-sidebar-link.active-anchor")
      .forEach((link) => link.classList.remove("active-anchor"));
    if (!activeAnchor || typeof CSS === "undefined" || !CSS.escape) return;
    document
      .querySelector(`.wiki-sidebar-link[href="#${CSS.escape(activeAnchor)}"]`)
      ?.classList.add("active-anchor");
  }, [activeAnchor]);

  return (
    <section className="content-grid wiki-page">
      <div className="card span-2 wiki-shell">
        <div className="wiki-header">
          <div>
            <h2>FAQ</h2>
            <p>
              Подробное описание реализованной логики системы, расчетов,
              ограничений и сценариев работы.
            </p>
          </div>
          <label className="wiki-search" aria-label="Поиск по FAQ">
            <Search size={18} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Поиск по функциям, алгоритмам и разделам"
            />
          </label>
        </div>

        <div className="wiki-result-count">
          {query.trim()
            ? `Найдено статей: ${articleCount}`
            : `Разделов: ${filteredGroups.length}, статей: ${articleCount}`}
        </div>

        {filteredGroups.length === 0 ? (
          <div className="empty-state wiki-empty">
            <strong>Ничего не найдено</strong>
            <span>Попробуйте другой запрос по названию раздела или алгоритму.</span>
          </div>
        ) : (
          <div className="wiki-content">
            {filteredGroups.map((group) => (
              <section className="wiki-group" id={group.id} key={group.id}>
                <div className="wiki-group-title">
                  <h3>{highlightText(group.title, query)}</h3>
                  <p>{highlightText(group.description, query)}</p>
                </div>
                <div className="wiki-articles">
                  {group.articles.map((article) => (
                    <details
                      className="wiki-article"
                      id={article.id}
                      key={article.id}
                      open={expandedBySearch}
                    >
                      <summary className="wiki-article-head">
                        <div>
                          <h4>{highlightText(article.title, query)}</h4>
                          <p>{highlightText(article.summary, query)}</p>
                        </div>
                      </summary>
                      <div className="wiki-article-sections">
                        {article.sections.map((section) => (
                          <section className="wiki-article-section" key={section.heading}>
                            <h5>{highlightText(section.heading, query)}</h5>
                            <ul>
                              {section.points.map((point, pointIndex) => (
                                <li key={`${section.heading}-${pointIndex}`}>
                                  {highlightText(point, query)}
                                </li>
                              ))}
                            </ul>
                          </section>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
