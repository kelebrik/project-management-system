import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { userCanReadProject } from '../server/business-units.js';

/**
 * Structure writes a page may send again with the same mutation id (a lost
 * answer, a retry, later an offline queue): each one runs one operation on one
 * project in one transaction, so its receipt commits with it.
 */
const MUTATION_ROUTES: Array<[method: string, path: RegExp, structureOnly: boolean]> = [
  ['POST', /^\/projects\/[^/]+\/wbs-items$/, true],
  ['POST', /^\/projects\/[^/]+\/wbs-items\/(append|insert-after|reorder|renumber)$/, true],
  ['PATCH', /^\/projects\/[^/]+\/wbs-items\/bulk$/, true],
  // Deleting rows also clears issue links and removes RACI rows and check-ins.
  ['DELETE', /^\/projects\/[^/]+\/wbs-items$/, false],
  ['PATCH', /^\/wbs-items\/[^/]+$/, true],
  ['DELETE', /^\/wbs-items\/[^/]+$/, false],
  ['POST', /^\/projects\/[^/]+\/wbs-dependencies$/, true],
  ['PATCH', /^\/wbs-dependencies\/[^/]+$/, true],
  ['DELETE', /^\/wbs-dependencies\/[^/]+$/, true],
  ['POST', /^\/projects\/[^/]+\/wbs-snapshot\/revert$/, true],
];

function mutationRoute(method: string, path: string) {
  return MUTATION_ROUTES.find(([verb, pattern]) => verb === method.toUpperCase() && pattern.test(path)) ?? null;
}

export function isStructureMutationRoute(method: string, path: string) {
  return mutationRoute(method, path) !== null;
}

/** A write whose every change the Structure's journal carries: a page that caught up with it has seen all of it. */
export function isStructureOnlyWrite(method: string, path: string) {
  return mutationRoute(method, path)?.[2] === true;
}

/** How long a duplicate waits for the request running the same mutation: past the Structure transaction's own limit. */
export const MUTATION_WAIT_MS = 75_000;
/** A claim this old belongs to a request that died: its transaction rolled back long ago, so another may take it. */
export const MUTATION_STALE_CLAIM_MS = 120_000;
/** An answer larger than this is not kept; a repeat then catches up through the journal instead. */
const OUTCOME_LIMIT_BYTES = 512 * 1024;
/** Refusals that stay refusals: the same request would be refused again, so it is answered the same. */
const TERMINAL_STATUSES = new Set([400, 403, 404, 409, 422, 423]);
/** The answer's headers a page reads, kept to answer a repeat the same way. */
const KEPT_HEADERS = ['X-PMS-Structure', 'X-WBS-Updated-Count', 'X-Schedule-Shift-Operation-Id', 'X-Schedule-Shift-Reason-Needed', 'X-Schedule-Shift-Session-Id', 'X-Schedule-Shift-Project-Id', 'X-Schedule-Shift-Actor-Id'];

const MUTATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^\d{1,19}$/;

/** The mutation a request runs, as the Structure transaction sees it. */
export type StructureMutation = {
  userId: string;
  mutationId: string;
  claimToken: string;
  /** The project the transaction locked, once it did. */
  projectId: string | null;
  /** Set when the transaction that committed the receipt has finished. */
  committed: boolean;
  commitVersion: bigint | null;
  /** The receipt was moved to COMMITTED inside a transaction not yet finished. */
  pendingCommitVersion: bigint | null;
  /** The answer went out: work the request left behind is no longer this mutation. */
  closed: boolean;
};

const storage = new AsyncLocalStorage<StructureMutation>();

/** Runs work as the given mutation's request would: for tests of what a transaction does with a claim it lost. */
export function runAsStructureMutation<T>(mutation: StructureMutation, work: () => Promise<T>) {
  return storage.run(mutation, work);
}

/** The mutation of the request running now, while its answer has not gone out. */
export function currentStructureMutation() {
  const mutation = storage.getStore();
  return mutation && !mutation.closed ? mutation : undefined;
}

type ReceiptDb = Pick<Prisma.TransactionClient, 'structureMutationReceipt'>;

