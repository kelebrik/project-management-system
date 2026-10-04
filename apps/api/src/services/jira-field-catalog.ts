import type { Prisma, PrismaClient } from '@prisma/client';
import { JIRA_EXTRA_FIELDS_MAX, isJiraFieldId, jiraKnownFieldIds, mergeJiraFieldCatalog, type JiraAttributeConfig } from '../jira-attributes.js';

type CatalogClient = Pick<PrismaClient, 'jiraAnalyticsSettings' | '$transaction'>;

const catalogOf = (value: unknown): Record<string, string> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : {};

/**
 * What a project's searches ask for on top of the usual fields: Epic Link and
 * Story Points found in its field catalog (or set in the environment) and the
 * extra fields an administrator chose.
 */
export async function jiraAttributeConfigForProject(database: CatalogClient, projectId: string): Promise<JiraAttributeConfig> {
  const settings = await database.jiraAnalyticsSettings.findUnique({ where: { projectId }, select: { fieldCatalog: true, extraFieldIds: true } });
  const known = jiraKnownFieldIds(catalogOf(settings?.fieldCatalog));
  return { ...known, extraFieldIds: (settings?.extraFieldIds ?? []).filter(isJiraFieldId).slice(0, JIRA_EXTRA_FIELDS_MAX) };
}

/** Adds the field names a search answer gave to the project's catalog; writes only when something new came. */
export async function rememberJiraFieldNames(database: CatalogClient, projectId: string, names: Record<string, string> | undefined) {
  if (!names || Object.keys(names).length === 0) return;
  // Read and write under the row lock: two runs answering at once must not drop each other's names.
  await database.$transaction(async (transaction) => {
    const [locked] = await transaction.$queryRaw<Array<{ fieldCatalog: Prisma.JsonValue }>>`SELECT "fieldCatalog" FROM "JiraAnalyticsSettings" WHERE "projectId" = ${projectId} FOR UPDATE`;
    if (!locked) return;
    const { catalog, changed } = mergeJiraFieldCatalog(locked.fieldCatalog, names);
    if (changed) await transaction.jiraAnalyticsSettings.update({ where: { projectId }, data: { fieldCatalog: catalog as Prisma.InputJsonValue } });
  });
}

export function jiraFieldCatalogList(value: unknown) {
  return Object.entries(catalogOf(value))
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru') || left.id.localeCompare(right.id));
}
