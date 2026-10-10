import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

/** What another person changed, as much as a page needs to offer an update. */
export type ProjectLiveEvent = {
  id: string;
  projectId: string;
  section: ProjectLiveSection;
  actorId: string | null;
  actorName: string | null;
  /** The tab that made the change, so that tab can ignore its own event. */
  clientId: string | null;
  at: string;
};

export type ProjectLiveSection =
  | 'structure' | 'issues' | 'raid' | 'decisions' | 'changes' | 'jira' | 'passport'
  | 'requirements' | 'artifacts' | 'calendar' | 'schedule' | 'lessons' | 'project';

// One process holds the live connections, as it holds the queue of structure
// writes (routes/wbs/write-queue.ts); a second API instance needs a shared bus.
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publishProjectLiveEvent(event: Omit<ProjectLiveEvent, 'id' | 'at'>) {
  const full: ProjectLiveEvent = { ...event, id: randomUUID(), at: new Date().toISOString() };
  bus.emit(event.projectId, full);
  return full;
}

export function subscribeProjectLiveEvents(projectId: string, listener: (event: ProjectLiveEvent) => void) {
  bus.on(projectId, listener);
  return () => {
    bus.off(projectId, listener);
  };
}

export function projectLiveListenerCount(projectId: string) {
  return bus.listenerCount(projectId);
}

const SECTION_BY_PATH: Array<[RegExp, ProjectLiveSection]> = [
  [/\/(wbs|wbs-[a-z-]+|structure|plan-snapshots|baseline|milestones|tasks)(\/|$)/, 'structure'],
  [/\/(open-issues|issues)(\/|$)/, 'issues'],
  [/\/(risks|raid-items|raid)(\/|$)/, 'raid'],
  [/\/decisions(\/|$)/, 'decisions'],
  [/\/(changes|change-requests)(\/|$)/, 'changes'],
  [/\/jira(\/|-|$)/, 'jira'],
  [/\/(passport|charter)(\/|$)/, 'passport'],
  [/\/business-requirements(\/|$)/, 'requirements'],
  [/\/(artifacts|artifact-table|artifact-files)(\/|$)/, 'artifacts'],
  [/\/calendar/, 'calendar'],
  [/\/(schedule-shifts|target-date)(\/|$)/, 'schedule'],
  [/\/lessons(\/|$)/, 'lessons'],
];

// Requests that only read, though sent as POST, and a person's own view of a project.
const NOT_A_CHANGE = /\/(query|query-batch|query\.csv|preview|search|ui-state|my-view|compare)(\/|$|\?)/;
// Jira runs are only queued by these requests; the sync runner tells when their data is in.
const JIRA_QUEUED = /\/jira\/(sync|current-refresh|backfill|capacity-sample|history\/rebuild-projections)(\/|$|\?)/;

/** Which part of the project a successful write touched, or null when it is not a change others care about. */
export function liveSectionForWrite(method: string, path: string): ProjectLiveSection | null {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) return null;
  if (NOT_A_CHANGE.test(path) || JIRA_QUEUED.test(path)) return null;
  return SECTION_BY_PATH.find(([pattern]) => pattern.test(path))?.[1] ?? 'project';
}