/**
 * Inside the Structure transaction: the receipt of the request's mutation
 * becomes COMMITTED with it. The first transaction of the request takes the
 * mutation; one that locked several projects breaks its contract and fails.
 * The claim must still be this request's, or nothing is written.
 */
export async function commitStructureMutation(db: ReceiptDb, projectIds: string[], versionOf: (projectId: string) => bigint) {
  const mutation = currentStructureMutation();
  if (!mutation || mutation.committed || mutation.pendingCommitVersion !== null || projectIds.length === 0) return;
  if (projectIds.length !== 1) throw new Error('A Structure mutation writes one project');
  const [projectId] = projectIds as [string];
  if (mutation.projectId && mutation.projectId !== projectId) throw new Error('A Structure mutation writes one project');
  const version = versionOf(projectId);
  const updated = await db.structureMutationReceipt.updateMany({
    where: { userId: mutation.userId, mutationId: mutation.mutationId, state: 'IN_PROGRESS', claimToken: mutation.claimToken },
    data: { state: 'COMMITTED', projectId, commitVersion: version },
  });
  if (updated.count !== 1) throw new Error('The mutation is no longer claimed by this request');
  mutation.projectId = projectId;
  mutation.pendingCommitVersion = version;
}

/** The project a mutation's transaction locked; a second project in the same mutation is refused. */
export function noteStructureMutationProject(projectId: string) {
  const mutation = currentStructureMutation();
  if (!mutation || mutation.committed || mutation.pendingCommitVersion !== null) return;
  if (mutation.projectId && mutation.projectId !== projectId) throw new Error('A Structure mutation writes one project');
  mutation.projectId = projectId;
}

/** After the transaction finished: a receipt it committed now stands. */
export function confirmStructureMutationCommit() {
  const mutation = currentStructureMutation();
  if (!mutation || mutation.pendingCommitVersion === null || mutation.committed) return;
  mutation.committed = true;
  mutation.commitVersion = mutation.pendingCommitVersion;
}

/** A transaction that failed: a commit it noted did not happen. */
export function forgetStructureMutationCommit() {
  const mutation = currentStructureMutation();
  if (mutation && !mutation.committed) mutation.pendingCommitVersion = null;
}

/** The same JSON whatever the order of its keys. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function mutationPayloadHash(method: string, path: string, body: unknown) {
  return createHash('sha256').update(`${method.toUpperCase()} ${path} ${canonicalJson(body ?? null)}`).digest('hex');
}

type Receipt = {
  userId: string;
  mutationId: string;
  projectId: string | null;
  payloadHash: string;
  state: string;
  claimToken: string;
  commitVersion: bigint | null;
  outcome: Prisma.JsonValue;
  outcomeComplete: boolean;
};

type StoredOutcome = { status: number; body: unknown; headers: Record<string, string> };

type Claim =
  | { kind: 'owner'; claimToken: string }
  | { kind: 'done'; receipt: Receipt }
  | { kind: 'reused' }
  | { kind: 'busy' };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Claims a mutation for this request, or learns how it ended: a new one is
 * inserted as IN_PROGRESS; a finished one is answered again; a running one is
 * waited for; a claim left by a dead request is taken over with a new token.
 */
async function claimMutation(
  db: typeof prisma,
  key: { userId: string; mutationId: string },
  data: { method: string; path: string; payloadHash: string; baseVersion: bigint | null },
  options: { waitMs: number; staleMs: number },
): Promise<Claim> {
  const deadline = Date.now() + options.waitMs;
  for (;;) {
    const claimToken = randomUUID();
    const inserted = await db.structureMutationReceipt.createMany({
      data: [{ ...key, ...data, state: 'IN_PROGRESS', claimToken }],
      skipDuplicates: true,
    });
    if (inserted.count === 1) return { kind: 'owner', claimToken };
    const receipt = await db.structureMutationReceipt.findUnique({ where: { userId_mutationId: key } });
    // Released meanwhile (its request failed): try to claim it again.
    if (!receipt) continue;
    if (receipt.payloadHash !== data.payloadHash) return { kind: 'reused' };
    if (receipt.state !== 'IN_PROGRESS') return { kind: 'done', receipt };
    const taken = await db.structureMutationReceipt.updateMany({
      where: { ...key, state: 'IN_PROGRESS', claimToken: receipt.claimToken, claimedAt: { lt: new Date(Date.now() - options.staleMs) } },
      data: { claimToken, claimedAt: new Date() },
    });
    if (taken.count === 1) return { kind: 'owner', claimToken };
    if (Date.now() >= deadline) return { kind: 'busy' };
    await sleep(250);
  }
}

