// Opt-in verification against the configured local PostgreSQL, outside Vitest.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { RegisterOfficeWithOwner } from '../../src/application/onboarding/register-office-with-owner.js';
import type { OfficeRegistrationRepository } from '../../src/application/onboarding/office-registration-repository.js';
import { createPrismaClient, createPrismaHealthChecker } from '../../src/database.js';
import { loadEnvironment } from '../../src/environment.js';
import { PrismaOfficeRegistrationRepository } from '../../src/infrastructure/prisma/prisma-office-registration-repository.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2-password-hasher.js';

const runId = randomUUID();
const scenarios = ['success', 'rollback', 'race-one', 'race-two'];
const officeNames = scenarios.map((scenario) => `RF001 verification ${runId} ${scenario}`);
const emails = ['success', 'rollback', 'race'].map((scenario) => `rf001-${runId}-${scenario}@example.invalid`);
const secret = `${randomUUID()}${randomUUID()}`;
const apps: FastifyInstance[] = [];
let prisma: ReturnType<typeof createPrismaClient> | undefined;
let ownsRecords = false;
let phase = 'connect';

function report(phase: string, values: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ phase, ok: true, ...values }));
}

function fail(phase: string): void {
  // Never print arbitrary errors, request bodies, stored hashes or connection URLs.
  console.error(JSON.stringify({ phase, ok: false }));
  process.exitCode = 1;
}

async function listen(app: FastifyInstance): Promise<string> {
  apps.push(app);
  return app.listen({ host: '127.0.0.1', port: 0 });
}

async function register(base: string, officeName: string, email: string) {
  const response = await fetch(`${base}/api/v1/onboarding`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ officeName, adminName: '  Local Verification  ', email, password: secret }),
  });
  const text = await response.text();
  assert.equal(text.includes(secret), false);
  assert.equal(text.includes('passwordHash'), false);
  assert.equal(text.includes('password_hash'), false);
  assert.equal(text.includes('$argon2'), false);
  return { status: response.status, body: JSON.parse(text) };
}

