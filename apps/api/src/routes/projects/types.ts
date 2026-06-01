import type { Request, RequestHandler, Response } from 'express';

export type ProjectsRoutesContext = {
  requireAdmin: RequestHandler;
  currentUser: (req: Request) => any;
  ensureProjectWritable: (projectId: string, res: Response) => Promise<any | null>;
  ensureEntityProjectWritable: (projectId: string, res: Response) => Promise<boolean>;
};
