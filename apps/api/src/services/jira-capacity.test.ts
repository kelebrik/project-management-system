import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildJiraCapacityReport,
  jiraCapacityLevel,
  jiraCapacityScopeJql,
  metricDistribution,
} from './jira-capacity.js';
import {
  canonicalizeJiraVersionV1,
  hashJiraVersionV1,
  sanitizeJiraVersionPayload,
} from './jira-version-canonical.js';

test('capacity scope JQL is controlled and escapes literals', () => {
  assert.equal(jiraCapacityScopeJql('LABEL', 'cvte968'), 'labels = "cvte968"');
  assert.equal(
    jiraCapacityScopeJql('EPIC', 'CVTE-123'),
    '(key = "CVTE-123" OR "Epic Link" = "CVTE-123")',
  );
  assert.equal(jiraCapacityScopeJql('LABEL', 'a"b'), 'labels = "a\\"b"');
});

test('metric distribution uses nearest-rank percentiles', () => {
  assert.deepEqual(metricDistribution([1, 2, 3, 4, 100]), {
    min: 1,
    average: 22,
    p50: 3,
    p95: 100,
    max: 100,
  });
});

test('capacity levels use the approved budget thresholds', () => {
  assert.equal(jiraCapacityLevel(69.9), 'NORMAL');
  assert.equal(jiraCapacityLevel(70), 'WARNING');
  assert.equal(jiraCapacityLevel(85), 'HIGH');
  assert.equal(jiraCapacityLevel(95), 'CRITICAL');
  assert.equal(jiraCapacityLevel(100), 'CRITICAL');
  assert.equal(jiraCapacityLevel(100.1), 'EXCEEDED');
});

test('stage A1 canonical hash vector has a fixed external digest', async () => {
  const input = JSON.parse(await readFile(
    new URL('../../../../docs/fixtures/jira-version-hash-v1.input.json', import.meta.url),
    'utf8',
  ));
  const canonical = await readFile(
    new URL('../../../../docs/fixtures/jira-version-hash-v1.canonical.json', import.meta.url),
    'utf8',
  );
  const expected = await readFile(
    new URL('../../../../docs/fixtures/jira-version-hash-v1.sha256', import.meta.url),
    'utf8',
  );
  const result = hashJiraVersionV1(input);

  assert.equal(result.warnings.length, 0);
  assert.equal(result.canonicalJson, canonical.replace(/\n$/, ''));
  assert.equal(result.contentHash, expected.trim());
});

test('stage A1 canonicalizer preserves invalid timestamps with warnings', () => {
  const result = canonicalizeJiraVersionV1({
    issue: {
      fields: {
        created: '2026-08-21T12:00:00',
        updated: 'not-a-timestamp',
      },
    },
    changelog: [],
    comments: [],
    worklogs: [],
    remoteLinks: [],
  });

  assert.equal(result.warnings.length, 2);
  assert.equal(JSON.parse(result.canonicalJson).issue.fields.created, '2026-08-21T12:00:00');
  assert.equal(JSON.parse(result.canonicalJson).issue.fields.updated, 'not-a-timestamp');
});

test('stage A1 domain arrays use Unicode scalar ordering', () => {
  const result = canonicalizeJiraVersionV1({
    issue: { fields: { labels: ['\u{10000}', '\ue000'] } },
    changelog: [],
    comments: [],
    worklogs: [],
    remoteLinks: [],
  });

  assert.deepEqual(JSON.parse(result.canonicalJson).issue.fields.labels, ['\ue000', '\u{10000}']);
});

test('stage A1 canonicalizer orders Jira Server sprint strings and missing tuple ids', () => {
  const result = canonicalizeJiraVersionV1({
    issue: {
      fields: {
        customfield_10004: [
          'Sprint[id=10,state=ACTIVE,name=Later]',
          'Sprint[id=9,state=CLOSED,name=Earlier]',
        ],
      },
    },
    changelog: [],
    comments: [{ body: 'z' }, { body: 'a' }],
    worklogs: [],
    remoteLinks: [{ object: { url: 'https://z.example' } }, { object: { url: 'https://a.example' } }],
  });
  const parsed = JSON.parse(result.canonicalJson);

  assert.match(parsed.issue.fields.customfield_10004[0], /id=9/);
  assert.deepEqual(parsed.comments.map((comment: { body: string }) => comment.body), ['a', 'z']);
  assert.deepEqual(
    parsed.remoteLinks.map((link: { object: { url: string } }) => link.object.url),
    ['https://a.example', 'https://z.example'],
  );
});

test('stage A1 canonicalizer rejects payloads that bypass attachment sanitization', () => {
  assert.throws(
    () => canonicalizeJiraVersionV1({
      issue: { fields: { attachment: [{ id: 'must-not-hash' }] } },
      changelog: [],
      comments: [],
      worklogs: [],
      remoteLinks: [],
    }),
    /must be sanitized/,
  );
});

