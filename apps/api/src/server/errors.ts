import { Prisma } from '@prisma/client';

export function serverErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('40P01') || message.includes('deadlock detected')) {
    return `${fallback}: конфликт параллельного сохранения. Повторите действие`;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${fallback}: ${error.code}`;
  }
  return error instanceof Error ? error.message : fallback;
}
