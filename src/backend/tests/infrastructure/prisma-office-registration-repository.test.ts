import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { EmailAlreadyRegisteredError } from '../../src/application/onboarding/email-already-registered-error.js';
import { Membership } from '../../src/domain/memberships/membership.js';
import { Office } from '../../src/domain/offices/office.js';
import { User } from '../../src/domain/users/user.js';
import { PrismaOfficeRegistrationRepository } from '../../src/infrastructure/prisma/prisma-office-registration-repository.js';

function setup() {
  const writes: string[] = [];
  const officeCreate = vi.fn(async () => { writes.push('office'); return {}; });
  const userCreate = vi.fn(async () => { writes.push('user'); return {}; });
  const membershipCreate = vi.fn(async () => { writes.push('membership'); return {}; });
  const transaction = {
    office: { create: officeCreate },
    user: { create: userCreate },
    membership: { create: membershipCreate },
  } as unknown as Prisma.TransactionClient;
  const runTransaction = vi.fn(async (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(transaction));
  const findUnique = vi.fn<() => Promise<{ id: string } | null>>().mockResolvedValue(null);
  const client = {
    user: { findUnique },
    $transaction: runTransaction,
  } as unknown as ConstructorParameters<typeof PrismaOfficeRegistrationRepository>[0];
  const office = Office.create({ name: 'Escritório Exemplo' });
  const user = User.create({ name: 'Ana Silva', email: 'ana@example.test', passwordHash: 'opaque-test-hash' });
  const membership = Membership.create({ officeId: office.id, userId: user.id });
  return {
    repository: new PrismaOfficeRegistrationRepository(client),
    registration: { office, user, membership },
    findUnique, runTransaction, officeCreate, userCreate, membershipCreate, writes,
  };
}

function knownError(code: string, target?: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Database operation failed', {
    code,
    clientVersion: Prisma.prismaVersion.client,
    meta: target === undefined ? undefined : { target },
  });
}

describe('PrismaOfficeRegistrationRepository', () => {
  it.each([false, true])('checks global email existence selecting only the public identifier', async (exists) => {
    const { repository, findUnique } = setup();
    findUnique.mockResolvedValue(exists ? { id: 'user-id' } : null);
    await expect(repository.emailExists('ana@example.test')).resolves.toBe(exists);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'ana@example.test' }, select: { id: true } });
  });

  it('writes office, user hash and OWNER membership in one bounded transaction', async () => {
    const { repository, registration, runTransaction, officeCreate, userCreate, membershipCreate, writes } = setup();
    const { office, user, membership } = registration;
    await expect(repository.register(registration)).resolves.toBeUndefined();
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 5000, timeout: 10000 });
    expect(writes).toEqual(['office', 'user', 'membership']);
    expect(officeCreate).toHaveBeenCalledTimes(1);
    expect(officeCreate).toHaveBeenCalledWith({ data: {
      id: office.id, name: office.name, status: office.status,
      createdAt: office.createdAt, updatedAt: office.updatedAt,
    } });
    expect(userCreate).toHaveBeenCalledTimes(1);
    expect(userCreate).toHaveBeenCalledWith({
      data: {
        id: user.id, name: user.name, email: user.email,
        passwordHash: user.passwordHash, status: user.status,
        createdAt: user.createdAt, updatedAt: user.updatedAt,
      },
      select: { id: true },
    });
    expect(membershipCreate).toHaveBeenCalledTimes(1);
    expect(membershipCreate).toHaveBeenCalledWith({ data: {
      id: membership.id, officeId: office.id, userId: user.id,
      role: 'OWNER', createdAt: membership.createdAt,
    } });
  });

  it('translates a database email uniqueness conflict to the predictable application error', async () => {
    const { repository, registration, userCreate, membershipCreate } = setup();
    userCreate.mockRejectedValueOnce(knownError('P2002', ['email']));
    await expect(repository.register(registration)).rejects.toThrowError(new EmailAlreadyRegisteredError());
    expect(membershipCreate).not.toHaveBeenCalled();
  });

  it.each([
    knownError('P2002', ['id']),
    knownError('P2002', ['office_id', 'user_id']),
    knownError('P2002', 'users_email_key'),
    knownError('P2002'),
    knownError('P2003', ['email']),
    { code: 'P2002', meta: { target: ['email'] } },
    new Error('Unclassified infrastructure failure'),
  ])('preserves unrelated or unrecognized persistence failures', async (error) => {
    const { repository, registration, runTransaction } = setup();
    runTransaction.mockRejectedValueOnce(error);
    await expect(repository.register(registration)).rejects.toBe(error);
  });

  it.each(['office', 'user', 'membership'] as const)('propagates a failure during the %s write without continuing', async (stage) => {
    const { repository, registration, officeCreate, userCreate, membershipCreate, writes } = setup();
    const error = new Error('Write failed');
    const failingWrite = { office: officeCreate, user: userCreate, membership: membershipCreate }[stage];
    failingWrite.mockRejectedValueOnce(error);
    await expect(repository.register(registration)).rejects.toBe(error);
    expect(writes).toEqual({ office: [], user: ['office'], membership: ['office', 'user'] }[stage]);
    if (stage === 'office') {
      expect(userCreate).not.toHaveBeenCalled();
    }
    if (stage !== 'membership') {
      expect(membershipCreate).not.toHaveBeenCalled();
    }
  });

  it('propagates errors during the email lookup', async () => {
    const { repository, findUnique, runTransaction } = setup();
    const error = new Error('Database unavailable');
    findUnique.mockRejectedValueOnce(error);
    await expect(repository.emailExists('ana@example.test')).rejects.toBe(error);
    expect(runTransaction).not.toHaveBeenCalled();
  });
});