test('stage A1 sanitizer removes attachment and transient transport structures', () => {
  const sanitized = sanitizeJiraVersionPayload({
    issue: {
      self: 'https://jira.example/rest/api/2/issue/1',
      fields: {
        attachment: [{ id: 'a-1', filename: 'secret.png' }],
        description: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'keep me' }] },
            { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'a-1' } }] },
          ],
        },
        iconUrl: 'https://jira.example/icon.png',
      },
    },
    changelog: [{ field: 'Attachment', from: null, to: 'a-1' }],
    comments: [{ body: 'attachment filename remains as business text' }],
    worklogs: [],
    remoteLinks: [],
  });
  const serialized = JSON.stringify(sanitized.payload);

  assert.equal(sanitized.attachmentReferencesStripped, 3);
  assert.equal(serialized.includes('secret.png'), false);
  assert.equal(serialized.includes('mediaSingle'), false);
  assert.equal(serialized.includes('icon.png'), false);
  assert.equal(serialized.includes('keep me'), true);
  assert.equal(serialized.includes('attachment filename remains'), true);
  assert.doesNotThrow(() => hashJiraVersionV1(sanitized.payload));
});

test('stage A1 canonicalizer keeps schema-v1 sprint normalization independent of configuration', () => {
  const result = canonicalizeJiraVersionV1({
    issue: {
      fields: {
        sprints: [
          'Sprint[id=10,state=ACTIVE,name=Later]',
          'Sprint[id=9,state=CLOSED,name=Earlier]',
        ],
        customfield_12345: ['business order stays', 'unchanged'],
      },
    },
    changelog: [],
    comments: [],
    worklogs: [],
    remoteLinks: [],
  });
  const fields = JSON.parse(result.canonicalJson).issue.fields;

  assert.match(fields.sprints[0], /id=9/);
  assert.deepEqual(fields.customfield_12345, ['business order stays', 'unchanged']);
});

test('stage A1 timestamp grammar and business changes produce stable distinct hashes', () => {
  const base = {
    issue: { fields: { summary: 'A', created: '2026-08-21T12:00:00Z' } },
    changelog: [{ id: '1', created: '2026-08-21T15:00:00+03:00', items: [] }],
    comments: [{ id: '1', created: '2026-08-21T09:00:00-0300' }],
    worklogs: [],
    remoteLinks: [],
  };
  const first = hashJiraVersionV1(base);
  const repeated = hashJiraVersionV1(structuredClone(base));
  const changed = hashJiraVersionV1({
    ...base,
    issue: { fields: { ...base.issue.fields, summary: 'B' } },
  });

  assert.equal(first.warnings.length, 0);
  assert.equal(first.contentHash, repeated.contentHash);
  assert.notEqual(first.contentHash, changed.contentHash);
});

test('capacity report is redacted and projects the sample P95', () => {
  const report = buildJiraCapacityReport({
    scopeType: 'LABEL',
    scopeValue: 'cvte968',
    sampleSize: 20,
    storageBudgetGiB: 5,
    total: 1_000,
    elapsedMs: 1_500,
    requests: [
      { method: 'POST', path: '/rest/api/2/search', status: 200, durationMs: 500 },
      { method: 'GET', path: '/rest/api/2/issue/CVTE-1/changelog', status: 200, durationMs: 250 },
    ],
    measurements: [
      {
        identity: '10001',
        currentJsonBytes: 10_000,
        estimatedFullJsonBytes: 20_000,
        estimatedFullGzipBytes: 5_000,
        fieldCount: 100,
        changelogHistories: 10,
        changelogItems: 12,
        changelogComplete: true,
        comments: 3,
        commentsIncluded: 3,
        commentsComplete: true,
        worklogs: 1,
        worklogsIncluded: 1,
        worklogsComplete: true,
        developmentLinks: 2,
        attachmentExcluded: true,
        attachmentFieldExclusionHonored: true,
        attachmentReferencesStripped: 2,
      },
    ],
  });

  assert.equal(report.security.status, 'PASS');
  assert.equal(report.security.attachmentFieldExclusionHonored, true);
  assert.equal(report.security.attachmentReferencesStripped, 2);
  assert.equal(report.capacityGate.status, 'PASS');
  assert.equal(report.scope.observedSample, 1);
  assert.equal(report.collection.byOperation.search, 1);
  assert.equal(report.collection.byOperation['issue-changelog'], 1);
  assert.equal(report.projections[1]?.versionsPerTicket, 50);
  assert.equal(report.projections[2]?.threeDatabaseCopiesGiB, 8.382);
  assert.equal(report.reportVersion, 2);
  assert.equal(report.assumptions.capacityGateVersionsPerTicket, 100);
  assert.equal(report.assumptions.referenceDatabaseCopies, 3);
  assert.equal(report.capacityGate.level, 'NORMAL');
  assert.equal(report.capacityGate.versionsPerTicket, 100);
  assert.equal(report.capacityGate.utilizationPercent, 55.88);
  assert.equal(report.capacityGate.warnings.length, 0);
  assert.equal(JSON.stringify(report).includes('10001'), false);
  assert.equal(JSON.stringify(report).includes('CVTE-1'), false);
});

