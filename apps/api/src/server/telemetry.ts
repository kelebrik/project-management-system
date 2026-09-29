import { PUBLIC_DEMO_USER_ID } from '@pms/shared';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import { isJiraConfigured } from '../jira.js';
import type { AuthRequest } from './auth.js';
import { logEvent } from './logger.js';

const metricsToken = process.env.METRICS_TOKEN ?? '';
const requireMetricsToken = process.env.NODE_ENV === 'production';
const defaultRateLimitPerMinute = Math.max(10, Number(process.env.RATE_LIMIT_PER_MINUTE ?? 600));
const requestMetrics = {
  total: 0,
  errors: 0,
  byRoute: new Map<string, number>(),
  durationsByRoute: new Map<string, number[]>(),
};
const legacyConversionGaugeTtlMs = 30_000;
const legacyConversionGaugeTimeoutMs = 500;
let legacyConversionGauge = { value: -1, loadedAt: 0 };
let legacyConversionGaugeRefresh: Promise<void> | null = null;

function refreshLegacyConversionGauge() {
  if (!legacyConversionGaugeRefresh) {
    legacyConversionGaugeRefresh = prisma.jiraAnalyticsDashboardConversion.count({
      where: { rollbackState: 'AVAILABLE' },
    }).then((value) => {
      legacyConversionGauge = { value, loadedAt: Date.now() };
    }).catch((error) => {
      legacyConversionGauge = { ...legacyConversionGauge, loadedAt: Date.now() };
      logEvent('warn', 'jira.analytics.legacy_conversion_metric_failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }).finally(() => {
      legacyConversionGaugeRefresh = null;
    });
  }
  return legacyConversionGaugeRefresh;
}

async function availableLegacyConversions() {
  if (Date.now() - legacyConversionGauge.loadedAt < legacyConversionGaugeTtlMs) {
    return legacyConversionGauge.value;
  }
  const refresh = refreshLegacyConversionGauge();
  await Promise.race([
    refresh,
    new Promise<void>((resolve) => setTimeout(resolve, legacyConversionGaugeTimeoutMs)),
  ]);
  return legacyConversionGauge.value;
}

export function metricRoute(req: Pick<Request, 'path'>) {
  if (/^\/api\/projects\/[^/]+\/jira\/sync-runs\/active$/.test(req.path)) {
    return '/api/projects/:projectId/jira/sync-runs/active';
  }
  if (/^\/api\/projects\/[^/]+\/jira\/sync-runs\/[^/]+$/.test(req.path)) {
    return '/api/projects/:projectId/jira/sync-runs/:runId';
  }
  if (req.path.startsWith('/api/projects/') && req.path.endsWith('/overview')) {
    return '/api/projects/:projectId/overview';
  }
  if (req.path.startsWith('/api/projects/')) {
    return req.path.replace(/\/api\/projects\/[^/]+/, '/api/projects/:projectId');
  }
  if (req.path.startsWith('/api/wbs-items/')) return '/api/wbs-items/:itemId';
  if (req.path.startsWith('/api/wbs-dependencies/')) return '/api/wbs-dependencies/:dependencyId';
  if (req.path.startsWith('/api/open-issues/')) return '/api/open-issues/:issueId';
  if (req.path.startsWith('/api/raid-items/')) return '/api/raid-items/:itemId';
  if (req.path.startsWith('/api/executive-overviews/')) return '/api/executive-overviews/:overviewId';
  return req.path;
}

/**
 * Whose requests share a budget: a verified API token by its id, a signed-in user by
 * id, and only anonymous visitors and the shared public demo identity by
 * address. Counting users by address would put everyone behind a corporate
 * proxy into one bucket.
 */
export function rateLimitKey(req: Request) {
  // Only a token attachAuth accepted gets its own budget: made-up "pms_" values
  // must not open a fresh bucket each time.
  const token = (req as AuthRequest).apiToken;
  if (token) return `token:${token.id}`;
  const user = (req as AuthRequest).currentUser;
  if (user && user.id !== PUBLIC_DEMO_USER_ID) return `user:${user.id}`;
  return `ip:${req.ip}`;
}

export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    if (!req.path.startsWith('/api')) return;
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const route = metricRoute(req);
    requestMetrics.total += 1;
    if (res.statusCode >= 500) requestMetrics.errors += 1;
    requestMetrics.byRoute.set(route, (requestMetrics.byRoute.get(route) ?? 0) + 1);
    const durations = requestMetrics.durationsByRoute.get(route) ?? [];
    durations.push(durationMs);
    if (durations.length > 200) durations.shift();
    requestMetrics.durationsByRoute.set(route, durations);
    logEvent(res.statusCode >= 500 ? 'error' : 'info', 'http.request', {
      method: req.method,
      path: route,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      requestId: req.get('x-request-id') ?? null,
      userAgent: req.get('user-agent') ?? null,
      ipAddress: req.ip,
    });
  });
  next();
}