function storedOutcome(value: Prisma.JsonValue): StoredOutcome | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const outcome = value as Record<string, unknown>;
  if (typeof outcome.status !== 'number') return null;
  const headers = outcome.headers && typeof outcome.headers === 'object' && !Array.isArray(outcome.headers) ? (outcome.headers as Record<string, string>) : {};
  return { status: outcome.status, body: outcome.body ?? null, headers };
}

function busy(res: Response) {
  res.status(503).json({ error: 'Изменение ещё выполняется, повторите позже', code: 'MUTATION_IN_PROGRESS', retryable: true });
}

type Answer = { status: number; headers: Record<string, string>; body: unknown };

/**
 * The answer to a finished mutation sent again, for whoever may still read its
 * project: the answer it got; or, when that was not kept whole, the part kept
 * (without the Structure's changes) or its version alone, marked incomplete so
 * the page catches up through the journal.
 */
async function replayAnswer(req: Request, receipt: Receipt, canRead: (req: Request, projectId: string) => Promise<boolean>): Promise<Answer> {
  if (receipt.projectId && !(await canRead(req, receipt.projectId))) {
    return { status: 404, headers: {}, body: { error: 'Проект не найден', code: 'NOT_FOUND' } };
  }
  const replayed = { 'X-PMS-Mutation-Replayed': '1' };
  const outcome = storedOutcome(receipt.outcome);
  if (receipt.state === 'COMMITTED') {
    const version = String(receipt.commitVersion ?? '');
    if (receipt.outcomeComplete && outcome) {
      return { status: outcome.status, headers: { ...outcome.headers, ...replayed, 'X-PMS-Structure-Version': version }, body: outcome.body };
    }
    const { 'X-PMS-Structure': _delta, ...kept } = outcome?.headers ?? {};
    return {
      status: outcome?.status ?? 200,
      headers: { ...kept, ...replayed, 'X-PMS-Structure-Version': version, 'X-PMS-Mutation-Incomplete': '1', 'X-PMS-Structure-Project': receipt.projectId ?? '' },
      body: outcome ? withoutStructureDelta(outcome.body) : { replayed: true, incomplete: true, projectId: receipt.projectId, structureVersion: version },
    };
  }
  if (!outcome) return { status: 503, headers: {}, body: { error: 'Изменение ещё выполняется, повторите позже', code: 'MUTATION_IN_PROGRESS', retryable: true } };
  return { status: outcome.status, headers: { ...outcome.headers, ...replayed }, body: outcome.body };
}

async function answerAgain(req: Request, res: Response, receipt: Receipt, canRead: (req: Request, projectId: string) => Promise<boolean>) {
  const answer = await replayAnswer(req, receipt, canRead);
  for (const [name, value] of Object.entries(answer.headers)) res.setHeader(name, value);
  res.status(answer.status).json(answer.body);
}

function parseBody(chunk: unknown, res: Response) {
  if (chunk === undefined || chunk === null) return { body: null, bytes: 0 };
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : typeof chunk === 'string' ? chunk : null;
  if (text === null) return { body: null, bytes: Infinity };
  const type = String(res.getHeader('Content-Type') ?? '');
  if (!type.includes('json') || text.length === 0) return { body: text.length === 0 ? null : text, bytes: Buffer.byteLength(text) };
  try {
    return { body: JSON.parse(text) as unknown, bytes: Buffer.byteLength(text) };
  } catch {
    return { body: text, bytes: Buffer.byteLength(text) };
  }
}

