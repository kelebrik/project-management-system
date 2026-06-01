import type { UserRole } from '@prisma/client';
import type { Request, RequestHandler } from 'express';

export type AdminRoutesContext = {
  requireAdmin: RequestHandler;
  currentUser: (req: Request) => any;
  hashPassword: (password: string) => string;
  wouldRemoveLastAdmin: (
    userId: string,
    patch: Partial<{ role: UserRole; isActive: boolean }>,
  ) => Promise<boolean>;
  userResponse: (user: any) => any;
  startedAt: Date;
};
