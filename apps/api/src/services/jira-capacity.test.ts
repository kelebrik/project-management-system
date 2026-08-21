import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildJiraCapacityReport,
  jiraCapacityScopeJql,
  metricDistribution,
} from './jira-capacity.js';

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

test('capacity report is redacted and projects the sample P95', () => {
  const report = buildJiraCapacityReport({
    scopeType: 'LABEL',
    scopeValue: 'cvte968',
    sampleSize: 20,
    storageBudgetGiB: 50,
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
      },
    ],
  });

  assert.equal(report.security.status, 'PASS');
  assert.equal(report.capacityGate.status, 'PASS');
  assert.equal(report.scope.observedSample, 1);
  assert.equal(report.collection.byOperation.search, 1);
  assert.equal(report.collection.byOperation['issue-changelog'], 1);
  assert.equal(report.projections[1]?.versionsPerTicket, 50);
  assert.equal(JSON.stringify(report).includes('10001'), false);
  assert.equal(JSON.stringify(report).includes('CVTE-1'), false);
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
    }],
  });

  assert.equal(report.security.status, 'BLOCKED');
  assert.equal(report.capacityGate.status, 'REVIEW_REQUIRED');
  assert.equal(report.capacityGate.reasons.length, 2);
});
