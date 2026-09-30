import { SHIFT_REASON_CATEGORIES } from './schedule-shifts.js';

export const LESSON_CATEGORIES = [...SHIFT_REASON_CATEGORIES, 'GOOD_PRACTICE'] as const;
export type LessonCategory = (typeof LESSON_CATEGORIES)[number];
export const LESSON_SOURCES = ['MANUAL', 'SHIFT', 'RISK', 'ISSUE', 'DECISION'] as const;

export type LessonDraft = {
  category: LessonCategory;
  title: string;
  text: string;
  recommendation: string;
  sourceKind: (typeof LESSON_SOURCES)[number];
  /** One record per draft, so a lesson saved from it is not offered again. */
  sourceRef: string;
};

const TEXT = {
  ru: {
    goalReason: (goal: string, days: number) => `Сдвиг цели «${goal}»: ${days} дн.`,
    goalNone: (goal: string, days: number) => `Сдвиги цели «${goal}» без названной причины: ${days} дн.`,
    goalReasonText: (days: number) => `Цель сдвинулась на ${days} календ. дн. по этой причине после утверждения базового плана.`,
    goalNoneText: (days: number) => `${days} календ. дн. сдвига цели записаны без причины.`,
    goalNoneAdvice: 'Называть причину каждого сдвига вехи сразу, в момент изменения плана.',
    before: (goal: string, days: number) => `Сдвиг цели «${goal}» до журнала: ${days} дн.`,
    beforeText: 'Эти дни цель сдвинулась до появления журнала сдвигов; причины нужно восстановить по памяти команды.',
    problem: (title: string) => `Проблема: ${title}`,
    done: (plan: string) => `Что делали: ${plan}`,
    fallback: (plan: string) => `Запасной план: ${plan}`,
    risk: (title: string) => `Сработавший риск: ${title}`,
    riskPlan: (plan: string) => `План снижения был: ${plan}`,
    riskNoPlan: 'План снижения не был записан.',
    issue: (critical: boolean, title: string) => `${critical ? 'Критичный' : 'Высокий'} вопрос: ${title}`,
    issueLate: (days: number) => `Закрыт с опозданием на ${days} календ. дн. против первоначального срока.`,
    decision: (title: string) => `Решение: ${title}`,
  },
  en: {
    goalReason: (goal: string, days: number) => `Goal "${goal}" moved: ${days} days`,
    goalNone: (goal: string, days: number) => `Goal "${goal}" moved without a named reason: ${days} days`,
    goalReasonText: (days: number) => `The goal moved ${days} calendar days for this reason after the baseline was set.`,
    goalNoneText: (days: number) => `${days} calendar days of the goal's move were recorded without a reason.`,
    goalNoneAdvice: 'Name the reason of every checkpoint move right when the plan changes.',
    before: (goal: string, days: number) => `Goal "${goal}" moved before the journal: ${days} days`,
    beforeText: 'The goal moved these days before the shift journal existed; the team has to recall the reasons.',
    problem: (title: string) => `Problem: ${title}`,
    done: (plan: string) => `What was done: ${plan}`,
    fallback: (plan: string) => `Fallback: ${plan}`,
    risk: (title: string) => `Risk that came true: ${title}`,
    riskPlan: (plan: string) => `The mitigation plan was: ${plan}`,
    riskNoPlan: 'No mitigation plan was written.',
    issue: (critical: boolean, title: string) => `${critical ? 'Critical' : 'High'} issue: ${title}`,
    issueLate: (days: number) => `Closed ${days} calendar days after its first due date.`,
    decision: (title: string) => `Decision: ${title}`,
  },
} as const;

type Facts = {
  goal: { code: string; title: string; varianceDays: number | null; unexplainedDays: number | null; reasonDays: Record<string, number> } | null;
  problems: Array<{ id: string; title: string; status: string; mitigationPlan: string | null; contingencyPlan: string | null }>;
  breachedRisks: Array<{ id: string; title: string; mitigationPlan: string | null }>;
  criticalIssues: Array<{ id: string; title: string; severity: string; closedDelayDays: number | null }>;
  decisions: Array<{ id: string; title: string; decision: string }>;
};

/**
 * A draft of the project's lessons built from its records, without a model:
 * the days the active goal moved by each reason (and those without one), the
 * problems that happened and risks that came true with what was done, critical
 * and high issues that closed late and by how much, and the decisions taken. Each draft
 * names its source; drafts already saved as lessons are left out.
 */
export function draftLessons(facts: Facts, savedRefs: Set<string>, locale: 'ru' | 'en' = 'ru'): LessonDraft[] {
  const say = TEXT[locale];
  const drafts: LessonDraft[] = [];
  if (facts.goal) {
    const goal = `${facts.goal.code} ${facts.goal.title}`.trim();
    for (const [category, days] of Object.entries(facts.goal.reasonDays).sort((left, right) => right[1] - left[1])) {
      if (days <= 0) continue;
      const known = category !== 'NONE' && (LESSON_CATEGORIES as readonly string[]).includes(category);
      drafts.push({
        category: known ? (category as LessonCategory) : 'OTHER',
        title: known ? say.goalReason(goal, days) : say.goalNone(goal, days),
        text: known ? say.goalReasonText(days) : say.goalNoneText(days),
        recommendation: known ? '' : say.goalNoneAdvice,
        sourceKind: 'SHIFT',
        sourceRef: `shift:${category}`,
      });
    }
    if ((facts.goal.unexplainedDays ?? 0) > 0) {
      drafts.push({
        category: 'OTHER',
        title: say.before(goal, facts.goal.unexplainedDays!),
        text: say.beforeText,
        recommendation: '',
        sourceKind: 'SHIFT',
        sourceRef: 'shift:BEFORE',
      });
    }
  }
  for (const problem of facts.problems) {
    drafts.push({
      category: 'OTHER',
      title: say.problem(problem.title),
      text: [problem.mitigationPlan && say.done(problem.mitigationPlan), problem.contingencyPlan && say.fallback(problem.contingencyPlan)].filter(Boolean).join('\n'),
      recommendation: '',
      sourceKind: 'RISK',
      sourceRef: `raid:${problem.id}`,
    });
  }
  for (const risk of facts.breachedRisks) {
    drafts.push({
      category: 'TECHNICAL',
      title: say.risk(risk.title),
      text: risk.mitigationPlan ? say.riskPlan(risk.mitigationPlan) : say.riskNoPlan,
      recommendation: '',
      sourceKind: 'RISK',
      sourceRef: `raid:${risk.id}`,
    });
  }
  // Critical and high issues that closed late: the delay is what there is to learn from.
  for (const issue of facts.criticalIssues.filter((row) => (row.closedDelayDays ?? 0) > 0)) {
    drafts.push({
      category: 'OTHER',
      title: say.issue(issue.severity === 'CRITICAL', issue.title),
      text: issue.closedDelayDays ? say.issueLate(issue.closedDelayDays) : '',
      recommendation: '',
      sourceKind: 'ISSUE',
      sourceRef: `issue:${issue.id}`,
    });
  }
  for (const decision of facts.decisions) {
    drafts.push({
      category: 'GOOD_PRACTICE',
      title: say.decision(decision.title),
      text: decision.decision,
      recommendation: '',
      sourceKind: 'DECISION',
      sourceRef: `decision:${decision.id}`,
    });
  }
  return drafts.filter((draft) => !savedRefs.has(draft.sourceRef));
}
