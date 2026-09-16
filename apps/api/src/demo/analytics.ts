import { createHash } from 'node:crypto';
import { type PrismaClient, type Project } from '@prisma/client';
import { jiraSemanticAggregateDefinitionSchema } from '@pms/shared';
import { hashJiraVersionV1 } from '../services/jira-version-canonical.js';
import { ensureJiraSystemSemanticAggregates } from '../services/jira-semantic-aggregates.js';
import { gitlabBranchScopeKey } from '../services/gitlab-branch-analytics.js';
import { dateAt, demoId, owners } from './project.js';

// Synthetic records in the application's database only. No Jira/GitLab requests.
export async function fillAnalytics(client: PrismaClient, project: Project, base: Date) {
  const now = new Date(base);
  base = new Date(base); base.setUTCHours(0, 0, 0, 0);
  const id = (key: string) => demoId(project.id, key);
  await client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`demo:${project.id}`}))::text`;
    for (let n = 0; n < 16; n++) {
      const key = `DEMO${createHash('sha256').update(project.id).digest('hex').slice(0, 6).toUpperCase()}-${n + 1}`;
      const resolved = n === 2 || n === 3 || n === 8 || n === 9;
      const issueType = n % 2 === 0 ? 'Bug' : 'Task';
      const created = dateAt(n === 0 ? -26 : n === 1 ? -35 : -85 + n, base);
      const resolutionAt = resolved ? dateAt(-3, base) : null;
      const priority = (n < 6 ? ['Critical', 'Blocker'] : ['High', 'Medium', 'Low'])[n % (n < 6 ? 2 : 3)];
      const status = resolved ? 'Done' : n === 4 ? 'Open' : n === 5 ? 'Blocked' : 'In Progress';
      const data = {
        projectId: project.id, jiraId: id(`jira-remote-${n}`), issueKey: key,
        issueUrl: `https://jira.example/browse/${key}`,
        summary: `${['Firmware update failure', 'Prepare the OTA package', 'Fix device boot', 'Implement integrity checks', 'Agree the interface', 'Remove the pilot blocker'][n % 6]} (demo)`,
        issueType, priority, status, assignee: owners[n % owners.length], reporter: project.projectManager,
        labels: ['demo-fixture', 'cvte968', 'MP', 'ota', 'pilot', 'sla'],
        resolution: resolved ? 'Done' : null, resolutionAt, issueCreatedAt: created,
        criticalPriorityAt: n < 6 ? created : null, criticalEndPriority: resolved && n < 6 ? priority : null,
        criticalSlaTracked: n < 6, transitionHistoryComplete: true,
        sprint: n === 5 ? null : 'Demo Sprint 4', commitCount: n + 2, mergeRequestCount: 1,
        developmentDataAvailable: true, developmentBaselineCaptured: true,
        developmentUpdatedAt: dateAt(-1, base), updatedAt: dateAt(-1, base), syncedAt: base,
      };
      const snapshot = await tx.jiraIssueSnapshot.upsert({
        where: { id: id(`snapshot-${n}`) }, create: { id: id(`snapshot-${n}`), ...data }, update: data,
      });
      const payload = { schemaVersion: 1, demo: true, issueKey: key, fields: {
        summary: snapshot.summary, status: snapshot.status, priority: snapshot.priority,
        labels: snapshot.labels, sprintIds: n === 5 ? [] : ['demo-1', 'demo-2', 'demo-3', 'demo-4'],
        created: snapshot.issueCreatedAt?.toISOString(), updated: snapshot.updatedAt.toISOString(),
        resolutionAt: snapshot.resolutionAt?.toISOString() ?? null,
      } };
      const { canonicalJson: payloadText, contentHash } = hashJiraVersionV1(payload);
      const versionId = id(`version-${n}-${contentHash}`);
      const version = await tx.jiraIssueVersion.upsert({ where: { id: versionId }, update: {}, create: {
        id: versionId, projectId: project.id, snapshotId: snapshot.id,
        jiraIssueId: snapshot.jiraId!, issueKey: key, jiraUpdatedAt: snapshot.updatedAt,
        issueUpdatedAt: snapshot.updatedAt, observedAt: snapshot.syncedAt,
        contentHash, payload: JSON.parse(payloadText), payloadBytes: Buffer.byteLength(payloadText),
        syncRunId: id('synthetic-observation'), changelogComplete: true, commentsComplete: false,
        worklogsComplete: false, remoteLinksComplete: false, provenance: 'OBSERVED',
        validationWarnings: ['Synthetic demo data, not imported from Jira'],
        summary: snapshot.summary, issueUrl: snapshot.issueUrl, issueType: snapshot.issueType,
        status: snapshot.status, statusCategory: resolved ? 'done' : status === 'Open' ? 'new' : 'indeterminate',
        priority: snapshot.priority, resolution: snapshot.resolution, resolutionAt: snapshot.resolutionAt,
        issueCreatedAt: snapshot.issueCreatedAt, assignee: snapshot.assignee, reporter: snapshot.reporter,
        labels: snapshot.labels, sprintIds: n === 5 ? [] : ['demo-1', 'demo-2', 'demo-3', 'demo-4'], sprint: snapshot.sprint,
        criticalPriorityAt: snapshot.criticalPriorityAt, criticalEndPriority: snapshot.criticalEndPriority,
        commitCount: snapshot.commitCount, mergeRequestCount: snapshot.mergeRequestCount,
        developmentDataAvailable: true, developmentBaselineCaptured: true, transitionHistoryComplete: true,
      } });
      if (snapshot.currentVersionId !== version.id) await tx.jiraIssueSnapshot.update({ where: { id: snapshot.id }, data: { currentVersionId: version.id } });
      const transitions = n === 4 ? [] : [
        { fromStatus: 'Open', toStatus: 'In Progress', transitionedAt: dateAt(3, snapshot.issueCreatedAt!) },
        ...(resolved ? [{ fromStatus: 'In Progress', toStatus: 'Done', transitionedAt: snapshot.resolutionAt! }]
          : status === 'Blocked' ? [{ fromStatus: 'In Progress', toStatus: 'Blocked', transitionedAt: dateAt(-2, base) }] : []),
      ];
      for (const [t, transition] of transitions.entries()) await tx.jiraIssueStatusTransition.upsert({
        where: { snapshotId_transitionKey: { snapshotId: snapshot.id, transitionKey: `demo-${t}` } }, update: transition,
        create: { snapshotId: snapshot.id, transitionKey: `demo-${t}`, ...transition, actor: snapshot.assignee },
      });
      await tx.jiraDevelopmentActivity.upsert({
        where: { snapshotId_activityKey: { snapshotId: snapshot.id, activityKey: 'demo-code' } }, update: { activityAt: dateAt(-1, base) },
        create: { snapshotId: snapshot.id, activityKey: 'demo-code', activityAt: dateAt(-1, base), commitCount: n + 2,
          mergeRequestCount: 1, sprintAtObservation: snapshot.sprint, isBaseline: false },
      });
      const section = await tx.jiraWorkSection.upsert({
        where: { projectId_sortOrder: { projectId: project.id, sortOrder: n % 3 } }, update: {},
        create: { projectId: project.id, sortOrder: n % 3, title: ['Development', 'Testing', 'Release'][n % 3], jql: '' },
      });
      await tx.jiraWorkSectionIssue.upsert({
        where: { sectionId_snapshotId: { sectionId: section.id, snapshotId: snapshot.id } }, update: {},
        create: { sectionId: section.id, snapshotId: snapshot.id },
      });
    }
  }, { timeout: 300_000 });
  await ensureJiraSystemSemanticAggregates(client, project.id);
  // Populate the exact published GitLab scope used by the dashboard, without network I/O.
  const aggregates = await client.jiraAggregateDefinition.findMany({ where: { projectId: project.id, publishedVersion: { not: null } } });
  for (const aggregate of aggregates) {
    const revision = await client.jiraAggregateDefinitionRevision.findUnique({
      where: { aggregateId_version: { aggregateId: aggregate.id, version: aggregate.publishedVersion! } },
    });
    const config = jiraSemanticAggregateDefinitionSchema.parse(revision?.definition).rowConfig;
    if (config?.kind !== 'gitlabBranchCommit') continue;
    const scopeKey = gitlabBranchScopeKey(config);
    const runId = id(`gitlab-run-${scopeKey}`);
    await client.$transaction(async (tx) => {
      const run = await tx.gitlabBranchSyncRun.upsert({ where: { id: runId }, update: { windowStartedAt: dateAt(-Math.min(config.lookbackDays, 14), now), windowEndedAt: now, finishedAt: now }, create: {
        id: runId, projectId: project.id, aggregateId: aggregate.id, aggregateVersion: aggregate.publishedVersion!,
        scopeKey, projectPath: config.projectPath, targetBranch: config.targetBranch,
        lookbackDays: config.lookbackDays, includeMergeCommits: config.includeMergeCommits,
        windowStartedAt: dateAt(-Math.min(config.lookbackDays, 14), now), windowEndedAt: now,
        status: 'COMPLETED', commitCount: 5, unlinkedCount: 5, finishedAt: now,
      } });
      for (let c = 0; c < 5; c++) {
        const sha = createHash('sha1').update(id(`commit-${scopeKey}-${c}`)).digest('hex');
        await tx.gitlabBranchCommit.upsert({ where: { projectId_scopeKey_commitSha: { projectId: project.id, scopeKey, commitSha: sha } }, update: { committedAt: dateAt(-c - 1, now), observedAt: now }, create: {
          projectId: project.id, syncRunId: run.id, scopeKey, projectPath: config.projectPath,
          targetBranch: config.targetBranch, commitSha: sha, shortSha: sha.slice(0, 8),
          title: `Demo: ${['update the sign-in screen', 'fix the timeout', 'add metrics', 'speed up the build', 'update the documentation'][c]}`,
          message: 'Synthetic sample commit without an issue link.', authorName: owners[c],
          committedAt: dateAt(-c - 1, now), observedAt: now,
          webUrl: `https://gitlab.example/demo/commits/${sha}`, jiraLinkState: 'unlinked',
        } });
      }
    });
  }
}
