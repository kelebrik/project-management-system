import { getWikiGroups } from "../i18n/wiki";
import { useI18n } from "../i18n/I18nProvider";

/** The table of contents shares the wiki's data, loaded only when it opens. */
export default function WikiNavigation() {
  const { t, locale } = useI18n();
  return (
    <nav className="section-navigation section-tabs wiki-section-tabs" aria-label={t("nav.contents")}>
      {getWikiGroups(locale).flatMap((group) => [
        <a href={`#${group.id}`} key={group.id}>{group.title}</a>,
        ...group.articles.map((article) => (
          <a className="wiki-article-tab" href={`#${article.id}`} key={article.id}>
            {article.title}
          </a>
        )),
      ])}
    </nav>
  );
}
