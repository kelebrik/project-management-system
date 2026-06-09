import type { Issue, RaidItem } from "./domainTypes";

export function latestRaidStatusUpdate(item: RaidItem) {
  return [...(item.statusUpdates ?? [])].sort((left, right) => {
    const statusDelta =
      new Date(right.statusAt).getTime() - new Date(left.statusAt).getTime();
    if (statusDelta !== 0) return statusDelta;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  })[0];
}

export function latestIssueStatusUpdate(issue: Issue) {
  return [...(issue.statusUpdates ?? [])].sort((left, right) => {
    const statusDelta =
      new Date(right.statusAt).getTime() - new Date(left.statusAt).getTime();
    if (statusDelta !== 0) return statusDelta;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  })[0];
}
