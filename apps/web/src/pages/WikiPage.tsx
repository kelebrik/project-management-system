import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { getWikiGroups } from "../i18n/wiki";
import { intlLocale } from "../i18n/locale";
import { useI18n as useLocaleTranslation } from "../i18n/I18nProvider";
import type { Locale } from "../i18n/types";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { type WikiArticle, type WikiGroup } from "../app/wikiContent";

function normalizeSearch(value: string, uiLocale: Locale) {
  return value.trim().toLocaleLowerCase(intlLocale(uiLocale));
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

function filterWikiGroups(query: string, uiLocale: Locale): WikiGroup[] {
  const wikiGroups = getWikiGroups(uiLocale);
  const normalizedQuery = normalizeSearch(query, uiLocale);

  if (!normalizedQuery) {
    return wikiGroups;
  }

  return wikiGroups
    .map((group) => {
      const groupMatches = normalizeSearch(`${group.title} ${group.description}`, uiLocale).includes(
        normalizedQuery,
      );
      const articles = group.articles.filter((article) =>
        normalizeSearch(articleText(article), uiLocale).includes(normalizedQuery),
      );

      return {
        ...group,
        articles: groupMatches && articles.length === 0 ? group.articles : articles,
      };
    })
    .filter((group) => group.articles.length > 0);
}

function highlightText(value: string, query: string, uiLocale: Locale): ReactNode {
  const normalizedQuery = normalizeSearch(query, uiLocale);
  if (!normalizedQuery) return value;

  const normalizedValue = value.toLocaleLowerCase(intlLocale(uiLocale));
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
  const { t: uiText } = useInterfaceTranslation();
  const { locale: uiLocale } = useLocaleTranslation();
  const [query, setQuery] = useState("");
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const filteredGroups = useMemo(() => filterWikiGroups(query, uiLocale), [query, uiLocale]);
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
              {uiText("ui.wiki.wikiPageSubtitle")}
            </p>
          </div>
          <label className="wiki-search" aria-label={uiText("ui.wiki.wikiSearchLabel")}>
            <Search size={18} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={uiText("ui.wiki.wikiSearchPlaceholder")}
            />
          </label>
        </div>

        <div className="wiki-result-count">
          {query.trim()
            ? uiText("wiki.found", { count: articleCount })
            : uiText("wiki.counts", { sections: filteredGroups.length, articles: articleCount })}
        </div>

        {filteredGroups.length === 0 ? (
          <div className="empty-state wiki-empty">
            <strong>{uiText("ui.wiki.wikiNothingFoundTitle")}</strong>
            <span>{uiText("ui.wiki.wikiNothingFoundHint")}</span>
          </div>
        ) : (
          <div className="wiki-content">
            {filteredGroups.map((group) => (
              <section className="wiki-group" id={group.id} key={group.id}>
                <div className="wiki-group-title">
                  <h3>{highlightText(group.title, query, uiLocale)}</h3>
                  <p>{highlightText(group.description, query, uiLocale)}</p>
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
                          <h4>{highlightText(article.title, query, uiLocale)}</h4>
                          <p>{highlightText(article.summary, query, uiLocale)}</p>
                        </div>
                      </summary>
                      <div className="wiki-article-sections">
                        {article.sections.map((section) => (
                          <section className="wiki-article-section" key={section.heading}>
                            <h5>{highlightText(section.heading, query, uiLocale)}</h5>
                            <ul>
                              {section.points.map((point, pointIndex) => (
                                <li key={`${section.heading}-${pointIndex}`}>
                                  {highlightText(point, query, uiLocale)}
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
