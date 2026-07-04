import { Search } from "lucide-react";
import { useMemo, useState } from "react";

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

export function WikiPage() {
  const [query, setQuery] = useState("");
  const filteredGroups = useMemo(() => filterWikiGroups(query), [query]);
  const articleCount = filteredGroups.reduce(
    (count, group) => count + group.articles.length,
    0,
  );

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
                  <h3>{group.title}</h3>
                  <p>{group.description}</p>
                </div>
                <div className="wiki-articles">
                  {group.articles.map((article) => (
                    <article className="wiki-article" id={article.id} key={article.id}>
                      <header className="wiki-article-head">
                        <div>
                          <h4>{article.title}</h4>
                          <p>{article.summary}</p>
                        </div>
                      </header>
                      <div className="wiki-article-sections">
                        {article.sections.map((section) => (
                          <section className="wiki-article-section" key={section.heading}>
                            <h5>{section.heading}</h5>
                            <ul>
                              {section.points.map((point, pointIndex) => (
                                <li key={`${section.heading}-${pointIndex}`}>{point}</li>
                              ))}
                            </ul>
                          </section>
                        ))}
                      </div>
                    </article>
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
