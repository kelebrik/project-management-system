-- The RAG formula and approval workflow settings were text the application never read; their pages are gone.
DELETE FROM "SystemSetting" WHERE "key" IN ('rag.formula.green', 'rag.formula.amber', 'rag.formula.red', 'workflow.overview', 'workflow.baseline', 'workflow.projectClose');
DELETE FROM "RolePermission" WHERE "permission" IN ('admin.rag', 'admin.workflow');
