import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './db.js';
import { createApp } from './server/app.js';
import { logEvent } from './server/logger.js';
import { recalculateProjectWbsSchedule } from './services/wbs-schedule.js';

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

app.listen(port, () => {
  logEvent('info', 'api.listen', { port });
  void recalculateActiveProjectSchedulesOnStartup();
});
