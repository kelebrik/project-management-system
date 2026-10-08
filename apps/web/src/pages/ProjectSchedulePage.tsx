import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Options } from "highcharts";
import { apiClient } from "../api/client";
import { useAppChartColors } from "../app/charts/appChartTheme";
import { forecastDriftOption, goalsDumbbellOption, milestonesTimelineOption, phasesOption, printScheduleOption, shiftReasonsParetoOption, shiftsDrilldownOption, type LabText } from "../app/charts/scheduleLabOptions";
import { printSectionAsPdf } from "../app/pdfPrint";
import type { ShiftLadder } from "../app/scheduleShifts";
import { HighchartsLabChart } from "../components/charts/HighchartsLabChart";
import { useHighchartsExtras } from "../components/charts/useHighchartsExtras";
import { useI18n } from "../i18n/I18nProvider";
import "../styles/schedule-lab.css";
import { usePageContext } from "./PageContext";

/**
 * The project's schedule tab: goals, phases, milestones and the journal of
 * their shifts drawn with Highcharts — dumbbells, progress bars, a timeline of
 * events, Pareto, drill-down and annotations; each chart zooms and exports.
 * "Save as PDF" puts every chart on a page of its own. Reads the project and
 * its shift journal; changes nothing. The schedule before this one lives in
 * Development as "Old schedule".
 */

const PRINT_SECTION = "project-schedule-charts";

function LabCard({ title, hint, options, wide = true }: { title: string; hint?: string; options: Options | null; wide?: boolean }) {
  const { t } = useI18n();
  return (
    <section className={`lab-card ${wide ? "lab-card-wide" : ""}`}>
      <header>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </header>
      {options ? <HighchartsLabChart label={title} options={options} /> : <div className="lab-empty">{t("ui.lab.empty")}</div>}
    </section>
  );
}