const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * A fixed one-minute window per key. It is mounted on /api only, so it looks at
 * every request it sees (under a mount point req.path has no /api prefix,
 * which once made it skip them all). Expired windows are swept once a window.
 */
export function createRateLimiter({ defaultLimit, now = Date.now }: { defaultLimit: number; now?: () => number }) {
  const buckets = new Map<string, { windowStart: number; count: number }>();
  let lastSweep = now();
  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const time = now();
    if (time - lastSweep >= RATE_LIMIT_WINDOW_MS) {
      for (const [key, bucket] of buckets) if (time - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) buckets.delete(key);
      lastSweep = time;
    }
    const limit = (req as AuthRequest).apiToken?.rateLimitPerMinute ?? defaultLimit;
    const key = rateLimitKey(req);
    let bucket = buckets.get(key);
    if (!bucket || time - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
      bucket = { windowStart: time, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.windowStart + RATE_LIMIT_WINDOW_MS - time) / 1000))));
      res.status(429).json({ error: 'Превышен лимит запросов' });
      return;
    }
    next();
  };
  return Object.assign(middleware, { bucketCount: () => buckets.size });
}

export const rateLimitMiddleware = createRateLimiter({ defaultLimit: defaultRateLimitPerMinute });

export async function metricsHandler(req: Request, res: Response) {
  if (requireMetricsToken && !metricsToken) {
    res.status(503).type('text/plain').send('metrics token is not configured\n');
    return;
  }

  if (metricsToken) {
    const auth = req.get('authorization') ?? '';
    const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
    if (auth !== `Bearer ${metricsToken}` && queryToken !== metricsToken) {
      res.status(401).type('text/plain').send('unauthorized\n');
      return;
    }
  }

  const routeMetrics = [...requestMetrics.byRoute.entries()]
    .map(([route, count]) => `pms_http_requests_by_route_total{route="${route.replaceAll('"', '\\"')}"} ${count}`)
    .join('\n');
  const routeDurationMetrics = [...requestMetrics.durationsByRoute.entries()]
    .flatMap(([route, durations]) => {
      const escapedRoute = route.replaceAll('"', '\\"');
      const sorted = [...durations].sort((left, right) => left - right);
      const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
      return [
        `pms_http_request_duration_ms{route="${escapedRoute}",stat="avg"} ${average.toFixed(2)}`,
        `pms_http_request_duration_ms{route="${escapedRoute}",stat="p95"} ${p95.toFixed(2)}`,
      ];
    })
    .join('\n');
  const legacyConversions = await availableLegacyConversions();
  res.type('text/plain').send(
    [
      '# HELP pms_uptime_seconds Application uptime in seconds',
      '# TYPE pms_uptime_seconds gauge',
      `pms_uptime_seconds ${Math.floor(process.uptime())}`,
      '# HELP pms_http_requests_total Total API requests handled by this process',
      '# TYPE pms_http_requests_total counter',
      `pms_http_requests_total ${requestMetrics.total}`,
      '# HELP pms_http_errors_total Total API requests with HTTP 5xx status',
      '# TYPE pms_http_errors_total counter',
      `pms_http_errors_total ${requestMetrics.errors}`,
      '# HELP pms_jira_configured Jira integration environment/configuration flag',
      '# TYPE pms_jira_configured gauge',
      `pms_jira_configured ${isJiraConfigured() ? 1 : 0}`,
      '# HELP pms_jira_analytics_conversions_available_total Managed dashboards with an open legacy rollback window',
      '# TYPE pms_jira_analytics_conversions_available_total gauge',
      `pms_jira_analytics_conversions_available_total ${legacyConversions}`,
      '# HELP pms_http_requests_by_route_total Total API requests by normalized route',
      '# TYPE pms_http_requests_by_route_total counter',
      routeMetrics,
      '# HELP pms_http_request_duration_ms Recent API request duration by normalized route',
      '# TYPE pms_http_request_duration_ms gauge',
      routeDurationMetrics,
      '',
    ].join('\n'),
  );
}
