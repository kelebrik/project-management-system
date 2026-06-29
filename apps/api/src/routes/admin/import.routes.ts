import multer from 'multer';
import type { Response, Router } from 'express';
import { recordAuditEvent } from '../../services/audit.js';
import {
  createWbsImportTemplateBuffer,
  importWbsTasksIntoPhase,
  parseWbsImportWorkbook,
  WbsImportValidationError,
} from '../../services/wbs-import.js';
import type { AdminRoutesContext } from './types.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

function sendValidationError(res: Response, error: WbsImportValidationError) {
  res.status(400).json({
    error: error.errors.join('; '),
  });
}

function isExcelFilename(filename: string | undefined) {
  return Boolean(filename && /\.(xlsx|xls)$/i.test(filename));
}

export function registerAdminImportRoutes(router: Router, context: AdminRoutesContext) {
  const { requireAdmin, currentUser } = context;

  router.get('/admin/import/wbs-template', requireAdmin, (_req, res) => {
    const buffer = createWbsImportTemplateBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="wbs-import-template.xlsx"',
    );
    res.send(buffer);
  });

  router.post(
    '/admin/import/wbs-items',
    requireAdmin,
    upload.single('file'),
    async (req, res) => {
      const projectId = typeof req.body.projectId === 'string' ? req.body.projectId.trim() : '';
      const phaseId = typeof req.body.phaseId === 'string' ? req.body.phaseId.trim() : '';
      if (!projectId || !phaseId) {
        res.status(400).json({ error: 'Выберите проект и фазу для импорта' });
        return;
      }
      if (!req.file?.buffer) {
        res.status(400).json({ error: 'Загрузите XLS или XLSX файл' });
        return;
      }
      if (!isExcelFilename(req.file.originalname)) {
        res.status(400).json({ error: 'Поддерживаются только файлы .xls и .xlsx' });
        return;
      }

      try {
        const rows = parseWbsImportWorkbook(req.file.buffer);
        const result = await importWbsTasksIntoPhase({ projectId, phaseId, rows });
        await recordAuditEvent({
          req,
          actor: currentUser(req),
          action: 'admin.wbs_import',
          objectType: 'WbsItem',
          projectId: result.project.id,
          metadata: {
            projectCode: result.project.code,
            phaseId: result.phase.id,
            phaseCode: result.phase.code,
            createdCount: result.createdCount,
            importedRows: result.importedRows,
          },
        });
        res.status(201).json(result);
      } catch (error) {
        if (error instanceof WbsImportValidationError) {
          sendValidationError(res, error);
          return;
        }
        console.error(error);
        res.status(500).json({ error: 'Не удалось импортировать задачи' });
      }
    },
  );
}
