import type { Office as PrismaOffice, Prisma } from '@prisma/client';
import { Office } from '../../domain/offices/office.js';

export const officeMapper = {
  toDomain(record: PrismaOffice): Office {
    return Office.restore({
      id: record.id,
      name: record.name,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  },

  toPersistence(office: Office): Prisma.OfficeCreateInput {
    return {
      id: office.id,
      name: office.name,
      status: office.status,
      createdAt: office.createdAt,
      updatedAt: office.updatedAt,
    };
  },
};
