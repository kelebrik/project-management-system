import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Options } from "highcharts";
import { apiClient } from "../api/client";
import { useAppChartColors } from "../app/charts/appChartTheme";
import { forecastDriftOption, goalsDumbbellOption, milestonesTimelineOption, phasesOption, shiftReasonsParetoOption, shiftsDrilldownOption, type LabText } from "../app/charts/scheduleLabOptions";
import type { ShiftLadder } from "../app/scheduleShifts";
import { HighchartsLabChart } from "../components/charts/HighchartsLabChart";
import { useI18n } from "../i18n/I18nProvider";
import "../styles/schedule-lab.css";
import { usePageContext } from "./PageContext";

/**
 * "Schedule 2.0" in the Development section: the project's schedule — goals,
 * phases, milestones and the journal of their shifts — drawn again with the
 * richer charts of Highcharts, to see what the engine can do. Reads the same
 * project the schedule tab reads, plus the shift journal; changes nothing.
 */

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

export default function ScheduleLabPage() {
  const { t, locale, labels, formatters } = useI18n();
  const { project } = usePageContext();
  const colors = useAppChartColors();
  // The journal of one project: another project's moves are never shown under this one.
  const [journal, setJournal] = useState<{ projectId: string; ladders: ShiftLadder[] } | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const projectId = project?.id ?? null;

  // The extra modules and the chart language come first, so every chart is drawn in the person's language.
  useEffect(() => {
    let alive = true;
    let loaded: typeof import("../components/charts/highchartsExtras") | null = null;
    void import("../components/charts/highchartsExtras").then((module) => {
      if (!alive) return;
      loaded = module;
      module.setLabLanguage(locale);
      setReady(true);
    });
    // The language is put back at once when the lab is left (or the language changes), never later than the next one is set.
    return () => {
      alive = false;
      loaded?.resetLabLanguage();
    };
  }, [locale]);

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

  let body: ReactNode;
  if (!project) body = <div className="lab-empty">{t("ui.lab.noProject")}</div>;
  else if (!ready || !charts) body = <div aria-label={t("ui.pages.loading")} className="lab-empty" />;
  else
    body = (
      <div className="lab-grid">
        <LabCard hint={t("ui.lab.goalsHint")} options={charts.goals} title={t("ui.lab.goals")} />
        <LabCard hint={t("ui.lab.phasesHint")} options={charts.phases} title={t("ui.lab.phases")} />
        <LabCard options={charts.timeline} title={t("ui.lab.timeline")} />
        <LabCard hint={t("ui.lab.reasonsHint")} options={charts.reasons} title={t("ui.lab.reasons")} wide={false} />
        <LabCard hint={t("ui.lab.movesHint")} options={charts.moves} title={t("ui.lab.moves")} wide={false} />
        <LabCard hint={t("ui.lab.driftHint")} options={charts.drift} title={t("ui.lab.drift")} />
      </div>
    );

  return (
    <div className="schedule-lab">
      <header className="lab-head">
        {project && <h2>{project.name}</h2>}
        <p>{t("ui.lab.subtitle")}</p>
        {error && <p className="lab-error">{error}</p>}
      </header>
      {body}
    </div>
  );
}
