import type { OfficesRepository } from '../../src/application/offices/offices-repository.js';
import type { Office } from '../../src/domain/offices/office.js';

export class InMemoryOfficesRepository implements OfficesRepository {
  private readonly offices = new Map<string, Office>();

  async create(office: Office): Promise<Office> {
    if (this.offices.has(office.id)) {
      throw new Error('Office already exists');
    }
    this.offices.set(office.id, office);
    return office;
  }

  async findById(id: string): Promise<Office | null> {
    return this.offices.get(id) ?? null;
  }
}
