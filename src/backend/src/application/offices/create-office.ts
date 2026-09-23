import { Office } from '../../domain/offices/office.js';
import type { OfficesRepository } from './offices-repository.js';

export class CreateOffice {
  constructor(private readonly officesRepository: OfficesRepository) {}

  async execute(input: { name: string }): Promise<Office> {
    const office = Office.create({ name: input.name });
    return this.officesRepository.create(office);
  }
}
