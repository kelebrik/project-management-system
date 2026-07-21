import assert from "node:assert/strict";
import test from "node:test";

import {
  filterProjectStructureCopyOptions,
  togglePhaseSelection,
  toggleWholeProjectSelection,
  type ProjectStructureCopyOption,
} from "./projectStructureCopy";

const options: ProjectStructureCopyOption[] = [
  {
    id: "project-a",
    code: "A",
    name: "Альфа",
    businessUnit: { id: "bu-a", name: "БЮ A" },
    phases: [
      { id: "phase-a1", code: "1", title: "Анализ" },
      { id: "phase-a2", code: "2", title: "Запуск" },
    ],
  },
  {
    id: "project-b",
    code: "B",
    name: "Бета",
    businessUnit: { id: "bu-b", name: "БЮ B" },
    phases: [{ id: "phase-b1", code: "1", title: "Поставка" }],
  },
];

test("current structure selection supports multiple phases and projects", () => {
  let selection = togglePhaseSelection([], "project-a", "phase-a1", true);
  selection = togglePhaseSelection(selection, "project-a", "phase-a2", true);
  selection = toggleWholeProjectSelection(selection, "project-b", true);
  assert.deepEqual(selection, [
    { projectId: "project-a", phaseIds: ["phase-a1", "phase-a2"] },
    { projectId: "project-b", phaseIds: null },
  ]);
});

test("whole project selection replaces phases and blocks redundant phase toggles", () => {
  const whole = toggleWholeProjectSelection(
    [{ projectId: "project-a", phaseIds: ["phase-a1"] }],
    "project-a",
    true,
  );
  assert.deepEqual(whole, [{ projectId: "project-a", phaseIds: null }]);
  assert.equal(togglePhaseSelection(whole, "project-a", "phase-a2", true), whole);
});

test("structure copy search matches project and phase names", () => {
  assert.deepEqual(
    filterProjectStructureCopyOptions(options, "альфа").map((item) => item.id),
    ["project-a"],
  );
  const phaseResult = filterProjectStructureCopyOptions(options, "поставка");
  assert.deepEqual(phaseResult.map((item) => item.id), ["project-b"]);
  assert.deepEqual(phaseResult[0]?.phases.map((phase) => phase.id), ["phase-b1"]);
});
