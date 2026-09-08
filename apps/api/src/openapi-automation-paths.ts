import { projectIdParam, securedOperation } from './openapi-helpers.js';

export const openApiAutomationPaths = {
  '/api/projects/{projectId}/automation/insights': {
    get: {
      ...securedOperation(['Projects'], 'Read milestone readiness and local Jira reconciliation proposals'),
      description: 'Explicit project read grant (or administrator) required. Uses enabled modules and stored Jira snapshots only; never calls or writes Jira.',
      parameters: [projectIdParam],
    },
  },
  '/api/projects/{projectId}/automation/scenario': {
    get: {
      ...securedOperation(['WBS'], 'Calculate a read-only schedule scenario'),
      description: 'Available with project read access, including closed projects. No persistent changes. Returns baseline fingerprint, affected dates, milestones and critical paths. Variants are stored only in the user browser.',
      parameters: [projectIdParam, { name: 'patches', in: 'query', required: false, schema: { type: 'string', maxLength: 4000, default: '[]' }, description: 'JSON array of at most 20 unique work overrides: {id, startDate?: YYYY-MM-DD, dueDate?: YYYY-MM-DD, workDays?: 1..3650}. dueDate and workDays are mutually exclusive.' }],
      responses: { '200': { description: 'ScenarioResult' }, '400': { description: 'Invalid or oversized overrides' }, '401': { description: 'Authentication required' }, '404': { description: 'Unavailable project or module' }, '422': { description: 'Invalid graph, cycle or ineligible work override' } },
    },
  },
  '/api/reports/weekly-brief': {
    get: {
      ...securedOperation(['Projects'], 'Read business changes for an accessible project or portfolio'),
      description: 'Allowlisted journal fields and WBS command deltas only. At most 2000 records per source and 5000 output changes. Warnings identify truncation and incomplete historical coverage. Disabled registers are excluded.',
      parameters: [{ name: 'projectId', in: 'query', schema: { type: 'string' } }, { name: 'days', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 90, default: 7 } }],
    },
  },
} as const;
