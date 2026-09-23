import { describe, expect, it, vi } from 'vitest';
import { EmailAlreadyRegisteredError } from '../../src/application/onboarding/email-already-registered-error.js';
import { InvalidRegistrationError } from '../../src/application/onboarding/invalid-registration-error.js';
import { RegisterOfficeWithOwner } from '../../src/application/onboarding/register-office-with-owner.js';
import type { PasswordHasher } from '../../src/application/security/password-hasher.js';
import { InMemoryOfficeRegistrationRepository } from '../support/in-memory-office-registration-repository.js';

const input = {
  officeName: 'Escritório Exemplo',
  adminName: 'Ana Silva',
  email: 'ana@example.test',
  password: 'temporary-unit-password',
};

function setup() {
  const repository = new InMemoryOfficeRegistrationRepository();
  const opaqueHash = 'opaque-hasher-output';
  const hasher: PasswordHasher = {
    hash: vi.fn(async () => opaqueHash),
    verify: vi.fn(async (hash, password) => hash === opaqueHash && password === input.password),
  };
  return { repository, hasher, opaqueHash, useCase: new RegisterOfficeWithOwner(repository, hasher) };
}

describe('RegisterOfficeWithOwner', () => {
  it('persists the office, active user and OWNER membership as one registration', async () => {
    const { repository, hasher, opaqueHash, useCase } = setup();
    const result = await useCase.execute(input);
    expect(repository.registrations).toHaveLength(1);
    const { office, user, membership } = repository.registrations[0];
    expect(office.name).toBe(input.officeName);
    expect(office.status).toBe('ACTIVE');
    expect(user.name).toBe(input.adminName);
    expect(user.email).toBe(input.email);
    expect(user.status).toBe('ACTIVE');
    expect(membership.officeId).toBe(office.id);
    expect(membership.userId).toBe(user.id);
    expect(membership.role).toBe('OWNER');
    expect(hasher.hash).toHaveBeenCalledTimes(1);
    expect(hasher.hash).toHaveBeenCalledWith(input.password);
    expect(user.passwordHash).toBe(opaqueHash);
    expect(user.passwordHash).not.toBe(input.password);
    expect(result).toEqual({
      office: { id: office.id, name: office.name, status: office.status, createdAt: office.createdAt, updatedAt: office.updatedAt },
      user: { id: user.id, name: user.name, email: user.email },
      role: 'OWNER',
    });
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(result)).not.toContain(opaqueHash);
    expect(JSON.stringify(repository.registrations)).not.toContain(input.password);
  });

  it('normalizes names and email before checking uniqueness and persistence', async () => {
    const { repository, useCase } = setup();
    const emailExists = vi.spyOn(repository, 'emailExists');
    const result = await useCase.execute({
      ...input, officeName: '  Escritório  Exemplo\n', adminName: '\tAna Silva ', email: '  ANA@EXAMPLE.TEST ',
    });
    expect(result.office.name).toBe('Escritório  Exemplo');
    expect(result.user).toMatchObject({ name: 'Ana Silva', email: 'ana@example.test' });
    expect(emailExists).toHaveBeenCalledTimes(1);
    expect(emailExists).toHaveBeenCalledWith('ana@example.test');
  });

  it.each([
    { field: 'officeName', value: '' },
    { field: 'officeName', value: 'A' },
    { field: 'officeName', value: 'a'.repeat(121) },
    { field: 'adminName', value: ' ' },
    { field: 'adminName', value: 'A' },
    { field: 'adminName', value: 'a'.repeat(121) },
    { field: 'email', value: 'not-an-email' },
    { field: 'email', value: '' },
    { field: 'password', value: '' },
    { field: 'password', value: 'a'.repeat(11) },
    { field: 'password', value: 'a'.repeat(129) },
    { field: 'password', value: undefined },
  ] as const)('rejects invalid $field before hashing or consulting persistence', async ({ field, value }) => {
    const { repository, hasher, useCase } = setup();
    const emailExists = vi.spyOn(repository, 'emailExists');
    const register = vi.spyOn(repository, 'register');
    await expect(useCase.execute({ ...input, [field]: value }))
      .rejects.toThrowError(new InvalidRegistrationError(field));
    expect(emailExists).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(hasher.hash).not.toHaveBeenCalled();
  });

  it.each(['a'.repeat(12), 'a'.repeat(128), '😀'.repeat(12), '  twelve characters  '])(
    'accepts password limits without trimming the supplied password', async (password) => {
      const { hasher, useCase } = setup();
      await useCase.execute({ ...input, password });
      expect(hasher.hash).toHaveBeenCalledTimes(1);
      expect(hasher.hash).toHaveBeenCalledWith(password);
    },
  );

  it('rejects a previously registered email case-insensitively before hashing again', async () => {
    const { repository, hasher, useCase } = setup();
    await useCase.execute(input);
    vi.mocked(hasher.hash).mockClear();
    await expect(useCase.execute({ ...input, email: ' ANA@EXAMPLE.TEST ' }))
      .rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(repository.registrations).toHaveLength(1);
    expect(hasher.hash).not.toHaveBeenCalled();
  });

  it('propagates a uniqueness conflict detected by atomic persistence after a stale precheck', async () => {
    const { repository, useCase } = setup();
    vi.spyOn(repository, 'emailExists').mockResolvedValue(false);
    vi.spyOn(repository, 'register').mockRejectedValue(new EmailAlreadyRegisteredError());
    await expect(useCase.execute(input)).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(repository.registrations).toHaveLength(0);
  });

  it('does not persist anything if the password hasher fails', async () => {
    const { repository, hasher, useCase } = setup();
    const failure = new Error('Hasher unavailable');
    vi.mocked(hasher.hash).mockRejectedValue(failure);
    const register = vi.spyOn(repository, 'register');
    await expect(useCase.execute(input)).rejects.toBe(failure);
    expect(register).not.toHaveBeenCalled();
  });

  it('does not return an unpersisted result when registration fails', async () => {
    const { repository, useCase } = setup();
    const failure = new Error('Persistence unavailable');
    vi.spyOn(repository, 'register').mockRejectedValue(failure);
    await expect(useCase.execute(input)).rejects.toBe(failure);
    expect(repository.registrations).toHaveLength(0);
  });

  it('allows only one concurrent registration for the same canonical email', async () => {
    const { repository, useCase } = setup();
    const results = await Promise.allSettled([
      useCase.execute(input), useCase.execute({ ...input, email: ' ANA@EXAMPLE.TEST ' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ status: 'rejected', reason: new EmailAlreadyRegisteredError() });
    expect(repository.registrations).toHaveLength(1);
  });
});
