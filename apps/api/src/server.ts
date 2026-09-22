import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './db.js';
import { createApp } from './server/app.js';
import { logEvent } from './server/logger.js';
import { recalculateProjectWbsSchedule } from './services/wbs-schedule.js';
import { createJiraSyncRunner } from './services/jira-sync-runner.js';
import { assertDeploymentProfileConfigured, resolveTrustProxyHops } from './server/deployment-profile.js';

// Fail fast on a misconfigured deployment: every cloud-only capability is gated
// on this profile, so a missing value must stop the process rather than quietly
// degrade behaviour.
const deploymentProfile = assertDeploymentProfileConfigured();
const isProduction = process.env.NODE_ENV === 'production';
const trustProxy = isProduction ? resolveTrustProxyHops() : { hops: 0, configured: true };
logEvent('info', 'api.deployment_profile', { profile: deploymentProfile, trustProxyHops: trustProxy.hops });
if (!trustProxy.configured) {
  // Worth noticing: too few hops makes every caller look like the proxy, which
  // quietly stops per-address rate limiting from ever reaching its threshold.
  logEvent('warn', 'api.trust_proxy_unconfigured', {
    usedHops: trustProxy.hops,
    message: 'TRUST_PROXY_HOPS is not set; falling back to the legacy depth. Set it to the real number of proxies.',
  });
}

const port = Number(process.env.PORT ?? 3000);
const app = createApp();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDist = path.resolve(__dirname, '../../web/dist');

app.use(
  express.static(webDist, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-store');
        return;
      }
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);
app.get(/.*/, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(webDist, 'index.html'));
});

async function recalculateActiveProjectSchedulesOnStartup() {
  const projects = await prisma.project.findMany({
    where: { status: { not: 'CLOSED' } },
    select: { id: true, code: true },
    orderBy: [{ updatedAt: 'desc' }],
  });

  let updatedItems = 0;
  for (const project of projects) {
    try {
      updatedItems += await recalculateProjectWbsSchedule(project.id);
    } catch (error) {
      logEvent('error', 'wbs.schedule.startup_recalculate_failed', {
        projectId: project.id,
        projectCode: project.code,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logEvent('info', 'wbs.schedule.startup_recalculated', {
    projectCount: projects.length,
    updatedItems,
  });
}

const jiraSyncRunner = createJiraSyncRunner(prisma);
const server = app.listen(port, () => {
  logEvent('info', 'api.listen', { port });
  void recalculateActiveProjectSchedulesOnStartup();
  jiraSyncRunner.start();
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  logEvent('info', 'api.shutdown', { signal });
  server.close();
  await jiraSyncRunner.stop();
  await prisma.$disconnect();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
