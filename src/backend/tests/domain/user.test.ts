import { describe, expect, it } from 'vitest';
import { InvalidUserError } from '../../src/domain/users/invalid-user-error.js';
import { User } from '../../src/domain/users/user.js';

const validInput = { name: 'Ana Silva', email: 'ana@example.test', passwordHash: 'test-only-opaque-hash' };
const persistedUser = {
  ...validInput,
  id: '68f762ad-c1cb-4a39-b8da-b0504f358cdd',
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-01-01T12:00:00Z'),
  updatedAt: new Date('2026-01-02T12:00:00Z'),
};

describe('User', () => {
  it('creates an active user with a UUID and dates', () => {
    const before = Date.now();
    const user = User.create(validInput);
    expect(user.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(user.status).toBe('ACTIVE');
    expect(user.name).toBe(validInput.name);
    expect(user.email).toBe(validInput.email);
    expect(user.passwordHash).toBe(validInput.passwordHash);
    expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(user.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(user.updatedAt).toEqual(user.createdAt);
  });

  it('trims names and canonicalizes the email', () => {
    const user = User.create({ ...validInput, name: '  Ana  Silva\n', email: '  ANA+LEGAL@EXAMPLE.TEST  ' });
    expect(user.name).toBe('Ana  Silva');
    expect(user.email).toBe('ana+legal@example.test');
  });

  it.each(['AB', 'a'.repeat(120), '😀'.repeat(120)])('accepts name limits in characters', (name) => {
    expect(User.create({ ...validInput, name }).name).toBe(name);
  });

  it.each(['', '   ', 'A', 'a'.repeat(121), undefined, null, 123])('rejects invalid names', (name) => {
    expect(() => User.create({ ...validInput, name: name as string }))
      .toThrowError(new InvalidUserError('name'));
  });

  it.each([
    '', ' ', 'invalid', 'ana@', '@example.test', 'a@localhost', 'a b@example.test',
    'a@@example.test', '.a@example.test', 'a.@example.test', 'a..b@example.test',
    'ana@-example.test', 'ana@example-.test', 'ana@example..test', 'ana@example.1',
    `${'a'.repeat(65)}@example.test`, `ana@${'a'.repeat(64)}.test`,
    `ana@${['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(63)].join('.')}.test`,
    undefined, null, 123,
  ])('rejects malformed email addresses', (email) => {
    expect(() => User.create({ ...validInput, email: email as string }))
      .toThrowError(new InvalidUserError('email'));
  });

  it.each(['', '  ', undefined, null, 123])('rejects missing or invalid hash values', (passwordHash) => {
    expect(() => User.create({ ...validInput, passwordHash: passwordHash as string }))
      .toThrowError(new InvalidUserError('passwordHash'));
  });

  it('restores identity and dates without exposing the hash in automatic serialization', () => {
    const user = User.restore(persistedUser);
    expect(user.id).toBe(persistedUser.id);
    expect(user.createdAt).toEqual(persistedUser.createdAt);
    expect(user.updatedAt).toEqual(persistedUser.updatedAt);
    expect(Object.keys(user)).not.toContain('passwordHash');
    expect(JSON.stringify(user)).not.toContain(persistedUser.passwordHash);
  });

  it.each([
    { field: 'id', value: 'bad-id' },
    { field: 'status', value: 'INACTIVE' },
    { field: 'createdAt', value: new Date('invalid') },
    { field: 'createdAt', value: '2026-01-01' },
    { field: 'updatedAt', value: new Date('invalid') },
    { field: 'updatedAt', value: new Date('2025-01-01') },
  ] as const)('rejects invalid restored $field', ({ field, value }) => {
    expect(() => User.restore({ ...persistedUser, [field]: value }))
      .toThrowError(new InvalidUserError(field));
  });

  it('defends dates against mutation', () => {
    const createdAt = new Date(persistedUser.createdAt);
    const updatedAt = new Date(persistedUser.updatedAt);
    const user = User.restore({ ...persistedUser, createdAt, updatedAt });
    createdAt.setTime(0);
    updatedAt.setTime(0);
    user.createdAt.setTime(0);
    user.updatedAt.setTime(0);
    expect(user.createdAt).toEqual(persistedUser.createdAt);
    expect(user.updatedAt).toEqual(persistedUser.updatedAt);
  });

  it('returns only the field identifier in invalid-input errors', () => {
    const invalidEmail = 'private-invalid-value';
    expect(() => User.create({ ...validInput, email: invalidEmail }))
      .toThrowError(new InvalidUserError('email'));
    expect(new InvalidUserError('email')).toMatchObject({
      code: 'INVALID_USER', field: 'email', message: 'Invalid user field: email',
    });
  });
});
