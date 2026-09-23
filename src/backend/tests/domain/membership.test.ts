import { describe, expect, it } from 'vitest';
import { InvalidMembershipError } from '../../src/domain/memberships/invalid-membership-error.js';
import { Membership } from '../../src/domain/memberships/membership.js';

const validInput = {
  officeId: '68f762ad-c1cb-4a39-b8da-b0504f358cdd',
  userId: '795526bb-82c2-43cd-845b-589ac594e7dd',
};
const persistedMembership = {
  ...validInput,
  id: '2d917aee-8379-46a5-a6fd-a2f08077aa90',
  role: 'OWNER' as const,
  createdAt: new Date('2026-01-01T12:00:00Z'),
};

describe('Membership', () => {
  it('creates an OWNER membership with generated identity and creation date', () => {
    const before = Date.now();
    const membership = Membership.create(validInput);
    expect(membership.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(membership.officeId).toBe(validInput.officeId);
    expect(membership.userId).toBe(validInput.userId);
    expect(membership.role).toBe('OWNER');
    expect(membership.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(membership.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('canonicalizes supplied UUIDs and restores persisted fields', () => {
    const membership = Membership.restore({
      ...persistedMembership,
      id: persistedMembership.id.toUpperCase(),
      officeId: validInput.officeId.toUpperCase(),
      userId: validInput.userId.toUpperCase(),
    });
    expect(membership.id).toBe(persistedMembership.id);
    expect(membership.officeId).toBe(validInput.officeId);
    expect(membership.userId).toBe(validInput.userId);
    expect(membership.createdAt).toEqual(persistedMembership.createdAt);
  });

  it.each([
    { field: 'id', value: 'invalid' },
    { field: 'officeId', value: 'invalid' },
    { field: 'userId', value: 'invalid' },
    { field: 'role', value: 'ADMIN' },
    { field: 'createdAt', value: new Date('invalid') },
    { field: 'createdAt', value: '2026-01-01' },
  ] as const)('rejects invalid persisted $field', ({ field, value }) => {
    expect(() => Membership.restore({ ...persistedMembership, [field]: value }))
      .toThrowError(new InvalidMembershipError(field));
  });

  it('keeps its creation date immutable', () => {
    const createdAt = new Date(persistedMembership.createdAt);
    const membership = Membership.restore({ ...persistedMembership, createdAt });
    createdAt.setTime(0);
    membership.createdAt.setTime(0);
    expect(membership.createdAt).toEqual(persistedMembership.createdAt);
  });
});
