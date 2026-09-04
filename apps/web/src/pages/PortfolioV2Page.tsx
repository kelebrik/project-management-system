import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  BookOpenText,
  CalendarClock,
  Maximize2,
  Minimize2,
  Search,
  X,
} from "lucide-react";

import {
  createPortfolioRoadmap,
  portfolioRoadmapDateLabel,
  preparePortfolioRoadmapProjects,
  PORTFOLIO_ROADMAP_TRACKS,
  type PortfolioRoadmapSegment,
  type PortfolioRoadmapRange,
  type PortfolioRoadmapSourceProject,
} from "../app/portfolioRoadmapModel";
import { apiClient } from "../api/client";
import { usePageContext } from "./PageContext";

const RANGE_OPTIONS: Array<{ value: PortfolioRoadmapRange; label: string }> = [
  { value: 6, label: "6 мес." },
  { value: 12, label: "12 мес." },
  { value: 24, label: "24 мес." },
];

function itemCountLabel(value: number) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${value} элементов ИСР`;
  if (mod10 === 1) return `${value} элемент ИСР`;
  if (mod10 >= 2 && mod10 <= 4) return `${value} элемента ИСР`;
  return `${value} элементов ИСР`;
}

function initialRange(): PortfolioRoadmapRange {
  try {
    const saved = Number(window.localStorage.getItem("pms:portfolio-v2-range"));
    return saved === 6 || saved === 12 || saved === 24 ? saved : 12;
  } catch {
    return 12;
  }
}

function saveRange(value: PortfolioRoadmapRange) {
  try {
    window.localStorage.setItem("pms:portfolio-v2-range", String(value));
  } catch {
    // The selected range still applies for this session when storage is unavailable.
  }
}

type SelectedSegment = {
  projectId: string;
  projectName: string;
  trackLabel: string;
  segment: PortfolioRoadmapSegment;
};

export function PortfolioV2Page() {
  const {
    firstEnabledProjectView,
    fullscreenWorkspaceView,
    selectProject,
    toggleWorkspaceFullscreen,
  } = usePageContext();
  const isFullscreen = fullscreenWorkspaceView === "portfolio-v2";
  const [range, setRange] = useState<PortfolioRoadmapRange>(initialRange);
  const [query, setQuery] = useState("");
  const [portfolioFilter, setPortfolioFilter] = useState("ALL");
  const [legendOpen, setLegendOpen] = useState(false);
  const [projectItems, setProjectItems] = useState<PortfolioRoadmapSourceProject[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedSegment, setSelectedSegment] = useState<SelectedSegment | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const legendDialogRef = useRef<HTMLElement>(null);
  const legendTriggerRef = useRef<HTMLButtonElement>(null);
  const legendCloseRef = useRef<HTMLButtonElement>(null);
  const selectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .get<PortfolioRoadmapSourceProject[]>(
        "/api/projects/portfolio-roadmap",
        "Не удалось загрузить дорожную карту",
      )
      .then((items) => {
        if (!cancelled) setProjectItems(items);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Не удалось загрузить дорожную карту",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const preparedProjects = useMemo(
    () => preparePortfolioRoadmapProjects(projectItems ?? []),
    [projectItems],
  );
  const portfolioOptions = useMemo(
    () =>
      Array.from(
        new Set(preparedProjects.map((project) => project.portfolio)),
      ).sort((left, right) => left.localeCompare(right, "ru")),
    [preparedProjects],
  );
  const effectivePortfolioFilter =
    portfolioFilter === "ALL" || portfolioOptions.includes(portfolioFilter)
      ? portfolioFilter
      : "ALL";
  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
    return preparedProjects.filter((project) => {
      if (
        effectivePortfolioFilter !== "ALL" &&
        project.portfolio !== effectivePortfolioFilter
      ) {
        return false;
      }
      if (!normalizedQuery) return true;
      return [project.projectCode, project.projectName, project.projectManager]
        .filter(Boolean)
        .some((value) =>
          value.toLocaleLowerCase("ru-RU").includes(normalizedQuery),
        );
    });
  }, [effectivePortfolioFilter, preparedProjects, query]);
  const roadmap = useMemo(
    () => createPortfolioRoadmap(visibleProjects, range),
    [range, visibleProjects],
  );

  useEffect(() => {
    if (!legendOpen) return;
    const previouslyFocused = document.activeElement;
    legendCloseRef.current?.focus();
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLegendOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        legendDialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeys);
    return () => {
      window.removeEventListener("keydown", handleDialogKeys);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [legendOpen]);

  useEffect(() => {
    if (selectedSegment) selectionRef.current?.focus();
  }, [selectedSegment]);

  const openProject = (projectId: string) => {
    selectProject(projectId, firstEnabledProjectView);
  };

  const scrollToToday = () => {
    const viewport = scrollRef.current;
    if (!viewport || roadmap.todayOffset === null) return;
    const marker = viewport.querySelector<HTMLElement>("[data-today-marker='true']");
    if (!marker) return;
    const viewportRect = viewport.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const todayX = viewport.scrollLeft + markerRect.left - viewportRect.left;
    viewport.scrollTo({
      behavior: "smooth",
      left: Math.max(0, todayX - viewport.clientWidth / 2),
    });
  };

  const gridStyle = {
    "--portfolio-roadmap-month-count": roadmap.monthCount,
  } as CSSProperties;

  return (
    <section
      className={`portfolio-roadmap-page ${isFullscreen ? "portfolio-roadmap-page-fullscreen" : ""}`}
    >
      <div className="portfolio-roadmap-toolbar">
        <label className="portfolio-roadmap-search">
          <Search aria-hidden="true" size={15} />
          <input
            aria-label="Поиск проекта"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Проект, код или РП"
            type="search"
            value={query}
          />
        </label>

        <label className="portfolio-roadmap-select">
          <span>Портфель</span>
          <select
            aria-label="Фильтр по портфелю"
            onChange={(event) => setPortfolioFilter(event.currentTarget.value)}
            value={effectivePortfolioFilter}
          >
            <option value="ALL">Все портфели</option>
            {portfolioOptions.map((portfolio) => (
              <option key={portfolio} value={portfolio}>
                {portfolio}
              </option>
            ))}
          </select>
        </label>

        <div className="portfolio-roadmap-range" role="group" aria-label="Горизонт планирования">
          {RANGE_OPTIONS.map((option) => (
            <button
              aria-pressed={range === option.value}
              className={range === option.value ? "active" : ""}
              key={option.value}
              onClick={() => {
                saveRange(option.value);
                setRange(option.value);
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="portfolio-roadmap-actions">
          <button
            aria-label={
              isFullscreen
                ? "Вернуть обычный режим Портфеля v2"
                : "Развернуть Портфель v2 на весь экран"
            }
            className="workspace-fullscreen-button"
            onClick={() => toggleWorkspaceFullscreen("portfolio-v2")}
            title={isFullscreen ? "Вернуть обычный режим" : "На весь экран"}
            type="button"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            {isFullscreen ? "Обычный режим" : "На весь экран"}
          </button>
          <button
            disabled={roadmap.todayOffset === null}
            onClick={scrollToToday}
            title="Прокрутить к текущей дате"
            type="button"
          >
            <CalendarClock aria-hidden="true" size={15} />
            Сегодня
          </button>
          <button
            onClick={() => setLegendOpen(true)}
            ref={legendTriggerRef}
            type="button"
          >
            <BookOpenText aria-hidden="true" size={15} />
            Легенда
          </button>
        </div>
      </div>

      <div
        aria-label="Сводка дорожной карты"
        className="portfolio-roadmap-summary"
        role="group"
      >
        <div>
          <strong>{roadmap.projectCount}</strong>
          <span>проектов показано</span>
        </div>
        <div>
          <strong>{roadmap.mappedProjectCount}</strong>
          <span>с пакетами работ HW / SW / G2M</span>
        </div>
        <div>
          <strong>{roadmap.launchProjectCount}</strong>
          <span>проектов с запуском в ближайшие 12 мес.</span>
        </div>
        <div className={roadmap.unmappedProjectCount > 0 ? "attention" : ""}>
          <strong>{roadmap.unmappedProjectCount}</strong>
          <span>без пакетов HW / SW / G2M</span>
        </div>
      </div>

      {selectedSegment && (
        <aside
          aria-describedby="portfolio-roadmap-selection-meta portfolio-roadmap-selection-description"
          aria-labelledby="portfolio-roadmap-selection-title"
          aria-live="polite"
          className="portfolio-roadmap-selection"
          ref={selectionRef}
          tabIndex={-1}
        >
          <span
            aria-hidden="true"
            className={`portfolio-roadmap-swatch ${selectedSegment.segment.isStructureFallback ? "is-structure-fallback" : ""}`}
            style={{ backgroundColor: selectedSegment.segment.color }}
          />
          <div>
            <strong id="portfolio-roadmap-selection-title">
              {selectedSegment.segment.label}
            </strong>
            <span id="portfolio-roadmap-selection-meta">
              {selectedSegment.projectName} · {selectedSegment.trackLabel} · ИСР {selectedSegment.segment.code} ·{" "}
              {portfolioRoadmapDateLabel(selectedSegment.segment.startDate)} -{" "}
              {portfolioRoadmapDateLabel(selectedSegment.segment.endDate)} ·{" "}
              {itemCountLabel(selectedSegment.segment.itemCount)} · готовность{" "}
              {selectedSegment.segment.progress}%
            </span>
            <small id="portfolio-roadmap-selection-description">
              Легенда: {selectedSegment.segment.legendLabel}.{" "}
              {selectedSegment.segment.description}
            </small>
          </div>
          <button
            onClick={() => openProject(selectedSegment.projectId)}
            type="button"
          >
            Открыть проект
          </button>
          <button
            aria-label="Закрыть детали пакета работ"
            className="portfolio-roadmap-selection-close"
            onClick={() => setSelectedSegment(null)}
            title="Закрыть"
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </aside>
      )}

      <div
        aria-label="Календарная дорожная карта портфеля"
        className="portfolio-roadmap-scroll"
        data-testid="portfolio-v2-roadmap"
        ref={scrollRef}
        role="region"
        tabIndex={0}
      >
        <div
          className={`portfolio-roadmap-grid ${range <= 12 ? "is-viewport-scaled" : ""}`}
          style={gridStyle}
        >
          <div className="portfolio-roadmap-calendar-head">
            <div className="portfolio-roadmap-project-head">Проект</div>
            <div className="portfolio-roadmap-track-head">Трек</div>
            {roadmap.quarters.map((quarter) => (
              <div
                className="portfolio-roadmap-quarter"
                key={quarter.key}
                style={{
                  gridColumn: `${quarter.startIndex + 3} / span ${quarter.monthSpan}`,
                }}
              >
                {quarter.label}
              </div>
            ))}
            {roadmap.months.map((month, index) => (
              <div
                className={`portfolio-roadmap-month ${month.isCurrent ? "current" : ""}`}
                key={month.key}
                style={{ gridColumn: index + 3 }}
              >
                {month.label}
              </div>
            ))}
          </div>

          {roadmap.groups.map((group) => (
            <section className="portfolio-roadmap-group" key={group.name}>
              <div className="portfolio-roadmap-group-head">
                <span>
                  <b>{group.name}</b>
                  <small>{group.projects.length}</small>
                </span>
              </div>
              {group.projects.map((project) => {
                const hasSegments = project.tracks.some(
                  (track) => track.segments.length > 0,
                );
                return (
                  <div
                    className={`portfolio-roadmap-project ${hasSegments ? "" : "is-empty"}`}
                    data-project-id={project.projectId}
                    key={project.projectId}
                  >
                    <button
                      className="portfolio-roadmap-project-cell"
                      onClick={() => openProject(project.projectId)}
                      type="button"
                    >
                      <span className={`portfolio-roadmap-rag ${project.rag.toLowerCase()}`} />
                      <span>
                        <b>{project.projectName}</b>
                        <small>
                          {project.projectCode}
                          {project.projectManager ? ` · ${project.projectManager}` : ""}
                        </small>
                      </span>
                    </button>

                    {project.tracks.map((track, trackIndex) => (
                      <div
                        className="portfolio-roadmap-track"
                        key={track.id}
                        style={{
                          "--portfolio-roadmap-lane-count": track.laneCount,
                          gridRow: trackIndex + 1,
                        } as CSSProperties}
                      >
                        <div className={`portfolio-roadmap-track-label track-${track.id.toLowerCase()}`}>
                          {track.label}
                        </div>
                        <div
                          aria-label={`${track.label}: ${project.projectName}`}
                          className="portfolio-roadmap-lane"
                          role="group"
                        >
                          {roadmap.months.map((month) => (
                            <span
                              aria-hidden="true"
                              className={`portfolio-roadmap-month-cell ${month.isCurrent ? "current" : ""}`}
                              key={month.key}
                            />
                          ))}
                          {roadmap.todayOffset !== null && (
                            <span
                              aria-hidden="true"
                              className="portfolio-roadmap-today"
                              data-today-marker={trackIndex === 0 ? "true" : undefined}
                              style={{ left: `${roadmap.todayOffset}%` }}
                            />
                          )}
                          {track.segments.map((segment) => (
                            <button
                              aria-label={`${segment.code}, ${segment.label}, ${project.projectName}, ${track.label}, легенда ${segment.legendLabel}, ${portfolioRoadmapDateLabel(segment.startDate)} - ${portfolioRoadmapDateLabel(segment.endDate)}, ${itemCountLabel(segment.itemCount)}, готовность ${segment.progress}%. ${segment.description}`}
                              className={`portfolio-roadmap-segment ${segment.isStructureFallback ? "is-structure-fallback" : ""}`}
                              key={segment.id}
                              onClick={() =>
                                setSelectedSegment({
                                  projectId: project.projectId,
                                  projectName: project.projectName,
                                  trackLabel: track.label,
                                  segment,
                                })
                              }
                              style={{
                                "--portfolio-roadmap-segment-row": segment.row,
                                backgroundColor: segment.color,
                                left: `${segment.offset}%`,
                                width: `${segment.width}%`,
                              } as CSSProperties}
                              title={`${segment.code} · ${segment.label}`}
                              type="button"
                            >
                              <span>{segment.label}</span>
                            </button>
                          ))}
                          {!hasSegments && trackIndex === 0 && (
                            <span className="portfolio-roadmap-empty-label">
                              Нет пакетов работ в выбранном горизонте
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </section>
          ))}

          {projectItems === null && !loadError && (
            <div className="portfolio-roadmap-no-results" role="status">
              Загружаем дорожную карту...
            </div>
          )}

          {loadError && (
            <div className="portfolio-roadmap-no-results" role="alert">
              <span>{loadError}</span>
              <button
                onClick={() => {
                  setProjectItems(null);
                  setLoadError("");
                  setReloadToken((value) => value + 1);
                }}
                type="button"
              >
                Повторить
              </button>
            </div>
          )}

          {projectItems !== null && !loadError && roadmap.projectCount === 0 && (
            <div className="portfolio-roadmap-no-results">
              Проекты по заданным фильтрам не найдены.
            </div>
          )}
        </div>
      </div>

      {legendOpen && (
        <div
          className="portfolio-roadmap-legend-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setLegendOpen(false);
          }}
        >
          <section
            aria-labelledby="portfolio-roadmap-legend-title"
            aria-modal="true"
            className="portfolio-roadmap-legend"
            ref={legendDialogRef}
            role="dialog"
          >
            <header>
              <div>
                <h2 id="portfolio-roadmap-legend-title">Легенда этапов</h2>
                <span>HW / SW / G2M</span>
              </div>
              <button
                aria-label="Закрыть легенду"
                className="portfolio-roadmap-legend-close"
                onClick={() => setLegendOpen(false)}
                ref={legendCloseRef}
                title="Закрыть"
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <div className="portfolio-roadmap-legend-content">
              {PORTFOLIO_ROADMAP_TRACKS.map((track) => (
                <section className="portfolio-roadmap-legend-track" key={track.id}>
                  <h3>{track.label}-трек</h3>
                  <div>
                    {track.phases.map((phase) => (
                      <div className="portfolio-roadmap-legend-row" key={phase.id}>
                        <span
                          aria-hidden="true"
                          className={`portfolio-roadmap-swatch ${phase.isStructureFallback ? "is-structure-fallback" : ""}`}
                          style={{ backgroundColor: phase.color }}
                        />
                        <span>
                          <b>{phase.label}</b>
                          <small>{phase.description}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
