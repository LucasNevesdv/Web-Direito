import type { Office } from '../../domain/offices/office.js';

export interface OfficesRepository {
  create(office: Office): Promise<Office>;
  findById(id: string): Promise<Office | null>;
}