try {
  prisma = createPrismaClient(loadEnvironment().DATABASE_URL);
  await prisma.$queryRaw`SELECT 1`;
  assert.equal(await prisma.office.count({ where: { name: { in: officeNames } } }), 0);
  assert.equal(await prisma.user.count({ where: { email: { in: emails } } }), 0);
  ownsRecords = true;
  const hasher = new Argon2PasswordHasher();
  const repository = new PrismaOfficeRegistrationRepository(prisma);
  const checker = createPrismaHealthChecker(prisma);
  const base = await listen(buildApp(checker, new RegisterOfficeWithOwner(repository, hasher)));

  phase = 'real_http_onboarding';
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/ready`)).status, 200);
  const success = await register(base, `  ${officeNames[0]}  `, `  ${emails[0].toUpperCase()}  `);
  assert.equal(success.status, 201);
  assert.deepEqual(Object.keys(success.body).sort(), ['office', 'role', 'user']);
  assert.deepEqual(Object.keys(success.body.user).sort(), ['email', 'id', 'name']);
  assert.equal(success.body.role, 'OWNER');
  const office = await prisma.office.findUniqueOrThrow({ where: { id: success.body.office.id } });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: emails[0] } });
  const membership = await prisma.membership.findUniqueOrThrow({
    where: { officeId_userId: { officeId: office.id, userId: user.id } },
  });
  assert.equal(office.name, officeNames[0]);
  assert.equal(office.status, 'ACTIVE');
  assert.equal(office.createdAt.toISOString(), success.body.office.createdAt);
  assert.equal(office.updatedAt.toISOString(), success.body.office.updatedAt);
  assert.equal(user.name, 'Local Verification');
  assert.equal(user.status, 'ACTIVE');
  assert.equal(user.id, success.body.user.id);
  assert.equal(membership.role, 'OWNER');
  assert.equal(await hasher.verify(user.passwordHash, secret), true);
  assert.equal(user.passwordHash.includes(secret), false);
  assert.equal((await register(base, officeNames[0], emails[0])).status, 409);
  assert.equal((await register(base, 'x', emails[0])).status, 400);
  report(phase, { created: 201, duplicate: 409, invalid: 400, health: 200, ready: 200, hashVerified: true });

  phase = 'rollback_after_office_and_user';
  let officeWritten = false;
  let userWritten = false;
  let membershipAttempted = false;
  // Extension faults only the verification client, after real transactional writes.
  const failingClient = prisma.$extends({
    query: {
      office: { async create({ args, query }) {
        const result = await query(args);
        officeWritten = true;
        return result;
      } },
      user: { async create({ args, query }) {
        const result = await query(args);
        userWritten = true;
        return result;
      } },
      membership: { async create() {
        membershipAttempted = true;
        throw new Error('Controlled membership failure for rollback verification');
      } },
    },
  });
  const failingBase = await listen(buildApp(checker, new RegisterOfficeWithOwner(
    new PrismaOfficeRegistrationRepository(failingClient), hasher,
  )));
  const rolledBack = await register(failingBase, officeNames[1], emails[1]);
  assert.equal(rolledBack.status, 500);
  assert.equal(JSON.stringify(rolledBack.body).includes('Controlled membership'), false);
  assert.ok(officeWritten && userWritten && membershipAttempted);
  assert.equal(await prisma.office.count({ where: { name: officeNames[1] } }), 0);
  assert.equal(await prisma.user.count({ where: { email: emails[1] } }), 0);
  assert.equal(await prisma.membership.count({
    where: { OR: [{ office: { name: officeNames[1] } }, { user: { email: emails[1] } }] },
  }), 0);
  report(phase, { officeWritten, userWritten, membershipAttempted, remaining: 0 });

  phase = 'concurrent_email_uniqueness';
  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const racingRepository: OfficeRegistrationRepository = {
    async emailExists(email) {
      const exists = await repository.emailExists(email);
      arrivals += 1;
      if (arrivals === 2) release();
      // Bound the verification rendezvous if one concurrent request fails early.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          barrier,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Verification barrier timed out')), 10000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      return exists;
    },
    register: (data) => repository.register(data),
  };
  const racingBase = await listen(buildApp(checker, new RegisterOfficeWithOwner(racingRepository, hasher)));
  const raced = await Promise.all([
    register(racingBase, officeNames[2], emails[2]),
    register(racingBase, officeNames[3], emails[2]),
  ]);
  assert.deepEqual(raced.map(({ status }) => status).sort(), [201, 409]);
  assert.equal(await prisma.user.count({ where: { email: emails[2] } }), 1);
  assert.equal(await prisma.office.count({ where: { name: { in: officeNames.slice(2) } } }), 1);
  assert.equal(await prisma.membership.count({ where: { user: { email: emails[2] } } }), 1);
  report(phase, { statuses: [201, 409], offices: 1, users: 1, memberships: 1 });
} catch {
  fail(phase);
} finally {
  for (const app of apps) {
    try { await app.close(); } catch { fail('close_verification_app'); }
  }
  if (prisma) {
    try {
      if (ownsRecords) {
        await prisma.$transaction(async (transaction) => {
          await transaction.membership.deleteMany({
            where: { OR: [{ office: { name: { in: officeNames } } }, { user: { email: { in: emails } } }] },
          });
          await transaction.user.deleteMany({ where: { email: { in: emails } } });
          await transaction.office.deleteMany({ where: { name: { in: officeNames } } });
        });
        const remaining = await prisma.office.count({ where: { name: { in: officeNames } } })
          + await prisma.user.count({ where: { email: { in: emails } } })
          + await prisma.membership.count({
            where: { OR: [{ office: { name: { in: officeNames } } }, { user: { email: { in: emails } } }] },
          });
        assert.equal(remaining, 0);
        report('temporary_records_cleanup', { remaining });
      }
    } catch {
      fail('temporary_records_cleanup');
    } finally {
      try { await prisma.$disconnect(); report('disconnect'); } catch { fail('disconnect'); }
    }
  }
}
