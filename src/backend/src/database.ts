import { PrismaClient } from '@prisma/client';
import type { DatabaseHealthChecker } from './database-health-checker.js';

const CONNECTION_TIMEOUT_SECONDS = 5;
const POOL_TIMEOUT_SECONDS = 5;
const SOCKET_TIMEOUT_SECONDS = 10;

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const url = new URL(databaseUrl);
  // Enforce finite waits even when the supplied URL disables a timeout with 0.
  url.searchParams.set('connect_timeout', String(CONNECTION_TIMEOUT_SECONDS));
  url.searchParams.set('pool_timeout', String(POOL_TIMEOUT_SECONDS));
  url.searchParams.set('socket_timeout', String(SOCKET_TIMEOUT_SECONDS));

  return new PrismaClient({
    datasources: { db: { url: url.toString() } },
  });
}

export function createPrismaHealthChecker(
  prisma: PrismaClient,
): DatabaseHealthChecker {
  return {
    async check(): Promise<void> {
      await prisma.$transaction(
        async (transaction) => {
          // PostgreSQL cancels the statement; SET LOCAL ends with the transaction.
          await transaction.$executeRaw`SET LOCAL statement_timeout = '5s'`;
          await transaction.$queryRaw`SELECT 1`;
        },
        { maxWait: POOL_TIMEOUT_SECONDS * 1000, timeout: 10000 },
      );
    },
  };
}
