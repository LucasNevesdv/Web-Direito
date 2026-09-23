import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InvalidSessionError, Session } from '../../src/domain/sessions/session.js';

const create = () => Session.create({ userId: randomUUID(), activeOfficeId: randomUUID(), refreshTokenHash: 'a'.repeat(64), now: new Date(1000), expiresAt: new Date(10000) });

describe('Session', () => {
  it('defines UUID and dates, protects its state and does not serialize the digest implicitly', () => {
    const session = create();
    expect(session.id).toMatch(/^[a-f\d-]{36}$/);
    const state = session.toPersistence();
    state.expiresAt.setTime(0);
    expect(session.expiresAt.getTime()).toBe(10000);
    expect(JSON.stringify(session)).toBe('{}');
    expect(session.isActive(new Date(9999))).toBe(true);
    expect(session.isActive(new Date(10000))).toBe(false);
  });
  it.each([
    ['id', 'invalid'], ['userId', 'invalid'], ['activeOfficeId', 'invalid'],
    ['refreshTokenHash', 'raw-refresh-token'], ['createdAt', new Date('invalid')],
    ['expiresAt', new Date(1000)], ['updatedAt', new Date(0)],
    ['revokedAt', new Date(0)], ['lastUsedAt', new Date(0)],
  ])('rejects invalid %s', (field, value) => {
    expect(() => Session.restore({ ...create().toPersistence(), [field]: value })).toThrow(InvalidSessionError);
  });
});
