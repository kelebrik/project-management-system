/** Fields whose change cannot move a date or a status in the Structure. */
export const WBS_FIELDS_OUTSIDE_SCHEDULE = new Set([
  'title', 'owner', 'comment', 'description', 'jiraTicketKey', 'jiraTicketUrl', 'jiraGoalLabels',
  'mattermostUrl', 'priority', 'templateColor', 'plannedCost', 'forecastCost',
]);

/**
 * Whether a change touches anything the schedule or the hierarchy statuses
 * depend on. The page sends only the fields that changed, so an edit of a
 * title or a comment alone answers no.
 */
export function wbsPatchAffectsSchedule(patch: Record<string, unknown>) {
  return Object.entries(patch).some(([field, value]) => value !== undefined && !WBS_FIELDS_OUTSIDE_SCHEDULE.has(field));
}
