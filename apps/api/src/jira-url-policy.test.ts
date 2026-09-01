import assert from 'node:assert/strict';
import test from 'node:test';

import { jiraDisplayUrl, jiraUrlMatchesConfiguredBase } from './jira-url-policy.js';

test('Jira display URLs remove only the corporate dev hostname alias', () => {
  assert.equal(
    jiraDisplayUrl('https://tasks.dev.sberdevices.ru/browse/CVTE-1801').toString(),
    'https://tasks.sberdevices.ru/browse/CVTE-1801',
  );
  assert.equal(
    jiraDisplayUrl('https://jira.example.test/browse/CVTE-1801').toString(),
    'https://jira.example.test/browse/CVTE-1801',
  );
});

test('Jira URL validation treats the corporate API and display hosts as aliases', () => {
  assert.equal(
    jiraUrlMatchesConfiguredBase(
      'https://tasks.sberdevices.ru/browse/CVTE-1801',
      'https://tasks.dev.sberdevices.ru',
    ),
    true,
  );
  assert.equal(
    jiraUrlMatchesConfiguredBase(
      'https://tasks.dev.sberdevices.ru/browse/CVTE-1801',
      'https://tasks.sberdevices.ru',
    ),
    true,
  );
  assert.equal(
    jiraUrlMatchesConfiguredBase(
      'https://tasks.sberdevices.ru.evil.test/browse/CVTE-1801',
      'https://tasks.sberdevices.ru',
    ),
    false,
  );
});
