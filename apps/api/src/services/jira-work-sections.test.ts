import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultJiraWorkSectionTitle,
  jiraCriticalPriorityProjectKeys,
  jiraIssueKeyBatchJql,
  jiraIssueKeyBatches,
  jiraIssueKeyBatchDifference,
  jiraIssueKeyBatchLossIsUnsafe,
  jiraParentKeyBatchJql,
  jiraProjectKeyFromIssueKey,
  jiraWorkSectionScopedJqls,
  jiraWorkSectionFilterToJql,
  resolveJiraWorkSectionJql,
} from './jira-work-sections.js';

test('jiraCriticalPriorityProjectKeys combines configured and observed projects', () => {
  assert.deepEqual(
    jiraCriticalPriorityProjectKeys('TV', ['SPS-42', 'STAROS-7', 'SPS-99']),
    ['SPS', 'STAROS', 'TV'],
  );
  assert.deepEqual(jiraCriticalPriorityProjectKeys('TV', []), ['TV']);
  assert.deepEqual(jiraCriticalPriorityProjectKeys('', []), []);
  assert.equal(jiraProjectKeyFromIssueKey('sps-42'), 'SPS');
  assert.equal(jiraProjectKeyFromIssueKey('not-an-issue'), null);
});

test('jiraIssueKeyBatches validates, normalizes and batches issue keys', () => {
  assert.deepEqual(jiraIssueKeyBatches(['sps-2', 'CVTE-1', 'SPS-2'], 2), [
    ['CVTE-1', 'SPS-2'],
  ]);
  assert.equal(
    jiraIssueKeyBatchJql(['sps-2', 'CVTE-1']),
    'issuekey IN ("CVTE-1", "SPS-2") ORDER BY key ASC',
  );
  assert.equal(
    jiraParentKeyBatchJql(['sps-2', 'CVTE-1']),
    'parent IN ("CVTE-1", "SPS-2") ORDER BY key ASC',
  );
  assert.throws(() => jiraIssueKeyBatches(['not-an-issue'], 50), /некорректный ключ/);
});

test('jiraWorkSectionScopedJqls intersects sections with discovered epic issues and subtasks', () => {
  assert.deepEqual(
    jiraWorkSectionScopedJqls(
      'statusCategory != Done ORDER BY updated DESC',
      ['CVTE-1778', 'CVTE-1800', 'CVTE-1801'],
      2,
    ),
    [
      '(statusCategory != Done) AND issuekey IN ("CVTE-1778", "CVTE-1800") ORDER BY updated DESC',
      '(statusCategory != Done) AND issuekey IN ("CVTE-1801") ORDER BY updated DESC',
    ],
  );
});

test('jiraIssueKeyBatchDifference rejects unexpected keys and excessive loss', () => {
  assert.deepEqual(
    jiraIssueKeyBatchDifference(['CVTE-1', 'SPS-2'], ['cvte-1', 'STAROS-3']),
    { missingKeys: ['SPS-2'], unexpectedKeys: ['STAROS-3'] },
  );
  assert.equal(jiraIssueKeyBatchLossIsUnsafe(50, 10), false);
  assert.equal(jiraIssueKeyBatchLossIsUnsafe(50, 11), true);
  assert.equal(jiraIssueKeyBatchLossIsUnsafe(5, 2), true);
});

test('defaultJiraWorkSectionTitle uses one-based section numbering', () => {
  assert.equal(defaultJiraWorkSectionTitle(0), 'Раздел 1');
  assert.equal(defaultJiraWorkSectionTitle(2), 'Раздел 3');
});

test('jiraWorkSectionFilterToJql converts Jira filter links and ids', () => {
  assert.equal(
    jiraWorkSectionFilterToJql('https://jira.example/issues/?filter=12345'),
    'filter = 12345',
  );
  assert.equal(
    jiraWorkSectionFilterToJql('https://tasks.sberdevices.ru/issues/?filter=39227'),
    'filter = 39227',
  );
  assert.equal(jiraWorkSectionFilterToJql('/issues/?filter=987'), 'filter = 987');
  assert.equal(jiraWorkSectionFilterToJql('54321'), 'filter = 54321');
});

test('jiraWorkSectionFilterToJql keeps direct search expressions', () => {
  assert.equal(
    jiraWorkSectionFilterToJql('project = PMS AND statusCategory != Done'),
    'project = PMS AND statusCategory != Done',
  );
  assert.equal(
    jiraWorkSectionFilterToJql('/issues/?jql=project%20%3D%20PMS'),
    'project = PMS',
  );
});

test('resolveJiraWorkSectionJql gives direct JQL priority over a filter link', () => {
  assert.equal(
    resolveJiraWorkSectionJql(
      'project = DIRECT',
      'https://tasks.sberdevices.ru/issues/?filter=39227',
    ),
    'project = DIRECT',
  );
});

test('resolveJiraWorkSectionJql uses a filter link when JQL is empty', () => {
  assert.equal(
    resolveJiraWorkSectionJql(
      '',
      'https://tasks.sberdevices.ru/issues/?filter=39227',
    ),
    'filter = 39227',
  );
});

test('resolveJiraWorkSectionJql keeps legacy filter links stored in JQL', () => {
  assert.equal(
    resolveJiraWorkSectionJql(
      'https://tasks.sberdevices.ru/issues/?filter=39227',
      '',
    ),
    'filter = 39227',
  );
});
