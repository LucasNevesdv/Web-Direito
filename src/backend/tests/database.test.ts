import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaClient, createPrismaHealthChecker } from '../src/database.js';

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  transaction: vi.fn(),
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock('@prisma/client', () => ({ PrismaClient: mocks.client }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockReturnValue({ $transaction: mocks.transaction });
  mocks.executeRaw.mockResolvedValue(0);
  mocks.queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  mocks.transaction.mockImplementation(
    async (callback: (transaction: object) => Promise<void>) => callback({
      $executeRaw: mocks.executeRaw,
      $queryRaw: mocks.queryRaw,
    }),
  );
});

describe('Prisma infrastructure', () => {
  it('enforces finite connection waits without changing unrelated URL options', () => {
    createPrismaClient(
      'postgresql://user:example@localhost/db?connect_timeout=0&pool_timeout=0&socket_timeout=0&schema=custom&connection_limit=2&options=-c%20search_path%3Dpublic',
    );

    const options = mocks.client.mock.calls[0][0];
    const url = new URL(options.datasources.db.url);
    expect(url.searchParams.get('connect_timeout')).toBe('5');
    expect(url.searchParams.get('pool_timeout')).toBe('5');
    expect(url.searchParams.get('socket_timeout')).toBe('10');
    expect(url.searchParams.get('schema')).toBe('custom');
    expect(url.searchParams.get('connection_limit')).toBe('2');
    expect(url.searchParams.get('options')).toBe('-c search_path=public');
  });

  it('sets a PostgreSQL statement timeout before querying in the same transaction', async () => {
    const checker = createPrismaHealthChecker(
      createPrismaClient('postgresql://localhost/db'),
    );

    await checker.check();

    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function), { maxWait: 5000, timeout: 10000 },
    );
    expect(mocks.executeRaw.mock.calls[0][0].join('')).toBe(
      "SET LOCAL statement_timeout = '5s'",
    );
    expect(mocks.queryRaw.mock.calls[0][0].join('')).toBe('SELECT 1');
    expect(mocks.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.queryRaw.mock.invocationCallOrder[0],
    );
  });

  it('does not run the query if installing its timeout fails', async () => {
    const failure = new Error('timeout setup failed');
    mocks.executeRaw.mockRejectedValue(failure);
    const checker = createPrismaHealthChecker(
      createPrismaClient('postgresql://localhost/db'),
    );

    await expect(checker.check()).rejects.toBe(failure);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it('propagates a rejected query to the application boundary', async () => {
    const failure = new Error('query cancelled');
    mocks.queryRaw.mockRejectedValue(failure);
    const checker = createPrismaHealthChecker(
      createPrismaClient('postgresql://localhost/db'),
    );

    await expect(checker.check()).rejects.toBe(failure);
  });
});
