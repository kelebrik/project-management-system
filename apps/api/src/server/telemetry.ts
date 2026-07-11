import type { NextFunction, Request, Response } from 'express';
import { isJiraConfigured } from '../jira.js';
import type { AuthRequest } from './auth.js';
import { hashApiToken } from './auth.js';
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
const rateLimitBuckets = new Map<string, { windowStart: number; count: number }>();

function metricRoute(req: Request) {
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

function rateLimitKey(req: Request) {
  const authHeader = req.get('authorization') ?? '';
  if (authHeader.startsWith('Bearer pms_')) {
    return `token:${hashApiToken(authHeader.slice('Bearer '.length).trim()).slice(0, 16)}`;
  }
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

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api')) {
    next();
    return;
  }
  const now = Date.now();
  const windowMs = 60_000;
  const authReq = req as AuthRequest;
  const limit = authReq.apiToken?.rateLimitPerMinute ?? defaultRateLimitPerMinute;
  const key = rateLimitKey(req);
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    rateLimitBuckets.set(key, { windowStart: now, count: 1 });
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - 1)));
    next();
    return;
  }
  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  if (bucket.count > limit) {
    res.status(429).json({ error: 'Превышен лимит запросов' });
    return;
  }
  next();
}

export function metricsHandler(req: Request, res: Response) {
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
