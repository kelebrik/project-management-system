import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every file of the API that writes Structure rows or links, and why that is
 * safe. A write must run under lockProjectStructure in a structureTransaction
 * (runStructureWrite is one), so the project's Structure version moves and a
 * browser applying changes never misses one. A new writer fails this test
 * until it does the same and is listed here.
 */
const STRUCTURE_WRITERS: Record<string, string> = {
  'routes/wbs/items.routes.ts': 'runStructureWrite / runStructureWriteFor',
  'routes/wbs/dependencies.routes.ts': 'runStructureWrite / runStructureWriteFor',
  'routes/wbs/item-order.routes.ts': 'runStructureWrite',
  'routes/wbs/append.routes.ts': 'runStructureWrite',
  'routes/wbs/snapshot.routes.ts': 'runStructureWrite',
  'routes/wbs-import.routes.ts': 'structureTransaction, applyWbsImport locks',
  'routes/wbs-draft.routes.ts': 'structureTransaction + lockProjectStructure',
  'routes/automation-rules.routes.ts': 'structureTransaction + lockProjectStructure',
  'routes/jira-semantic-aggregates.routes.ts': 'structureTransaction + lockProjectStructure',
  'routes/projects/crud.routes.ts': 'structureTransaction + lockProjectStructure (new project, target date)',
  'routes/projects/default-structure.ts': 'caller\'s structureTransaction, locks the project',
  'routes/projects/cascade.ts': 'deletes the whole project: no Structure is left to version',
  'services/wbs-bulk-write.ts': 'helper, called only inside Structure writes',
  'services/wbs-baseline.ts': 'caller\'s Structure write, or structureTransaction + lock',
  'services/wbs-current-structure-copy.ts': 'called in project creation, which locks the new project',
  'services/wbs-tombstones.ts': 'structureTransaction + lockProjectStructure',
  'services/open-issue-work-package.ts': 'locks the project in the issue\'s structureTransaction',
  'services/jira-system-goal-labels.ts': 'goal labels in their own structureTransaction + lock',
  'demo/project.ts': 'completeDemoProject: structureTransaction + lock',
};

const WRITE = /\.(wbsItem|wbsDependency)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|(INSERT INTO|UPDATE|DELETE FROM) "(WbsItem|WbsDependency)"/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [full] : [];
  });
}

test('every file that writes Structure rows or links is a known, versioned writer', () => {
  const writers = sourceFiles(sourceRoot)
    .filter((file) => WRITE.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(sourceRoot, file).split(path.sep).join('/'))
    .sort();
  const unknown = writers.filter((file) => !(file in STRUCTURE_WRITERS));
  assert.deepEqual(unknown, [], `Structure written outside a versioned Structure write: ${unknown.join(', ')}`);
  const stale = Object.keys(STRUCTURE_WRITERS).filter((file) => !writers.includes(file));
  assert.deepEqual(stale, [], `Listed as Structure writers but write nothing: ${stale.join(', ')}`);
});