export default function ProjectSchedulePage() {
  const { t, locale, labels, formatters } = useI18n();
  const { project } = usePageContext();
  const colors = useAppChartColors();
  // The journal of one project: another project's moves are never shown under this one.
  const [journal, setJournal] = useState<{ projectId: string; ladders: ShiftLadder[] } | null>(null);
  const [error, setError] = useState("");
  // The extra modules and the chart language come first, so every chart is drawn in the person's language.
  const ready = useHighchartsExtras(locale);
  // While printing, every chart is drawn again at the page's size; the dialog opens once they are.
  const [printing, setPrinting] = useState(false);
  const projectId = project?.id ?? null;

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    apiClient
      .get<{ checkpoints: ShiftLadder[] }>(`/api/projects/${projectId}/schedule-shifts`, t("ui.lab.shiftsFailed"))
      .then((answer) => {
        if (!alive) return;
        setJournal({ projectId, ladders: answer.checkpoints });
        setError("");
      })
      .catch((failure: unknown) => alive && setError(failure instanceof Error ? failure.message : t("ui.lab.shiftsFailed")));
    return () => {
      alive = false;
    };
  }, [projectId, t]);

  const text = useMemo<LabText>(
    () => ({
      today: t("ui.lab.today"),
      baseline: t("ui.lab.baseline"),
      forecast: t("ui.lab.forecast"),
      noBaseline: t("ui.lab.noBaseline"),
      daysLater: (count) => t("ui.lab.daysLater", { count }),
      daysEarlier: (count) => t("ui.lab.daysEarlier", { count }),
      onTime: t("ui.lab.onTime"),
      progress: t("ui.lab.progress"),
      phaseless: t("ui.lab.phaseless"),
      status: (status) => labels.wbsStatusLabel(status),
      type: (type) => labels.wbsTypeLabel(type),
      reason: (category) => t(`ui.shifts.reason.${category}` as "ui.shifts.reason.OTHER"),
      days: t("ui.lab.days"),
      share: t("ui.lab.share"),
      shiftsOf: (title) => t("ui.lab.shiftsOf", { title }),
      drift: t("ui.lab.drift"),
      earlier: (count) => t("ui.lab.earlier", { count }),
      titles: { goals: t("ui.lab.goals"), phases: t("ui.lab.phases"), timeline: t("ui.lab.timeline"), reasons: t("ui.lab.reasons"), moves: t("ui.lab.moves"), drift: t("ui.lab.drift") },
      date: (day) => formatters.date(day),
      dayMonth: (day) => formatters.formatDate(day, { day: "2-digit", month: "2-digit" }),
    }),
    [formatters, labels, t],
  );

  const today = new Date().toISOString().slice(0, 10);
  const items = project?.wbsItems;
  const charts = useMemo(() => {
    if (!items) return null;
    const input = { items, today, colors, text };
    const ladders = journal && journal.projectId === projectId ? journal.ladders : [];
    return {
      goals: goalsDumbbellOption(input),
      phases: phasesOption(input),
      timeline: milestonesTimelineOption(input),
      reasons: shiftReasonsParetoOption(ladders, colors, text),
      moves: shiftsDrilldownOption(ladders, colors, text),
      drift: forecastDriftOption(ladders, colors, text, today),
    };
  }, [colors, items, journal, projectId, text, today]);

  const shown = useMemo(() => {
    if (!charts || !printing) return charts;
    const paper = (options: Options | null) => (options ? printScheduleOption(options) : null);
    return { goals: paper(charts.goals), phases: paper(charts.phases), timeline: paper(charts.timeline), reasons: paper(charts.reasons), moves: paper(charts.moves), drift: paper(charts.drift) };
  }, [charts, printing]);

  const chartCount = shown ? Object.values(shown).filter(Boolean).length : 0;
  useEffect(() => {
    if (!printing) return;
    // One way out for every ending: printed, failed, never heard back (30 s) or the page left.
    let finished = false;
    let frame = 0;
    let printCleanup: (() => void) | undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener("afterprint", finish);
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      setPrinting(false);
    };
    const timer = window.setTimeout(finish, 30_000);
    // The dialog opens once every chart is drawn again at the page's size (they are drawn in effects).
    let waited = 0;
    const attempt = () => {
      const drawn = document.querySelectorAll(`#${PRINT_SECTION} .lab-card .highcharts-root`).length;
      if (drawn < chartCount) {
        // Never a half-drawn PDF: after two seconds without every chart the printing is given up.
        if (waited++ < 120) frame = window.requestAnimationFrame(attempt);
        else finish();
        return;
      }
      window.addEventListener("afterprint", finish, { once: true });
      try {
        printCleanup = printSectionAsPdf(PRINT_SECTION, `${project?.code ?? ""} - ${t("tab.project-schedule")}`);
      } catch {
        finish();
      }
    };
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(attempt);
    });
    return () => {
      window.removeEventListener("afterprint", finish);
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      // The print helper's own listener and timer go too, so they cannot touch a later print.
      printCleanup?.();
    };
  }, [chartCount, printing, project?.code, t]);

  const print = useCallback(() => setPrinting(true), []);

  let body: ReactNode;
  if (!project) body = <div className="lab-empty">{t("ui.lab.noProject")}</div>;
  else if (!ready || !shown) body = <div aria-label={t("ui.pages.loading")} className="lab-empty" />;
  else
    body = (
      <div className="lab-grid">
        <LabCard hint={t("ui.lab.goalsHint")} options={shown.goals} title={t("ui.lab.goals")} />
        <LabCard hint={t("ui.lab.phasesHint")} options={shown.phases} title={t("ui.lab.phases")} />
        <LabCard options={shown.timeline} title={t("ui.lab.timeline")} />
        <LabCard hint={t("ui.lab.reasonsHint")} options={shown.reasons} title={t("ui.lab.reasons")} wide={false} />
        <LabCard hint={t("ui.lab.movesHint")} options={shown.moves} title={t("ui.lab.moves")} wide={false} />
        <LabCard hint={t("ui.lab.driftHint")} options={shown.drift} title={t("ui.lab.drift")} />
      </div>
    );

  return (
    <div className="schedule-lab" data-print-section={PRINT_SECTION} id={PRINT_SECTION}>
      <header className="lab-head">
        <p>{t("ui.lab.subtitle")}</p>
        <button className="secondary-button" disabled={printing || !ready || !shown} onClick={print} type="button">{t("ui.lab.pdf")}</button>
        {error && <p className="lab-error">{error}</p>}
      </header>
      {body}
    </div>
  );
}
