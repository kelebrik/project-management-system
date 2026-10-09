import assert from 'node:assert/strict';
import test from 'node:test';
import { JIRA_SYSTEM_SEMANTIC_AGGREGATES } from './jira-semantic-system-aggregates.js';
import {
  JIRA_SYSTEM_AGGREGATE_STANDARD_HISTORY,
  jiraSystemAggregateFingerprint,
  jiraSystemAggregateStandard,
} from './jira-system-aggregate-standards.js';

test('every system aggregate records its current code definition as the latest standard', () => {
  assert.deepEqual(
    Object.keys(JIRA_SYSTEM_AGGREGATE_STANDARD_HISTORY).sort(),
    JIRA_SYSTEM_SEMANTIC_AGGREGATES.map((aggregate) => aggregate.key).sort(),
  );
  for (const aggregate of JIRA_SYSTEM_SEMANTIC_AGGREGATES) {
    const history = JIRA_SYSTEM_AGGREGATE_STANDARD_HISTORY[aggregate.key]!;
    assert.equal(new Set(history).size, history.length, `${aggregate.key}: a fingerprint repeats`);
    assert.equal(
      history.at(-1),
      jiraSystemAggregateFingerprint(aggregate.definition),
      `${aggregate.key} changed: append its new fingerprint to JIRA_SYSTEM_AGGREGATE_STANDARD_HISTORY so the standard version moves forward`,
    );
  }
});

test('a project copy is current, customized, behind or unpublished against the standard', () => {
  const code = JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.key === 'issues')!.definition;
  const version = JIRA_SYSTEM_AGGREGATE_STANDARD_HISTORY.issues!.length;
  // Upgrades append fields at the end; the order does not make a copy different.
  const reordered = { ...code, outputFields: [...code.outputFields].reverse() };
  assert.deepEqual(jiraSystemAggregateStandard('issues', reordered), { version, status: 'current' });
  assert.deepEqual(jiraSystemAggregateStandard('issues', { ...code, description: 'Своё описание' }), { version, status: 'customized' });
  const missing = { ...code, outputFields: code.outputFields.slice(1) };
  assert.deepEqual(jiraSystemAggregateStandard('issues', missing), { version, status: 'behind' });
  assert.deepEqual(
    jiraSystemAggregateStandard('issues', { ...missing, description: 'Своё описание' }),
    { version, status: 'behind' },
    'lacking fields outranks own changes',
  );
  assert.deepEqual(jiraSystemAggregateStandard('issues', null), { version, status: 'unpublished' });
  assert.equal(jiraSystemAggregateStandard('not-a-system-aggregate', code), null);
});
