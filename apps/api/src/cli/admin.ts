import { stdin, stdout, stderr } from 'node:process';
import { createInterface } from 'node:readline';
import { PrismaClient } from '@prisma/client';
import { adminStatus, CLI_PASSWORD_MIN_LENGTH, grantAdmin, ProvisionError, setPassword } from '../services/admin-provision.js';
import { deploymentProfile, FALLBACK_DEPLOYMENT_PROFILE } from '../server/deployment-profile.js';

const USAGE = `Administrators of this installation, run next to its database (DATABASE_URL).

  status                              list administrators
  grant --email <address> [--name <name>]
                                      create or promote an active administrator
  password --email <address>          set a password (cloud profile only); asked twice,
                                      or read from standard input when it is not a terminal

Examples:
  npm run admin --workspace @pms/api -- grant --email anna@example.com --name "Anna"
  node apps/api/dist/cli/admin.js status`;

function option(args: string[], name: string) {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
}

/** A line typed without showing it on the screen. */
function askHidden(question: string) {
  return new Promise<string>((resolve) => {
    const input = createInterface({ input: stdin, output: stdout, terminal: true });
    const mute = input as unknown as { _writeToOutput: (text: string) => void };
    stdout.write(question);
    mute._writeToOutput = () => undefined;
    input.question('', (answer) => {
      input.close();
      stdout.write('\n');
      resolve(answer);
    });
  });
}

async function readAll() {
  let text = '';
  for await (const chunk of stdin) text += chunk;
  return text.replace(/\r?\n$/, '');
}

async function main(args: string[]) {
  const [command] = args;
  if (!command || command === 'help' || command === '--help') {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  const client = new PrismaClient();
  try {
    if (command === 'status') {
      const admins = await adminStatus(client);
      if (admins.length === 0) stdout.write('No administrators.\n');
      for (const admin of admins) {
        stdout.write(`${admin.isActive ? 'active  ' : 'inactive'}  ${admin.email}  ${admin.name}${admin.hasPassword ? '  (password)' : ''}  last sign-in: ${admin.lastLoginAt?.toISOString() ?? 'never'}\n`);
      }
      return 0;
    }
    if (command === 'grant') {
      const email = option(args, 'email');
      if (!email) throw new ProvisionError('--email is required');
      const result = await grantAdmin(client, { email, name: option(args, 'name') });
      stdout.write(`${result.created ? 'Created' : 'Promoted'} ${result.email} as an active administrator.\n`);
      return 0;
    }
    if (command === 'password') {
      const email = option(args, 'email');
      if (!email) throw new ProvisionError('--email is required');
      if ((deploymentProfile() ?? FALLBACK_DEPLOYMENT_PROFILE) !== 'cloud') {
        stderr.write('Note: password sign-in is off outside the cloud profile; this installation signs in through Keycloak.\n');
      }
      let password: string;
      if (stdin.isTTY) {
        password = await askHidden(`New password (at least ${CLI_PASSWORD_MIN_LENGTH} characters): `);
        if ((await askHidden('Repeat it: ')) !== password) throw new ProvisionError('The passwords differ');
      } else {
        password = await readAll();
      }
      await setPassword(client, { email, password });
      stdout.write(`Password set for ${email}; their sessions were ended.\n`);
      return 0;
    }
    throw new ProvisionError(`Unknown command: ${command}\n\n${USAGE}`);
  } finally {
    await client.$disconnect();
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    stderr.write(`${error instanceof ProvisionError ? error.message : error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  });
