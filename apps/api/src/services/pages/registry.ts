import type { PageSourceKey } from '@pms/shared';
import { checkins, changes, issues, jira, lessons, workload } from './sources-more.js';
import { PAGE_CORE_SOURCE_ADAPTERS, type PageSourceAdapter } from './sources.js';

/** Every source a page may read, by its key. */
export const PAGE_SOURCE_ADAPTERS: Record<PageSourceKey, PageSourceAdapter> = { ...PAGE_CORE_SOURCE_ADAPTERS, issues, changes, lessons, workload, checkins, jira };
