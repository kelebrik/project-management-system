import { PrismaClient } from '@prisma/client';
import { completeDemoData } from '../../apps/api/src/demo/complete.js';
const prisma = new PrismaClient();
completeDemoData(prisma).catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
