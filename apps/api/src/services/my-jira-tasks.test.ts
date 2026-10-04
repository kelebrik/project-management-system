import assert from 'node:assert/strict';
import test from 'node:test';
import type { JiraIssue } from '../jira-model.js';
import { MY_JIRA_TASKS_LIMIT, cachedSearch, groupTasksByProject, labelledProjects, myJiraTasksJql } from './my-jira-tasks.js';

const issue = (key: string, labels: string[]) => ({ key, url: `https://jira/browse/${key}`, summary: key, status: 'In Progress', statusCategory: 'indeterminate', priority: 'Major', issueType: 'Task', labels, updatedAt: new Date('2026-10-04T10:00:00Z') }) as unknown as JiraIssue;

test('the search asks for the labels of all projects, the login and open issues only', () => {
  assert.equal(myJiraTasksJql(['tv', 'audio', 'tv'], 'ivanov.i'), 'labels IN ("audio", "tv") AND assignee = "ivanov.i" AND statusCategory != Done ORDER BY updated DESC');
  assert.throws(() => myJiraTasksJql(['tv'], 'x" OR assignee is not EMPTY OR "'), /логин/);
  assert.throws(() => myJiraTasksJql(['tv'], ''), /логин/);
});

test('only label scopes that parse are used, and issues go under each project whose label they carry', () => {
  const projects = labelledProjects([
    { id: 'p1', code: 'TV', name: 'ТВ', scopeType: 'LABEL', scopeValue: 'tv, tv-hw' },
    { id: 'p2', code: 'AU', name: 'Аудио', scopeType: 'LABEL', scopeValue: 'audio' },
    { id: 'p3', code: 'EP', name: 'Эпик', scopeType: 'EPIC', scopeValue: 'CVTE-1' },
    { id: 'p4', code: 'BAD', name: 'Плохой', scopeType: 'LABEL', scopeValue: 'a b' },
  ]);
  assert.deepEqual(projects.map((project) => [project.code, project.labels]), [['TV', ['tv', 'tv-hw']], ['AU', ['audio']]]);
  const groups = groupTasksByProject(projects, [issue('T-1', ['tv-hw']), issue('T-2', ['audio', 'tv']), issue('T-3', ['other'])]);
  assert.deepEqual(groups.map((group) => [group.project.code, group.tasks.map((task) => task.key)]), [['TV', ['T-1', 'T-2']], ['AU', ['T-2']]]);
});

test('an answer is kept for five minutes, cut to the limit, and a failure is not kept', async () => {
  let calls = 0;
  const many = Array.from({ length: MY_JIRA_TASKS_LIMIT }, (_, index) => issue(`K-${index}`, ['tv']));
  const search = async () => {
    calls += 1;
    return { issues: many, total: MY_JIRA_TASKS_LIMIT + 5 };
  };
  const first = await cachedSearch('test|login|q', 0, search);
  assert.equal(first.cached, false);
  assert.equal(first.truncated, true);
  assert.equal((await cachedSearch('test|login|q', 60_000, search)).cached, true);
  await cachedSearch('test|login|q', 5 * 60_000, search);
  assert.equal(calls, 2);
  await assert.rejects(cachedSearch('test|login|fail', 0, async () => Promise.reject(new Error('down'))));
  assert.equal((await cachedSearch('test|login|fail', 1, search)).cached, false);
});
