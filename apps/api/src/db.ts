import { PrismaClient } from '@prisma/client';

let prismaClient: PrismaClient | undefined;

function getPrismaClient() {
  if (!prismaClient) {
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}

// Tests replace the provider before accessing delegates, so they never construct
// a native-engine-backed client just to stub its methods.
export const prismaClientProvider = { get: getPrismaClient };

// Lazy proxy: importing db.ts must not connect Prisma for pure unit tests.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = prismaClientProvider.get();
    const value = client[property as keyof PrismaClient];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
