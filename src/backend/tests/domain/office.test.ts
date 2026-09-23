import { describe, expect, it } from 'vitest';
import { InvalidOfficeError } from '../../src/domain/offices/invalid-office-error.js';
import { Office } from '../../src/domain/offices/office.js';

const persistedOffice = {
  id: '02ac42eb-e434-4ffd-90eb-91ca9e2a4b16',
  name: 'Escritório Exemplo',
  status: 'INACTIVE' as const,
  createdAt: new Date('2026-01-01T12:00:00.000Z'),
  updatedAt: new Date('2026-02-01T12:00:00.000Z'),
};

describe('Office', () => {
  it('creates a valid active office with a UUID and creation dates', () => {
    const before = Date.now();
    const office = Office.create({ name: 'Escritório Exemplo' });
    const after = Date.now();

    expect(office.name).toBe('Escritório Exemplo');
    expect(office.status).toBe('ACTIVE');
    expect(office.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(office.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(office.createdAt.getTime()).toBeLessThanOrEqual(after);
    expect(office.updatedAt).toEqual(office.createdAt);
  });

  it('normalizes surrounding whitespace while preserving the name', () => {
    expect(Office.create({ name: ' \t Escritório  Exemplo \n' }).name)
      .toBe('Escritório  Exemplo');
  });

  it.each(['AB', 'a'.repeat(120), '😀'.repeat(120)])(
    'accepts names at the character limits',
    (name) => {
      expect(Office.create({ name }).name).toBe(name);
    },
  );

  it.each(['', '   ', '\t\n', 'A', ' 😀 ', 'a'.repeat(121), '😀'.repeat(121)])(
    'rejects empty, short, or long names after normalization',
    (name) => {
      expect(() => Office.create({ name })).toThrowError(new InvalidOfficeError('name'));
    },
  );

  it.each([undefined, null, 123, {}])('rejects a name that is not a string', (name) => {
    expect(() => Office.create({ name: name as string }))
      .toThrowError(new InvalidOfficeError('name'));
  });

  it('preserves a supplied UUID with canonical casing', () => {
    expect(Office.create({ name: 'Exemplo', id: persistedOffice.id.toUpperCase() }).id)
      .toBe(persistedOffice.id);
  });

  it.each(['', 'not-a-uuid', '02ac42eb-e434-4ffd-90eb-91ca9e2a4b1z', null, 123])(
    'rejects an invalid supplied identifier',
    (id) => {
      expect(() => Office.create({ name: 'Exemplo', id: id as string }))
        .toThrowError(new InvalidOfficeError('id'));
    },
  );

  it('restores persisted identity, status, and dates', () => {
    const office = Office.restore(persistedOffice);

    expect(office.id).toBe(persistedOffice.id);
    expect(office.name).toBe(persistedOffice.name);
    expect(office.status).toBe('INACTIVE');
    expect(office.createdAt).toEqual(persistedOffice.createdAt);
    expect(office.updatedAt).toEqual(persistedOffice.updatedAt);
  });

  it.each([
    { field: 'id', value: 'invalid' },
    { field: 'name', value: ' ' },
    { field: 'status', value: 'DELETED' },
    { field: 'createdAt', value: new Date('invalid') },
    { field: 'createdAt', value: '2026-01-01T12:00:00.000Z' },
    { field: 'updatedAt', value: new Date('invalid') },
    { field: 'updatedAt', value: new Date('2025-01-01T00:00:00.000Z') },
  ] as const)('rejects an invalid persisted $field', ({ field, value }) => {
    const state = { ...persistedOffice, [field]: value };
    expect(() => Office.restore(state)).toThrowError(new InvalidOfficeError(field));
  });

  it('keeps dates unchanged when constructor inputs or returned dates are mutated', () => {
    const createdAt = new Date(persistedOffice.createdAt);
    const updatedAt = new Date(persistedOffice.updatedAt);
    const office = Office.restore({ ...persistedOffice, createdAt, updatedAt });

    createdAt.setTime(0);
    updatedAt.setTime(0);
    office.createdAt.setTime(0);
    office.updatedAt.setTime(0);

    expect(office.createdAt).toEqual(persistedOffice.createdAt);
    expect(office.updatedAt).toEqual(persistedOffice.updatedAt);
  });

  it('provides a predictable sanitized domain error', () => {
    const invalidName = 'private-office-name'.repeat(10);
    let caughtError: unknown;
    try {
      Office.create({ name: invalidName });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(InvalidOfficeError);
    expect(caughtError).toMatchObject({
      code: 'INVALID_OFFICE',
      field: 'name',
      message: 'Invalid office field: name',
    });
    expect(String(caughtError)).not.toContain(invalidName);
  });
});
