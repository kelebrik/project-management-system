import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../server/auth.js';

export const CLI_PASSWORD_MIN_LENGTH = 12;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ProvisionError extends Error {}

const normalizedEmail = (email: string) => {
  const value = email.trim().toLowerCase();
  if (!EMAIL.test(value)) throw new ProvisionError(`Not an e-mail address: ${email}`);
  return value;
};

async function audit(client: PrismaClient, action: string, userId: string, email: string) {
  await client.auditEvent.create({
    data: { actorId: null, actorName: 'command line', action, objectType: 'User', objectId: userId, metadata: { email } },
  });
}

/** Active administrators: who can run the system right now. */
export async function adminStatus(client: PrismaClient) {
  const admins = await client.user.findMany({ where: { role: 'ADMIN' }, select: { email: true, name: true, isActive: true, passwordHash: true, lastLoginAt: true }, orderBy: { email: 'asc' } });
  return admins.map(({ passwordHash, ...admin }) => ({ ...admin, hasPassword: Boolean(passwordHash) }));
}

/**
 * Makes a person an active administrator: creates the user when the address
 * is new, or promotes and reactivates an existing one. An existing user's
 * sessions are ended in the same step, so a cookie from before a switch-off
 * does not come back to life with administrator rights. Sign-in then goes
 * through the installation's usual way (Keycloak by e-mail, or a password).
 */
export async function grantAdmin(client: PrismaClient, input: { email: string; name?: string }) {
  const email = normalizedEmail(input.email);
  const name = input.name?.trim() || email;
  const existing = await client.user.findUnique({ where: { email }, select: { id: true } });
  const user = existing
    ? (
        await client.$transaction([
          client.userSession.deleteMany({ where: { userId: existing.id } }),
          client.user.update({ where: { id: existing.id }, data: { role: 'ADMIN', isActive: true }, select: { id: true, email: true } }),
        ])
      )[1]
    : await client.user.create({ data: { email, name, role: 'ADMIN', isActive: true }, select: { id: true, email: true } });
  await audit(client, existing ? 'user.cli_grant_admin' : 'user.cli_create_admin', user.id, user.email);
  return { email: user.email, created: !existing };
}

/** Sets a user's password and ends their sessions, so an old password or a stolen cookie stops working. */
export async function setPassword(client: PrismaClient, input: { email: string; password: string }) {
  const email = normalizedEmail(input.email);
  if (input.password.length < CLI_PASSWORD_MIN_LENGTH) throw new ProvisionError(`The password needs at least ${CLI_PASSWORD_MIN_LENGTH} characters`);
  if (input.password.length > 256) throw new ProvisionError('The password is too long');
  const existing = await client.user.findUnique({ where: { email }, select: { id: true } });
  if (!existing) throw new ProvisionError(`No user with ${email}; create one with "grant" first`);
  const passwordHash = await hashPassword(input.password);
  await client.$transaction([
    client.user.update({ where: { id: existing.id }, data: { passwordHash } }),
    client.userSession.deleteMany({ where: { userId: existing.id } }),
  ]);
  await audit(client, 'user.cli_set_password', existing.id, email);
  return { email };
}
