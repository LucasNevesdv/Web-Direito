// Explicit local verification; *.check.ts is excluded from Vitest's default suite.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '../../src/database.js';
import { Office } from '../../src/domain/offices/office.js';
import { loadEnvironment } from '../../src/environment.js';
import { PrismaOfficesRepository } from '../../src/infrastructure/prisma/prisma-offices-repository.js';

function snapshot(office: Office) {
  return {
    id: office.id,
    name: office.name,
    status: office.status,
    createdAt: office.createdAt,
    updatedAt: office.updatedAt,
  };
}

function reportFailure(phase: string, error: unknown): void {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'UNKNOWN';
  console.error(JSON.stringify({
    phase,
    ok: false,
    code: /^(P\d{4}|ERR_ASSERTION|INVALID_OFFICE)$/.test(code) ? code : 'UNKNOWN',
  }));
  process.exitCode = 1;
}

const testId = randomUUID();
const testName = `TASK-003 repository verification ${testId}`;
let prisma: ReturnType<typeof createPrismaClient> | undefined;
let cleanupRequired = false;

try {
  const environment = loadEnvironment();
  prisma = createPrismaClient(environment.DATABASE_URL);
  const repository = new PrismaOfficesRepository(prisma);
  assert.equal(await repository.findById(testId), null);

  const office = Office.create({ id: testId, name: `  ${testName}  ` });
  // Claim cleanup only after confirming the ID was not present before this run.
  cleanupRequired = true;
  const saved = await repository.create(office);
  assert.ok(saved instanceof Office);
  assert.deepEqual(snapshot(saved), snapshot(office));

  const found = await repository.findById(testId);
  assert.ok(found instanceof Office);
  assert.deepEqual(snapshot(found), snapshot(office));
  const stored = await prisma.office.findUnique({ where: { id: testId } });
  assert.deepEqual(stored, snapshot(office));
  console.log(JSON.stringify({ phase: 'office_repository_round_trip', ok: true }));
} catch (error) {
  reportFailure('office_repository_round_trip', error);
} finally {
  if (prisma) {
    try {
      if (cleanupRequired) {
        // This deliberately bypasses the application contract: deletion exists
        // only to remove this verification's own record, never as a product API.
        const deleted = await prisma.office.deleteMany({
          where: { id: testId, name: testName },
        });
        const remaining = await prisma.office.count({
          where: { OR: [{ id: testId }, { name: testName }] },
        });
        assert.equal(remaining, 0);
        console.log(JSON.stringify({
          phase: 'verification_record_cleanup',
          ok: true,
          removed: deleted.count,
          remaining,
        }));
      }
    } catch (error) {
      reportFailure('verification_record_cleanup', error);
    } finally {
      try {
        await prisma.$disconnect();
        console.log(JSON.stringify({ phase: 'prisma_disconnect', ok: true }));
      } catch (error) {
        reportFailure('prisma_disconnect', error);
      }
    }
  }
}
