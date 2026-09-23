import type { PrismaClient } from '@prisma/client';
import type { OfficesRepository } from '../../application/offices/offices-repository.js';
import type { Office } from '../../domain/offices/office.js';
import { officeMapper } from './office-mapper.js';

export class PrismaOfficesRepository implements OfficesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(office: Office): Promise<Office> {
    const record = await this.prisma.office.create({
      data: officeMapper.toPersistence(office),
    });
    return officeMapper.toDomain(record);
  }

  async findById(id: string): Promise<Office | null> {
    const record = await this.prisma.office.findUnique({ where: { id } });
    return record ? officeMapper.toDomain(record) : null;
  }
}
