import {
  JIRA_ANALYTICS_DEFAULT_CONFIG,
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_ANALYTICS_FILTER_LABELS,
  JIRA_ANALYTICS_GROUPS_BY_SOURCE,
  JIRA_ANALYTICS_GROUP_LABELS,
  JIRA_ANALYTICS_METRICS_BY_SOURCE,
  JIRA_ANALYTICS_METRIC_LABELS,
  JIRA_ANALYTICS_OPERATOR_LABELS,
  JIRA_ANALYTICS_SOURCE_LABELS,
  JIRA_CRITICAL_BUG_SLA_HOURS,
  jiraAnalyticsOperatorsFor,
  normalizeJiraAnalyticsConfig,
  type JiraAnalyticsFilter,
  type JiraAnalyticsMetric,
  type JiraAnalyticsSource,
} from "../app/jiraAnalytics";
import { usePageContext } from "./PageContext";

const SOURCE_REFERENCE: Record<
  JiraAnalyticsSource,
  { record: string; processing: string; result: string; period: string }
> = {
  issues: {
    record: "Один актуальный снимок Jira-тикета.",
    processing: "Используются текущие статус, исполнитель, приоритет, Sprint, тип, Resolution и накопленные числа связанных коммитов и merge requests.",
    result: "Количество считает тикеты; Коммиты и Merge requests суммируют текущие значения по отобранным тикетам.",
    period: "Период событий не применяется: источник описывает текущее состояние.",
  },
  transitions: {
    record: "Один завершённый период пребывания тикета в статусе.",
    processing: "Берётся только полная история Jira. Начало периода — создание тикета или предыдущий переход; конец — следующий переход статуса. Незавершённый текущий статус не образует запись.",
    result: "Длительность считается в календарных часах. Доступны количество периодов, среднее и перцентили P50, P85, P95.",
    period: "Период событий отбирает записи по дате перехода, который завершил интервал.",
  },
  development: {
    record: "Одно изменение счётчиков разработки после начального снимка.",
    processing: "Первое наблюдение фиксируется как baseline и не считается активностью. Следующие записи содержат только положительный прирост коммитов и merge requests; Sprint сохраняется на момент наблюдения.",
    result: "Количество считает события изменения; Коммиты и Merge requests суммируют приросты за выбранный период.",
    period: "Период событий отбирает записи по времени наблюдаемой активности разработки.",
  },
  criticalBugs: {
    record: "Один Bug, отслеживаемый по SLA Critical/Blocker.",
    processing: "Тикет должен быть багом и иметь Critical/Blocker в контрольной точке: текущий приоритет для нерешённого тикета либо приоритет на момент Resolution для решённого. Если тикет создан с таким приоритетом, SLA начинается от создания; иначе — от первого повышения. Для достоверной точки старта нужна полная история Jira: при неполной истории используется первый видимый переход в Critical/Blocker либо ранее сохранённое начало, а без такой точки тикет не отслеживается.",
    result: "Интервал идёт до Resolution или до текущего момента. Источник отдаёт все отслеживаемые SLA-записи; затем условия виджета отбирают нарушения. Доступны количество тикетов и среднее/P50/P85/P95 календарной длительности. В преднастроенном отчёте нарушение — больше 720 часов (30 дней).",
    period: "Период событий не ограничивает SLA: учитывается весь интервал каждого отслеживаемого тикета.",
  },
};

const SOURCE_ORDER = Object.keys(SOURCE_REFERENCE) as JiraAnalyticsSource[];

const METRIC_REFERENCE: Record<JiraAnalyticsMetric, string> = {
  count: "Число записей источника после системных и пользовательских условий.",
  commits: "Сумма commitCount: текущие итоги для источника «Тикеты» или приросты для «Активности разработки».",
  mergeRequests: "Сумма mergeRequestCount по отобранным записям.",
  averageDuration: "Арифметическое среднее всех доступных длительностей.",
  p50Duration: "Медиана: 50% длительностей не превышают полученное значение.",
  p85Duration: "85% длительностей не превышают полученное значение.",
  p95Duration: "95% длительностей не превышают полученное значение.",
};

