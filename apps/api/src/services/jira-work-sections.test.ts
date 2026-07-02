import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultJiraWorkSectionTitle,
  jiraWorkSectionFilterToJql,
} from './jira-work-sections.js';

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
