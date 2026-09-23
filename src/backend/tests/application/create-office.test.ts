import { describe, expect, it, vi } from 'vitest';
import { CreateOffice } from '../../src/application/offices/create-office.js';
import { InvalidOfficeError } from '../../src/domain/offices/invalid-office-error.js';
import { InMemoryOfficesRepository } from '../support/in-memory-offices-repository.js';

describe('CreateOffice', () => {
  it('persists and returns the valid office through the repository contract', async () => {
    const repository = new InMemoryOfficesRepository();
    const createOffice = new CreateOffice(repository);

    const office = await createOffice.execute({ name: ' Escritório Exemplo ' });
    const storedOffice = await repository.findById(office.id);

    expect(office.name).toBe('Escritório Exemplo');
    expect(office.status).toBe('ACTIVE');
    expect(storedOffice).toBe(office);
  });

  it('does not call persistence when the input is invalid', async () => {
    const repository = new InMemoryOfficesRepository();
    const create = vi.spyOn(repository, 'create');

    await expect(new CreateOffice(repository).execute({ name: ' ' }))
      .rejects.toThrowError(new InvalidOfficeError('name'));
    expect(create).not.toHaveBeenCalled();
  });

  it('propagates persistence failures without returning an unpersisted office', async () => {
    const repository = new InMemoryOfficesRepository();
    const failure = new Error('Persistence unavailable');
    vi.spyOn(repository, 'create').mockRejectedValueOnce(failure);

    await expect(new CreateOffice(repository).execute({ name: 'Exemplo' }))
      .rejects.toBe(failure);
  });

  it('returns null when an office is not found', async () => {
    const repository = new InMemoryOfficesRepository();

    expect(await repository.findById('02ac42eb-e434-4ffd-90eb-91ca9e2a4b16'))
      .toBeNull();
  });
});
