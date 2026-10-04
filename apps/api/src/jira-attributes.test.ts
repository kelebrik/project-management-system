import assert from 'node:assert/strict';
import test from 'node:test';
import { jiraAttributeFieldIds, jiraCustomValue, jiraIssueAttributes, jiraKnownFieldIds, mergeJiraFieldCatalog, sameJiraAttributes, storedJiraAttributes } from './jira-attributes.js';

test('the extra fields are read from one search answer, whatever the Jira language', () => {
  const attributes = jiraIssueAttributes(
    {
      status: { name: 'В работе', statusCategory: { key: 'indeterminate', name: 'В процессе' } },
      parent: { key: 'TV-1', fields: { issuetype: { name: 'Story' } } },
      customfield_10008: 'TV-100',
      customfield_10002: '3,5',
      components: [{ name: 'Плата' }, { name: 'ПО' }, { name: 'Плата' }],
      fixVersions: [{ name: '1.2' }],
      duedate: '2026-10-20',
      assignee: { name: 'ivanov.i', displayName: 'Иванов Иван', emailAddress: 'ivanov@example.com' },
      customfield_20000: { value: 'Высокий', child: { value: 'Срочно' } },
      customfield_20001: [{ displayName: 'Петров' }, { displayName: 'Сидоров' }],
      customfield_20002: null,
    },
    { epicLinkFieldId: 'customfield_10008', storyPointsFieldId: 'customfield_10002', extraFieldIds: ['customfield_20000', 'customfield_20001', 'customfield_20002', 'bad id'] },
  );
  assert.deepEqual(attributes, {
    statusCategoryKey: 'indeterminate',
    parentKey: 'TV-1',
    epicKey: 'TV-100',
    components: ['ПО', 'Плата'],
    fixVersions: ['1.2'],
    storyPoints: 3.5,
    dueDate: '2026-10-20',
    assigneeLogin: 'ivanov.i',
    custom: { customfield_20000: 'Высокий / Срочно', customfield_20001: ['Петров', 'Сидоров'] },
  });
  assert.equal(JSON.stringify(attributes).includes('example.com'), false, 'no e-mail is kept');
});

test('an epic parent counts as the epic, and missing fields stay empty', () => {
  const attributes = jiraIssueAttributes({ parent: { key: 'TV-9', fields: { issuetype: { name: 'Epic' } } }, assignee: { accountId: '5b10' } }, {});
  assert.deepEqual([attributes.epicKey, attributes.parentKey, attributes.storyPoints, attributes.statusCategoryKey, attributes.assigneeLogin], ['TV-9', 'TV-9', null, null, '5b10']);
});

test('known fields come from the environment or by name, and only valid ids are asked for', () => {
  assert.deepEqual(jiraKnownFieldIds({ customfield_1: 'Epic Link', customfield_2: 'Story Points' }, {}), { epicLinkFieldId: 'customfield_1', storyPointsFieldId: 'customfield_2' });
  assert.deepEqual(jiraKnownFieldIds({ customfield_1: 'Epic Link' }, { JIRA_STORY_POINTS_FIELD_ID: 'customfield_9' }), { epicLinkFieldId: 'customfield_1', storyPointsFieldId: 'customfield_9' });
  assert.deepEqual(jiraAttributeFieldIds({ epicLinkFieldId: 'customfield_1', extraFieldIds: ['customfield_5', 'x"y', 'parent'] }), ['parent', 'components', 'fixVersions', 'duedate', 'customfield_1', 'customfield_5']);
  assert.equal(jiraCustomValue({}), null);
  assert.equal(jiraCustomValue(12), 12);
});

test('e-mail addresses are never kept, sizes are capped, and comparison ignores key order', () => {
  const attributes = jiraIssueAttributes({ assignee: { name: 'ivanov@example.com', accountId: 'acc-1' }, customfield_1: 'mail@example.com', customfield_2: [{ displayName: 'a@b.ru' }, { displayName: 'Петров' }] }, { extraFieldIds: ['customfield_1', 'customfield_2'] });
  assert.equal(attributes.assigneeLogin, 'acc-1');
  assert.deepEqual(attributes.custom, { customfield_2: ['Петров'] });
  const big = { ...attributes, custom: { customfield_3: 'x'.repeat(9000) } };
  assert.deepEqual(storedJiraAttributes(big)?.custom, {});
  const longLists = { ...attributes, components: Array.from({ length: 50 }, (_, index) => `${index}`.padEnd(200, 'к')), fixVersions: Array.from({ length: 50 }, (_, index) => `${index}`.padEnd(200, 'v')) };
  assert.ok(Buffer.byteLength(JSON.stringify(storedJiraAttributes(longLists)), 'utf8') <= 8 * 1024);
  assert.equal(jiraIssueAttributes({ assignee: { accountId: 'user@example.com' } }, {}).assigneeLogin, null);
  assert.equal(storedJiraAttributes(undefined), null);
  assert.equal(sameJiraAttributes({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true);
  assert.equal(sameJiraAttributes({ a: 1 }, null), false);
});

test('the field catalog grows with what searches return and stays capped', () => {
  const first = mergeJiraFieldCatalog(null, { customfield_1: 'Epic Link', 'bad id': 'x' });
  assert.deepEqual(first, { catalog: { customfield_1: 'Epic Link' }, changed: true });
  assert.equal(mergeJiraFieldCatalog(first.catalog, { customfield_1: 'Epic Link' }).changed, false);
  const full = Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`customfield_${index}`, `F${index}`]));
  assert.equal(Object.keys(mergeJiraFieldCatalog(full, { customfield_x: 'New' }).catalog).length, 1000);
});
