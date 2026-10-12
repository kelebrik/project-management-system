import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { calculateWbsCriticalPath } from "../../apps/api/src/services/wbs-critical-path/calculate.js";
import { calculateWbsScheduleUpdates } from "../../apps/api/src/services/wbs-schedule/calculate.js";
import { calculateWbsCriticalPath as legacyCriticalPath } from "./legacy-engine/wbs-critical-path/calculate.js";
import { calculateWbsScheduleUpdates as legacyScheduleUpdates } from "./legacy-engine/wbs-schedule/calculate.js";
import { random } from "./random-plans.js";

// Compares the shared engine with the old one on every project of a database
// (DATABASE_URL), whole and after edits of random rows. Run by hand on seeded
// or copied databases: npx tsx tests/oracle/seed-compare.ts

async function main() {
  const prisma = new PrismaClient();
  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  for (const project of projects) {
    const [items, dependencies, calendarOverrides] = await Promise.all([
      prisma.wbsItem.findMany({ where: { projectId: project.id }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
      prisma.wbsDependency.findMany({ where: { projectId: project.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.projectCalendarOverride.findMany({ where: { projectId: project.id } }),
    ]);
    if (items.length === 0) continue;
    const timings = { legacy: 0, shared: 0 };
    const compare = (options: Parameters<typeof calculateWbsScheduleUpdates>[3], label: string) => {
      let started = performance.now();
      const expected = legacyScheduleUpdates(items, dependencies, calendarOverrides, options);
      timings.legacy += performance.now() - started;
      started = performance.now();
      const actual = calculateWbsScheduleUpdates(items, dependencies, calendarOverrides, options);
      timings.shared += performance.now() - started;
      assert.deepEqual(actual, expected, `${project.name}: ${label}`);
    };
    compare({}, "whole");
    const next = random(items.length);
    for (let edit = 0; edit < 10; edit += 1) {
      const item = items[Math.floor(next() * items.length)]!;
      compare({ changedItemId: item.id, changedFields: [["workDays", "startDate", "dueDate", "predecessors"][edit % 4]!] }, `edit ${item.code}`);
    }
    const today = new Date();
    let started = performance.now();
    const expectedPath = legacyCriticalPath(items, dependencies, calendarOverrides);
    const legacyPath = performance.now() - started;
    started = performance.now();
    assert.deepEqual(calculateWbsCriticalPath(items, dependencies, calendarOverrides, today), expectedPath, `${project.name}: critical path`);
    const sharedPath = performance.now() - started;
    console.log(
      `${project.name}: ${items.length} rows, ${dependencies.length} links — same; schedule ${Math.round(timings.legacy)} → ${Math.round(timings.shared)} ms for 11 runs, critical path ${Math.round(legacyPath)} → ${Math.round(sharedPath)} ms`,
    );
  }
  await prisma.$disconnect();
}

void main();