function filterText(filter: JiraAnalyticsFilter) {
  const value = ["empty", "notEmpty"].includes(filter.operator)
    ? ""
    : filter.field === "hasDevelopment"
      ? filter.value === "true" ? "Да" : "Нет"
      : filter.field === "durationHours" && Number.isFinite(Number(filter.value))
        ? `${filter.value} ч${Number(filter.value) === JIRA_CRITICAL_BUG_SLA_HOURS ? " (30 дней)" : ""}`
        : filter.value;
  return [
    JIRA_ANALYTICS_FILTER_LABELS[filter.field],
    JIRA_ANALYTICS_OPERATOR_LABELS[filter.operator],
    value,
  ].filter(Boolean).join(" ");
}

export function JiraAggregatesPage() {
  const { project } = usePageContext();
  const config = normalizeJiraAnalyticsConfig(
    project.jiraAnalyticsSettings?.dashboardConfig,
    JIRA_ANALYTICS_DEFAULT_CONFIG,
  );

  return (
    <div className="jira-aggregates-reference">
      <header className="jira-aggregates-intro">
        <h3>Агрегаты Jira</h3>
        <p>Фактические правила подготовки записей, расчёта метрик, группировки и фильтрации текущего дашборда проекта.</p>
      </header>

      <section className="jira-aggregates-section">
        <h3>Область данных</h3>
        <dl className="jira-aggregate-definitions">
          <div>
            <dt>Импорт</dt>
            <dd>Сначала Jira-тикеты ограничиваются выбранным лейблом либо кодом эпика. Для эпика включаются сам эпик, его дочерние тикеты и их подзадачи.</dd>
          </div>
          <div>
            <dt>В работе</dt>
            <dd>Для любого источника остаются только тикеты с пустым/Unresolved Resolution; статусы Cancelled, Canceled и русские варианты отмены исключаются.</dd>
          </div>
          <div>
            <dt>Ретро</dt>
            <dd>Ограничение текущего состояния не применяется: доступны решённые и отменённые тикеты, необходимые для исторических интервалов.</dd>
          </div>
          <div>
            <dt>Общие фильтры</dt>
            <dd>Исполнитель применяется ко всем источникам. Период событий применяется только к переходам статусов и активности разработки.</dd>
          </div>
        </dl>
      </section>

      <section className="jira-aggregates-section">
        <h3>Источники записей</h3>
        <div className="jira-aggregate-source-list">
          {SOURCE_ORDER.map((source) => {
            const reference = SOURCE_REFERENCE[source];
            return (
              <article className="jira-aggregate-source" key={source}>
                <header>
                  <h4>{JIRA_ANALYTICS_SOURCE_LABELS[source]}</h4>
                  <span>{reference.record}</span>
                </header>
                <dl>
                  <div><dt>Обработка</dt><dd>{reference.processing}</dd></div>
                  <div><dt>Агрегат</dt><dd>{reference.result}</dd></div>
                  <div><dt>Период</dt><dd>{reference.period}</dd></div>
                  <div>
                    <dt>Метрики</dt>
                    <dd>{JIRA_ANALYTICS_METRICS_BY_SOURCE[source].map((metric) => JIRA_ANALYTICS_METRIC_LABELS[metric]).join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Группировки</dt>
                    <dd>{JIRA_ANALYTICS_GROUPS_BY_SOURCE[source].map((group) => JIRA_ANALYTICS_GROUP_LABELS[group]).join(", ")}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      <section className="jira-aggregates-section">
        <h3>Метрики</h3>
        <div className="jira-aggregate-table-wrap">
          <table className="jira-aggregate-table">
            <thead><tr><th>Метрика</th><th>Результат</th></tr></thead>
            <tbody>
              {Object.entries(JIRA_ANALYTICS_METRIC_LABELS).map(([metric, label]) => (
                <tr key={metric}>
                  <td><strong>{label}</strong></td>
                  <td>{METRIC_REFERENCE[metric as JiraAnalyticsMetric]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="jira-aggregates-section">
        <h3>Условия и группировки</h3>
        <div className="jira-aggregate-table-wrap">
          <table className="jira-aggregate-table source-matrix">
            <thead><tr><th>Источник</th><th>Поля и доступные операции</th><th>Группировки</th></tr></thead>
            <tbody>
              {SOURCE_ORDER.map((source) => {
                const fields = JIRA_ANALYTICS_FIELDS_BY_SOURCE[source];
                return (
                  <tr key={source}>
                    <td><strong>{JIRA_ANALYTICS_SOURCE_LABELS[source]}</strong></td>
                    <td>
                      <ul className="jira-aggregate-plain-list">
                        {fields.map((field) => (
                          <li key={field}>
                            <strong>{JIRA_ANALYTICS_FILTER_LABELS[field]}</strong>
                            {` — ${jiraAnalyticsOperatorsFor(field).map((operator) => JIRA_ANALYTICS_OPERATOR_LABELS[operator]).join(", ")}`}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>{JIRA_ANALYTICS_GROUPS_BY_SOURCE[source].map((group) => JIRA_ANALYTICS_GROUP_LABELS[group]).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="jira-aggregate-note">Условия внутри виджета объединяются через И либо ИЛИ. Значения Unresolved и «Не решен/Не решено» считаются пустым Resolution.</p>
        <dl className="jira-aggregate-definitions">
          <div><dt>Равно / не равно</dt><dd>Сравнение полного строкового представления без учёта регистра. Для числовых порогов следует использовать «больше» или «не меньше».</dd></div>
          <div><dt>Содержит</dt><dd>Проверка вхождения текста без учёта регистра.</dd></div>
          <div><dt>Пусто / не пусто</dt><dd>Проверка отсутствия значения; дополнительное значение вводить не нужно.</dd></div>
          <div><dt>Больше</dt><dd>Строгое числовое сравнение: фактическое значение должно быть больше порога.</dd></div>
          <div><dt>Не меньше</dt><dd>Числовое сравнение с включённой границей: фактическое значение больше либо равно порогу.</dd></div>
        </dl>
      </section>

      <section className="jira-aggregates-section">
        <h3>Порядок результатов</h3>
        <dl className="jira-aggregate-definitions">
          <div><dt>Группы</dt><dd>Сортируются по значению агрегата по убыванию, затем по названию.</dd></div>
          <div><dt>Таблицы</dt><dd>Сначала показываются записи с большей длительностью, при равенстве — с более поздней датой события.</dd></div>
          <div><dt>Визуализация</dt><dd>Число, столбцы и таблица не меняют формулу агрегата и набор отобранных записей. На карточке столбцы показывают первые 12 групп, а таблица — первые 12 записей.</dd></div>
        </dl>
      </section>

      <section className="jira-aggregates-section">
        <h3>Текущие виджеты проекта</h3>
        <div className="jira-aggregate-table-wrap">
          <table className="jira-aggregate-table current-widgets">
            <thead><tr><th>Раздел</th><th>Виджет</th><th>Источник</th><th>Агрегат</th><th>Группировка</th><th>Условия</th></tr></thead>
            <tbody>
              {config.widgets.map((widget) => (
                <tr key={widget.id}>
                  <td>{widget.section === "active" ? "В работе" : "Ретро"}</td>
                  <td><strong>{widget.title}</strong></td>
                  <td>{JIRA_ANALYTICS_SOURCE_LABELS[widget.source]}</td>
                  <td>{JIRA_ANALYTICS_METRIC_LABELS[widget.metric]}</td>
                  <td>{JIRA_ANALYTICS_GROUP_LABELS[widget.groupBy]}</td>
                  <td>{widget.filters.length > 0
                    ? `${widget.filterLogic === "and" ? "И" : "ИЛИ"}: ${widget.filters.map(filterText).join("; ")}`
                    : "Без дополнительных условий"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
