import type { Office as RegistroEscritorio, Prisma } from '@prisma/client';
import { Escritorio } from '../../domain/offices/office.js';

export const MAPEADOR_ESCRITORIO = {
  converterRegistroPrismaEmEscritorio(registroEscritorio: RegistroEscritorio): Escritorio {
    return Escritorio.restaurar({
      id: registroEscritorio.id,
      nome: registroEscritorio.name,
      situacao: registroEscritorio.status === 'ACTIVE' ? 'ATIVO' : registroEscritorio.status === 'INACTIVE' ? 'INATIVO' : registroEscritorio.status,
      criadoEm: registroEscritorio.createdAt,
      atualizadoEm: registroEscritorio.updatedAt,
    });
  },

  converterEscritorioEmRegistroPrisma(escritorio: Escritorio): Prisma.OfficeCreateInput {
    return {
      id: escritorio.id,
      name: escritorio.nome,
      status: escritorio.situacao === 'ATIVO' ? 'ACTIVE' : 'INACTIVE',
      createdAt: escritorio.criadoEm,
      updatedAt: escritorio.atualizadoEm,
    };
  },
};
