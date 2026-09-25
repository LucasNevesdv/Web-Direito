import type { PrismaClient } from '@prisma/client';
import type { RepositorioEscritorios } from '../../application/offices/offices-repository.js';
import type { Escritorio } from '../../domain/offices/office.js';
import { MAPEADOR_ESCRITORIO } from './office-mapper.js';

export class RepositorioEscritoriosPrisma implements RepositorioEscritorios {
  constructor(private readonly prisma: PrismaClient) {}

  async salvarEscritorio(escritorio: Escritorio): Promise<Escritorio> {
    const registroEscritorio = await this.prisma.office.create({
      data: MAPEADOR_ESCRITORIO.converterEscritorioEmRegistroPrisma(escritorio),
    });
    return MAPEADOR_ESCRITORIO.converterRegistroPrismaEmEscritorio(registroEscritorio);
  }

  async buscarEscritorioPorId(id: string): Promise<Escritorio | null> {
    const registroEscritorio = await this.prisma.office.findUnique({ where: { id } });
    return registroEscritorio ? MAPEADOR_ESCRITORIO.converterRegistroPrismaEmEscritorio(registroEscritorio) : null;
  }
}