test('capacity report requires review at the critical primary database threshold', () => {
  const report = buildJiraCapacityReport({
    scopeType: 'LABEL',
    scopeValue: 'cvte968',
    sampleSize: 10,
    storageBudgetGiB: 1,
    total: 7,
    elapsedMs: 100,
    requests: [],
    measurements: [{
      identity: '1',
      currentJsonBytes: 1_000_000,
      estimatedFullJsonBytes: 1_000_000,
      estimatedFullGzipBytes: 100_000,
      fieldCount: 10,
      changelogHistories: 1,
      changelogItems: 1,
      changelogComplete: true,
      comments: 0,
      commentsIncluded: 0,
      commentsComplete: true,
      worklogs: 0,
      worklogsIncluded: 0,
      worklogsComplete: true,
      developmentLinks: 0,
      attachmentExcluded: true,
      attachmentFieldExclusionHonored: true,
      attachmentReferencesStripped: 0,
    }],
  });

  assert.equal(report.capacityGate.level, 'CRITICAL');
  assert.equal(report.capacityGate.status, 'REVIEW_REQUIRED');
  assert.equal(report.capacityGate.utilizationPercent, 97.79);
  assert.equal(report.capacityGate.reasons.length, 1);
});

test('capacity report adds existing global allocation and exposes non-blocking warnings', () => {
  const input = {
    scopeType: 'LABEL' as const,
    scopeValue: 'second-project',
    sampleSize: 10,
    storageBudgetGiB: 1,
    total: 1,
    elapsedMs: 100,
    requests: [],
    measurements: [{
      identity: '1',
      currentJsonBytes: 1_000_000,
      estimatedFullJsonBytes: 1_000_000,
      estimatedFullGzipBytes: 100_000,
      fieldCount: 10,
      changelogHistories: 1,
      changelogItems: 1,
      changelogComplete: true,
      comments: 0,
      commentsIncluded: 0,
      commentsComplete: true,
      worklogs: 0,
      worklogsIncluded: 0,
      worklogsComplete: true,
      developmentLinks: 0,
      attachmentExcluded: true,
      attachmentFieldExclusionHonored: true,
      attachmentReferencesStripped: 0,
    }],
  };

  const warningReport = buildJiraCapacityReport({ ...input, allocatedHistoryGiB: 0.6 });
  assert.equal(warningReport.capacityGate.level, 'WARNING');
  assert.equal(warningReport.capacityGate.status, 'PASS');
  assert.equal(warningReport.capacityGate.utilizationPercent, 73.97);
  assert.equal(warningReport.capacityGate.warnings.length, 1);

  const report = buildJiraCapacityReport({ ...input, allocatedHistoryGiB: 0.8 });

  assert.equal(report.capacityGate.level, 'HIGH');
  assert.equal(report.capacityGate.status, 'PASS');
  assert.equal(report.capacityGate.utilizationPercent, 93.97);
  assert.equal(report.capacityGate.projectedTotalDatabaseGiB, 0.94);
  assert.equal(report.capacityGate.warnings.length, 1);
});

test('capacity report classifies an exact overrun before display rounding', () => {
  const report = buildJiraCapacityReport({
    scopeType: 'LABEL',
    scopeValue: 'over-budget',
    sampleSize: 10,
    storageBudgetGiB: 1,
    allocatedHistoryGiB: 1.0001,
    total: 0,
    elapsedMs: 100,
    requests: [],
    measurements: [],
  });

  assert.equal(report.capacityGate.level, 'EXCEEDED');
  assert.equal(report.capacityGate.utilizationPercent, 100.01);
  assert.match(report.capacityGate.reasons.join(' '), /превышает бюджет/);
});

test('capacity report blocks attachment leakage and flags incomplete history', () => {
  const report = buildJiraCapacityReport({
    scopeType: 'EPIC',
    scopeValue: 'CVTE-123',
    sampleSize: 10,
    storageBudgetGiB: 1,
    total: 100,
    elapsedMs: 100,
    requests: [],
    measurements: [{
      identity: '1',
      currentJsonBytes: 1_000,
      estimatedFullJsonBytes: 1_000,
      estimatedFullGzipBytes: 500,
      fieldCount: 10,
      changelogHistories: 0,
      changelogItems: 0,
      changelogComplete: false,
      comments: 0,
      commentsIncluded: 0,
      commentsComplete: true,
      worklogs: 0,
      worklogsIncluded: 0,
      worklogsComplete: true,
      developmentLinks: 0,
      attachmentExcluded: false,
      attachmentFieldExclusionHonored: false,
      attachmentReferencesStripped: 1,
    }],
  });

  assert.equal(report.security.status, 'BLOCKED');
  assert.equal(report.capacityGate.status, 'REVIEW_REQUIRED');
  assert.equal(report.capacityGate.reasons.length, 3);
});