function keptHeaders(res: Response) {
  const headers: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const value = res.getHeader(name);
    if (value !== undefined) headers[name] = String(value);
  }
  return headers;
}

function withoutStructureDelta(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const { structureDelta: _changes, ...rest } = body as Record<string, unknown>;
  return rest;
}

function bodyCode(body: unknown) {
  return body && typeof body === 'object' && 'code' in body && typeof (body as { code: unknown }).code === 'string' ? (body as { code: string }).code : null;
}

/** Replaces an answer not yet sent: its status, headers, body and length. */
function replaceAnswer(res: Response, status: number, body: unknown, headers: Record<string, string> = {}) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  // The refused answer's own Structure headers do not belong to the outcome sent instead.
  for (const name of KEPT_HEADERS) res.removeHeader(name);
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', String(Buffer.byteLength(text)));
  res.removeHeader('ETag');
  return text;
}

/**
 * Settles the receipt before the answer goes out. A committed mutation stays
 * committed whatever the answer; its answer is kept when it succeeded. One that
 * did not commit is refused for good (kept, under this request's claim) or
 * released for another try. Answers what to send instead, if anything.
 */
export async function settleReceipt(db: typeof prisma, req: Request, res: Response, mutation: StructureMutation, chunk: unknown, canRead: (req: Request, projectId: string) => Promise<boolean>) {
  const key = { userId: mutation.userId, mutationId: mutation.mutationId };
  const owned = { ...key, state: 'IN_PROGRESS', claimToken: mutation.claimToken };
  let committed = mutation.committed;
  if (!committed) {
    // A transaction whose end is unknown (it threw after its commit) is judged by the receipt.
    const receipt = await db.structureMutationReceipt.findUnique({ where: { userId_mutationId: key } }).catch(() => null);
    committed = receipt?.state === 'COMMITTED' && receipt.claimToken === mutation.claimToken;
    if (committed && receipt) mutation.commitVersion = receipt.commitVersion;
  }
  const status = res.statusCode;
  if (committed) {
    if (mutation.commitVersion !== null) res.setHeader('X-PMS-Structure-Version', mutation.commitVersion.toString());
    if (status < 400) {
      const { body, bytes } = parseBody(chunk, res);
      const complete = bytes <= OUTCOME_LIMIT_BYTES;
      // A large answer is kept without the Structure's changes: a repeat catches up with them, the rest (the row made, counts) stays.
      const kept = complete ? body : withoutStructureDelta(body);
      const keptBytes = complete ? bytes : Buffer.byteLength(JSON.stringify(kept ?? null));
      await db.structureMutationReceipt.updateMany({
        where: { ...key, state: 'COMMITTED', claimToken: mutation.claimToken },
        data: keptBytes <= OUTCOME_LIMIT_BYTES
          ? { outcome: { status, body: kept, headers: keptHeaders(res) } as Prisma.InputJsonValue, outcomeComplete: complete }
          : { outcomeComplete: false },
      }).catch(() => undefined);
    }
    return null;
  }
  const { body } = parseBody(chunk, res);
  const code = bodyCode(body);
  if (TERMINAL_STATUSES.has(status) && !code?.startsWith('MUTATION_')) {
    try {
      const updated = await db.structureMutationReceipt.updateMany({
        where: owned,
        data: { state: 'TERMINAL', projectId: mutation.projectId, outcome: { status, body, headers: keptHeaders(res) } as Prisma.InputJsonValue, outcomeComplete: true },
      });
      if (updated.count === 1) return null;
      // Another request took the claim: its outcome is the mutation's, answered as any repeat.
      const receipt = await db.structureMutationReceipt.findUnique({ where: { userId_mutationId: key } });
      if (receipt && receipt.state !== 'IN_PROGRESS') {
        const answer = await replayAnswer(req, receipt, canRead);
        return replaceAnswer(res, answer.status, answer.body, answer.headers);
      }
    } catch {
      // Falls through: the refusal is not recorded, so it is not sent as final.
    }
    return replaceAnswer(res, 503, { error: 'Не удалось сохранить результат изменения, повторите', code: 'MUTATION_IN_PROGRESS', retryable: true });
  }
  await db.structureMutationReceipt.deleteMany({ where: owned }).catch(() => undefined);
  return null;
}

