import { describe, expect, it } from 'vitest';
import { Office } from '../../src/domain/offices/office.js';
import { InvalidOfficeError } from '../../src/domain/offices/invalid-office-error.js';
import { officeMapper } from '../../src/infrastructure/prisma/office-mapper.js';

describe('Office persistence mapping', () => {
  it('restores an inactive office without regenerating its identity, state or dates', () => {
    const record = {
      id: '1e5ec6ab-cb01-4a65-ae67-b9ab6dfbe9ee',
      name: 'Escritório persistido',
      status: 'INACTIVE' as const,
      createdAt: new Date('2026-01-01T10:00:00.123Z'),
      updatedAt: new Date('2026-02-01T11:00:00.456Z'),
    };

    const office = officeMapper.toDomain(record);

    expect(office).toBeInstanceOf(Office);
    expect(officeMapper.toPersistence(office)).toEqual(record);
    record.createdAt.setFullYear(2000);
    expect(office.createdAt.toISOString()).toBe('2026-01-01T10:00:00.123Z');
  });

  it('rejects corrupted persisted state through domain validation', () => {
    expect(() => officeMapper.toDomain({
      id: '1e5ec6ab-cb01-4a65-ae67-b9ab6dfbe9ee',
      name: '',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    })).toThrow(InvalidOfficeError);
  });
});
