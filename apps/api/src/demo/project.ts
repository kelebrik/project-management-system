import { createHash } from 'node:crypto';
import type { Prisma, Project } from '@prisma/client';

export const owners = ['Anna Orlova', 'Elena Volkova', 'Mikhail Sokolov', 'Olga Lebedeva', 'Maria Novikova', 'Dmitry Egorov'];
export const dateAt = (day: number, base: Date) => new Date(base.getTime() + day * 86_400_000);
export const demoId = (projectId: string, key: string) => `demo2-${createHash('sha256').update(`${projectId}:${key}`).digest('hex').slice(0, 32)}`;

// Additive: these IDs belong only to this fixture. Never replace the user's WBS.
export async function fillProject(tx: Prisma.TransactionClient, project: Project, base: Date) {
  const id = (key: string) => demoId(project.id, key);
  const existing = await tx.wbsItem.findMany({ where: { projectId: project.id }, select: { id: true, code: true } });
  const codes = new Set(existing.map((row) => row.code));
  const nextRoot = () => {
    let n = 1;
    while ([...codes].some((code) => code === String(n) || code.startsWith(`${n}.`))) n++;
    codes.add(String(n));
    return String(n);
  };
  const phases = ['Design', 'Development', 'Testing and pilot', 'Go-live'];
  const goals = ['Factory firmware released', 'First OTA ready', 'Pilot accepted by the customer', 'Target SLA achieved'];
  const goalLabels = ['MP', 'ota', 'pilot', 'sla'];
  const taskNames = ['Agree the requirements', 'Prepare the solution', 'Implement the integration', 'Run functional testing',
    'Run load testing', 'Close review findings', 'Prepare operations', 'Complete acceptance', 'Handover the result'];
  const statuses = ['IN_PROGRESS', 'IN_REVIEW', 'AT_RISK', 'BLOCKED', 'IN_PROGRESS', 'IN_REVIEW', 'AT_RISK', 'BLOCKED', 'CANCELLED'] as const;
  const currentDateShifts = [-4, 3, -2, 6, 1, -3, 4, -1, 5];
  const forecastDateShifts = [2, -3, 5, 9, -5, 4, -2, 7, -4];
  for (let phaseIndex = 0; phaseIndex < 4; phaseIndex++) {
    const root = existing.find((row) => row.id === id(`phase-${phaseIndex}`))?.code ?? nextRoot();
    const start = dateAt(-70 + phaseIndex * 60, base);
    const due = dateAt(58, start);
    const phaseStatus = phaseIndex === 0 ? 'DONE' : phaseIndex === 1 ? 'IN_PROGRESS' : 'NOT_STARTED';
    const phase = await tx.wbsItem.upsert({
      where: { id: id(`phase-${phaseIndex}`) },
      update: { title: phases[phaseIndex], owner: owners[phaseIndex], status: phaseStatus,
        startDate: start, dueDate: due, baselineStartDate: start, baselineDueDate: due,
        progress: phaseIndex === 0 ? 100 : phaseIndex === 1 ? 50 : 0,
        wbsLevel: 1, sortOrder: Number(root) * 100, description: `Demo phase: ${phases[phaseIndex]}` },
      create: { id: id(`phase-${phaseIndex}`), projectId: project.id, code: root,
        title: phases[phaseIndex], type: 'PHASE', owner: owners[phaseIndex],
        status: phaseStatus,
        startDate: start, dueDate: due, baselineStartDate: start, baselineDueDate: due,
        progress: phaseIndex === 0 ? 100 : phaseIndex === 1 ? 50 : 0,
        wbsLevel: 1, sortOrder: Number(root) * 100, description: `Demo phase: ${phases[phaseIndex]}` },
    });
    const childCode = (suffix: string) => `${phase.code}.${suffix}`;
    await tx.wbsItem.upsert({
      where: { id: id(`goal-${phaseIndex}`) },
      update: { parentId: phase.id, code: childCode('1'), title: goals[phaseIndex],
        status: phaseIndex === 0 ? 'DONE' : phaseIndex === 1 ? 'AT_RISK' : 'NOT_STARTED',
        owner: owners[phaseIndex], startDate: due, dueDate: due,
        baselineStartDate: due, baselineDueDate: due, forecastStartDate: dateAt(phaseIndex - 1, due),
        forecastDueDate: dateAt(phaseIndex + 2, due), jiraGoalLabels: [goalLabels[phaseIndex]],
        progress: phaseIndex === 0 ? 100 : 0, priority: 'High', wbsLevel: 2, sortOrder: phase.sortOrder + 1 },
      create: { id: id(`goal-${phaseIndex}`), projectId: project.id, parentId: phase.id,
        code: childCode('1'), title: goals[phaseIndex], type: 'GOAL',
        status: phaseIndex === 0 ? 'DONE' : phaseIndex === 1 ? 'AT_RISK' : 'NOT_STARTED',
        owner: owners[phaseIndex], startDate: due, dueDate: due,
        baselineStartDate: due, baselineDueDate: due, forecastStartDate: dateAt(phaseIndex - 1, due),
        forecastDueDate: dateAt(phaseIndex + 2, due),
        jiraGoalLabels: [goalLabels[phaseIndex]], progress: phaseIndex === 0 ? 100 : 0,
        priority: 'High', wbsLevel: 2, sortOrder: phase.sortOrder + 1 },
    });
    // Move the fixture package before creating milestone code .5 so older fixture
    // versions can be upgraded without violating the project/code unique key.
    const wp = await tx.wbsItem.upsert({
      where: { id: id(`package-${phaseIndex}`) },
      update: { parentId: phase.id, code: childCode('10'), title: `Work: ${phases[phaseIndex]}`,
        owner: owners[phaseIndex], startDate: start, dueDate: due, status: phase.status,
        wbsLevel: 2, sortOrder: phase.sortOrder + 10 },
      create: { id: id(`package-${phaseIndex}`), projectId: project.id, parentId: phase.id,
        code: childCode('10'), title: `Work: ${phases[phaseIndex]}`, type: 'WORK_PACKAGE', owner: owners[phaseIndex],
        startDate: start, dueDate: due, status: phase.status, wbsLevel: 2, sortOrder: phase.sortOrder + 10 },
    });
    for (let m = 0; m < 4; m++) {
      const when = dateAt(m * 7 + 4, start);
      const title = `${phases[phaseIndex]}: ${['solution agreed', 'result verified', 'readiness confirmed', 'phase accepted'][m]}`;
      const milestoneStatus = phaseIndex === 0 ? 'Done' : phaseIndex === 1 ? 'At Risk' : 'Planned';
      await tx.milestone.upsert({ where: { id: id(`register-milestone-${phaseIndex}-${m}`) },
        update: { code: childCode(String(m + 2)), title, dueDate: when, status: milestoneStatus,
          owner: owners[(phaseIndex + m) % owners.length], description: 'Demo: project phase checkpoint.' }, create: {
        id: id(`register-milestone-${phaseIndex}-${m}`), projectId: project.id,
        code: childCode(String(m + 2)), title, dueDate: when,
        status: milestoneStatus,
        owner: owners[(phaseIndex + m) % owners.length], description: 'Demo: project phase checkpoint.',
      } });
      const wbsMilestoneStatus = phaseIndex === 0 ? 'DONE' : phaseIndex === 1 ? 'AT_RISK' : 'NOT_STARTED';
      await tx.wbsItem.upsert({
        where: { id: id(`milestone-${phaseIndex}-${m}`) },
        update: { parentId: phase.id, code: childCode(String(m + 2)), title,
          owner: owners[(phaseIndex + m) % owners.length], startDate: when, dueDate: when,
          baselineStartDate: when, baselineDueDate: when, forecastStartDate: dateAt(m - 1, when),
          forecastDueDate: dateAt(m + 1, when), status: wbsMilestoneStatus,
          progress: phaseIndex === 0 ? 100 : 0, wbsLevel: 2, sortOrder: phase.sortOrder + m + 2 },
        create: { id: id(`milestone-${phaseIndex}-${m}`), projectId: project.id, parentId: phase.id,
          code: childCode(String(m + 2)), title, type: 'MILESTONE', owner: owners[(phaseIndex + m) % owners.length],
          startDate: when, dueDate: when, baselineStartDate: when, baselineDueDate: when,
          forecastStartDate: dateAt(m - 1, when), forecastDueDate: dateAt(m + 1, when),
          status: wbsMilestoneStatus,
          progress: phaseIndex === 0 ? 100 : 0, wbsLevel: 2, sortOrder: phase.sortOrder + m + 2 },
      });
    }
    for (let t = 0; t < taskNames.length; t++) {
      const status: Prisma.WbsItemUncheckedCreateInput['status'] =
        phaseIndex === 0 ? 'DONE' : phaseIndex === 1 ? statuses[t] ?? 'NOT_STARTED' : 'NOT_STARTED';
      const taskType: Prisma.WbsItemUncheckedCreateInput['type'] = t === 4 ? 'DELIVERABLE' : 'TASK';
      const baselineFrom = dateAt(t * 7, start), baselineTo = dateAt(t * 7 + 6, start);
      const currentFrom = dateAt(currentDateShifts[t], baselineFrom), currentTo = dateAt(currentDateShifts[t], baselineTo);
      const forecastFrom = dateAt(forecastDateShifts[t], baselineFrom), forecastTo = dateAt(forecastDateShifts[t], baselineTo);
      const taskData = {
        parentId: wp.id, code: `${wp.code}.${t + 1}`, title: `${taskNames[t]} — ${phases[phaseIndex]}`,
        type: taskType, status, owner: owners[(phaseIndex + t) % owners.length], priority: ['Low', 'Medium', 'High', 'Critical'][t % 4],
        startDate: currentFrom, dueDate: currentTo, baselineStartDate: baselineFrom, baselineDueDate: baselineTo,
        forecastStartDate: forecastFrom, forecastDueDate: forecastTo,
        progress: status === 'DONE' ? 100 : status === 'IN_PROGRESS' ? 55 : status === 'IN_REVIEW' ? 85 : 0,
        effortPercent: 100, plannedCost: 120000 * (t + 1), forecastCost: 130000 * (t + 1),
        wbsLevel: 3, sortOrder: phase.sortOrder + 20 + t,
        comment: `Demo: ${owners[(phaseIndex + t) % owners.length]} will prepare the result and the status by the checkpoint date.`,
      } satisfies Prisma.WbsItemUncheckedUpdateInput;
      await tx.wbsItem.upsert({
        where: { id: id(`task-${phaseIndex}-${t}`) }, update: taskData,
        create: { id: id(`task-${phaseIndex}-${t}`), projectId: project.id, ...taskData },
      });
      if (t > 0) await tx.wbsDependency.upsert({
        where: { projectId_predecessorId_successorId_type: { projectId: project.id,
          predecessorId: id(`task-${phaseIndex}-${t - 1}`), successorId: id(`task-${phaseIndex}-${t}`), type: 'FS' } },
        update: { lagDays: 0 }, create: { projectId: project.id, predecessorId: id(`task-${phaseIndex}-${t - 1}`), successorId: id(`task-${phaseIndex}-${t}`), type: 'FS', lagDays: 0 },
      });
    }
    if (phaseIndex > 0) {
      // Fixture v3 linked the fifth task between phases. Remove that owned
      // shortcut now that every phase has a longer critical chain.
      await tx.wbsDependency.deleteMany({ where: { projectId: project.id,
        predecessorId: id(`task-${phaseIndex - 1}-4`), successorId: id(`task-${phaseIndex}-0`), type: 'FS' } });
      await tx.wbsDependency.upsert({
        where: { projectId_predecessorId_successorId_type: { projectId: project.id,
          predecessorId: id(`task-${phaseIndex - 1}-${taskNames.length - 1}`), successorId: id(`task-${phaseIndex}-0`), type: 'FS' } },
        update: { lagDays: 0 }, create: { projectId: project.id,
          predecessorId: id(`task-${phaseIndex - 1}-${taskNames.length - 1}`), successorId: id(`task-${phaseIndex}-0`), type: 'FS', lagDays: 0 },
      });
    }
  }
  // Connect each goal to its implementation so the overview can trace delay causes.
  for (let phaseIndex = 0; phaseIndex < 4; phaseIndex++) {
    const predecessorId = id(`task-${phaseIndex}-3`), successorId = id(`goal-${phaseIndex}`);
    await tx.wbsDependency.upsert({
      where: { projectId_predecessorId_successorId_type: { projectId: project.id, predecessorId, successorId, type: 'FS' } },
      update: {}, create: { projectId: project.id, predecessorId, successorId, type: 'FS', lagDays: 0 },
    });
  }
  for (let r = 0; r < 6; r++) {
    const probability = [5, 4, 3, 2, 1, 4][r], impact = [5, 4, 3, 2, 2, 5][r];
    const risk = await tx.raidItem.upsert({ where: { id: id(`risk-${r}`) }, update: {}, create: {
      id: id(`risk-${r}`), projectId: project.id, type: r < 4 ? 'RISK' : r === 4 ? 'ASSUMPTION' : 'DEPENDENCY',
      title: ['Component delivery failure', 'Defects found in load testing', 'Insufficient test data', 'Expert unavailable', 'Pilot site availability', 'External API delay'][r],
      description: 'Demo scenario: possible impact on the project schedule and cost.',
      owner: owners[r], status: (['OPEN', 'IN_PROGRESS', 'MITIGATED', 'CLOSED', 'VALIDATED', 'BREACHED'] as const)[r],
      probability, impact, riskScore: probability * impact, residualRisk: Math.max(1, probability * impact - 8),
      dueDate: dateAt([-8, 5, 15, -12, 25, -2][r], base), decisionRequired: r < 2,
      mitigationPlan: 'Weekly monitoring; backup supplier; additional quality check.',
      contingencyPlan: 'Activate the fallback plan and agree to move the checkpoint.',
      escalationLevel: r < 2 ? 'Steering' : 'Project', scheduleImpactDays: r < 2 ? 10 : 3,
      budgetImpact: r < 2 ? 1500000 : 150000,
    } });
    await tx.raidItemStatusUpdate.upsert({ where: { id: id(`risk-update-${r}`) }, update: {}, create: {
      id: id(`risk-update-${r}`), raidItemId: risk.id, statusAt: dateAt(-2, base),
      text: 'The owner confirmed the response plan. The next review is at the project steering committee.',
    } });
  }
  for (let q = 0; q < 8; q++) {
    const issue = await tx.issue.upsert({ where: { id: id(`issue-${q}`) }, update: {}, create: {
      id: id(`issue-${q}`), projectId: project.id, phaseId: id(`phase-${q % 4}`),
      riskId: q < 2 ? id(`risk-${q}`) : null, source: 'INTERNAL',
      category: q < 4 ? 'Delivery problems' : 'Management decisions',
      title: ['Delivery date not confirmed', 'Errors under peak load', 'Agree the API format', 'Test bench unavailable', 'Approve the contingency budget', 'Assign an operations owner', 'Design approval completed', 'Access granted'][q],
      severity: (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const)[q % 4],
      status: ['Open', 'In Progress', 'Open', 'In Progress', 'Open', 'In Progress', 'Resolved', 'Closed'][q],
      readiness: q > 5 ? 'GREEN' : q % 2 ? 'AMBER' : 'RED', owner: owners[q % owners.length],
      impact: 'Affects readiness of the nearest goal: an agreed action plan and an owner are required.',
      decisionRequired: q < 6, dueDate: dateAt([-5, 3, 14, -2, 7, 21, -10, -15][q], base),
      initialDueDate: dateAt([-8, 0, 14, -5, 7, 21, -12, -15][q], base),
      closedDelayDays: q > 5 ? q - 5 : null,
    } });
    await tx.issueStatusUpdate.upsert({ where: { id: id(`issue-update-${q}`) }, update: {}, create: {
      id: id(`issue-update-${q}`), issueId: issue.id, statusAt: dateAt(-1, base),
      text: q > 5 ? 'The result was accepted, the issue was closed at the team meeting.' : 'The team reviewed the issue. The owner is preparing a decision by the stated due date.',
    } });
  }
  const requirements = await tx.projectBusinessRequirements.findUnique({ where: { projectId: project.id } });
  // Fill blank placeholders in place; preserve existing row IDs, populated values and column IDs.
  const columns = (requirements?.columns ?? [
    { id: 'id', title: 'ID' }, { id: 'requirement', title: 'Business requirement' },
    { id: 'priority', title: 'Priority' }, { id: 'status', title: 'Status' }, { id: 'comment', title: 'Comment' },
  ]) as Array<{ id: string; title: string }>;
  const rows = (requirements?.rows ?? []) as Array<{ id: string; cells: Record<string, string> }>;
  const additions = Array.from({ length: 6 }, (_, n) => ({ id: id(`requirement-${n}`), cells: Object.fromEntries(columns.map((col) => {
    const title = `${col.id} ${col.title}`.toLowerCase();
    const requirement = ['Single sign-on access', 'Service availability of 99.9%', 'Response time within 500 ms', 'Role and permission control', 'Report export for the committee', 'Change history retention'][n];
    const value = /приоритет|priority/.test(title) ? ['High', 'Medium', 'Low'][n % 3]
      : /статус|status/.test(title) ? ['Agreed', 'In progress', 'In review'][n % 3]
      : /комментар|comment/.test(title) ? `Acceptance criteria agreed by ${owners[n]}. Verified in the pilot.`
      : /требован|requirement/.test(title) ? requirement
      : /(^|\s)id($|\s)|идентификатор/.test(title) ? `BR-${n + 1}`
      : `Demo: ${col.title} — ${requirement}`;
    return [col.id, value];
  })) }));
  const filled = rows.map((row, index) => Object.values(row.cells).some((cell) => String(cell ?? '').trim())
    ? row : { ...row, cells: { ...row.cells, ...additions[index % additions.length].cells } });
  const known = new Set(filled.map((row) => row.id));
  const combined = [...filled, ...additions.filter((row) => !known.has(row.id))];
  await tx.projectBusinessRequirements.upsert({ where: { projectId: project.id }, update: { rows: combined },
    create: { projectId: project.id, columns, rows: combined } });
  for (let a = 0; a < 4; a++) {
    await tx.projectArtifact.upsert({ where: { id: id(`artifact-${a}`) }, update: {}, create: {
      id: id(`artifact-${a}`), projectId: project.id, title: ['Project charter', 'Architecture board minutes', 'Acceptance test plan', 'Operations handover runbook'][a],
      type: ['Document', 'Minutes', 'Plan', 'Runbook'][a], owner: owners[a], status: ['Approved', 'In Review', 'Draft', 'Draft'][a],
      description: 'Demo document: goals, acceptance criteria and area of responsibility agreed by the team.', sortOrder: a,
    } });
    await tx.task.upsert({ where: { id: id(`action-${a}`) }, update: {}, create: {
      id: id(`action-${a}`), projectId: project.id, title: ['Prepare a decision on the supply risk', 'Approve the pilot criteria', 'Agree the launch window', 'Publish the weekly status report'][a],
      owner: owners[a], status: ['Open', 'In Progress', 'Done', 'In Progress'][a], priority: ['High', 'Medium', 'Low', 'Medium'][a], dueDate: dateAt(a * 5 - 2, base),
    } });
  }
}