/**
 * Makes the Structure writes above idempotent by the X-PMS-Mutation-Id header:
 * runs before write checks (a repeat of a finished write only reads its outcome,
 * still to someone who may read the project) and settles the receipt in the
 * last wrapper of the answer, after the schedule shift journal named its headers.
 */
export function structureMutationMiddleware(options: {
  db?: typeof prisma;
  canRead?: (req: Request, projectId: string) => Promise<boolean>;
  waitMs?: number;
  staleMs?: number;
} = {}): RequestHandler {
  const db = options.db ?? prisma;
  const canRead = options.canRead ?? userCanReadProject;
  const waitMs = options.waitMs ?? MUTATION_WAIT_MS;
  const staleMs = options.staleMs ?? MUTATION_STALE_CLAIM_MS;
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('x-pms-mutation-id');
    if (!header || !isStructureMutationRoute(req.method, req.path)) {
      next();
      return;
    }
    if (!MUTATION_ID.test(header)) {
      res.status(400).json({ error: 'Неверный идентификатор изменения', code: 'MUTATION_ID_INVALID' });
      return;
    }
    const user = currentUser(req);
    if (!user) {
      next();
      return;
    }
    // A write kept on a device for one person is not run under another's session (signed in in another tab).
    const expected = req.get('x-pms-expected-user');
    if (expected && expected !== user.id) {
      res.status(401).json({ error: 'Изменение сделано другим пользователем: войдите под ним, чтобы отправить его', code: 'SESSION_USER_MISMATCH' });
      return;
    }
    const base = req.get('x-pms-base-version');
    const key = { userId: user.id, mutationId: header.toLowerCase() };
    void (async () => {
      const claim = await claimMutation(db, key, {
        method: req.method.toUpperCase(),
        path: req.path,
        payloadHash: mutationPayloadHash(req.method, req.path, req.body),
        baseVersion: base && VERSION.test(base) ? BigInt(base) : null,
      }, { waitMs, staleMs });
      if (claim.kind === 'reused') {
        res.status(409).json({ error: 'Идентификатор изменения уже использован для другого запроса', code: 'MUTATION_ID_REUSED' });
        return;
      }
      if (claim.kind === 'busy') {
        busy(res);
        return;
      }
      if (claim.kind === 'done') {
        await answerAgain(req, res, claim.receipt, canRead);
        return;
      }
      const mutation: StructureMutation = {
        ...key,
        claimToken: claim.claimToken,
        projectId: null,
        committed: false,
        commitVersion: null,
        pendingCommitVersion: null,
        closed: false,
      };
      const end = res.end.bind(res) as (...args: unknown[]) => Response;
      let ending = false;
      res.end = ((...args: unknown[]) => {
        if (ending) return end(...args);
        ending = true;
        const chunk = typeof args[0] === 'function' ? undefined : args[0];
        void settleReceipt(db, req, res, mutation, chunk, canRead)
          .catch(() => null)
          .then((replacement) => {
            mutation.closed = true;
            if (replacement === null) end(...args);
            else end(replacement);
          });
        return res;
      }) as Response['end'];
      storage.run(mutation, next);
    })().catch(next);
  };
}

/** Forgets receipts past the journal's retention, and claims no request holds any longer. */
export async function pruneStructureMutationReceipts(now = new Date(), retentionDays = 30, db: typeof prisma = prisma) {
  const finished = await db.structureMutationReceipt.deleteMany({
    where: { state: { in: ['COMMITTED', 'TERMINAL'] }, createdAt: { lt: new Date(now.getTime() - retentionDays * 86_400_000) } },
  });
  const abandoned = await db.structureMutationReceipt.deleteMany({
    where: { state: 'IN_PROGRESS', claimedAt: { lt: new Date(now.getTime() - 86_400_000) } },
  });
  return finished.count + abandoned.count;
}
