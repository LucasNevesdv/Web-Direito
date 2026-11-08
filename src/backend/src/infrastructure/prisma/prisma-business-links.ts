import type { Prisma } from '@prisma/client';
import type { CatalogoVinculos, OpcaoVinculo, TipoVinculo, Vinculo } from '../../application/links/business-links.js';

export type ResolvedorVinculo = {
  existe(transacao: Prisma.TransactionClient, idEscritorio: string, id: string): Promise<boolean>;
  pesquisar(transacao: Prisma.TransactionClient, idEscritorio: string, pesquisa: string, limite: number): Promise<Array<{ id: string; rotulo: string }>>;
};


export const RESOLVEDORES_VINCULO: Record<TipoVinculo, ResolvedorVinculo> = {
  CLIENTE: {
    existe: async (transacao, idEscritorio, id) => {
      const cliente = await transacao.client.findFirst({
        where: { id, officeId: idEscritorio },
        select: { id: true },
      });
      return Boolean(cliente);
    },
    pesquisar: async (transacao, idEscritorio, pesquisa, limite) => {
      const termo = pesquisa.trim();
      const termoDigitos = termo.replace(/\D/g, '');
      const condicoesOu: Prisma.ClientWhereInput[] = [
        { name: { contains: termo, mode: 'insensitive' } },
        { socialName: { contains: termo, mode: 'insensitive' } },
      ];
      if (termoDigitos.length > 0) {
        condicoesOu.push({ documentNumber: { contains: termoDigitos } });
      }

      const clientes = await transacao.client.findMany({
        where: {
          officeId: idEscritorio,
          status: 'ACTIVE',
          ...(termo.length > 0 ? { OR: condicoesOu } : {}),
        },
        select: {
          id: true,
          name: true,
          socialName: true,
        },
        take: Math.min(Math.max(limite, 1), 50),
        orderBy: { name: 'asc' },
      });

      return clientes.map((c) => ({
        id: c.id,
        rotulo: c.socialName ? `${c.name} (${c.socialName})` : c.name,
      }));
    },
  },
  CASO: {
    existe: async (transacao, idEscritorio, id) => {
      const caso = await transacao.legalCase.findFirst({
        where: { id, officeId: idEscritorio },
        select: { id: true },
      });
      return Boolean(caso);
    },
    pesquisar: async (transacao, idEscritorio, pesquisa, limite) => {
      const termo = pesquisa.trim();
      const casos = await transacao.legalCase.findMany({
        where: {
          officeId: idEscritorio,
          status: 'ACTIVE',
          ...(termo.length > 0 ? { title: { contains: termo, mode: 'insensitive' } } : {}),
        },
        select: {
          id: true,
          title: true,
        },
        take: Math.min(Math.max(limite, 1), 50),
        orderBy: { title: 'asc' },
      });

      return casos.map((c) => ({
        id: c.id,
        rotulo: c.title,
      }));
    },
  },
  PROCESSO: {
    existe: async (transacao, idEscritorio, id) => {
      const processo = await transacao.legalProcess.findFirst({
        where: { id, officeId: idEscritorio },
        select: { id: true },
      });
      return Boolean(processo);
    },
    pesquisar: async (transacao, idEscritorio, pesquisa, limite) => {
      const digitos = pesquisa.replace(/\D/g, '');
      const processos = await transacao.legalProcess.findMany({
        where: {
          officeId: idEscritorio,
          ...(digitos.length > 0 ? { cnjNumber: { contains: digitos } } : {}),
        },
        select: { id: true, cnjNumber: true, legalCase: { select: { title: true } } },
        take: Math.min(Math.max(limite, 1), 50),
        orderBy: { cnjNumber: 'asc' },
      });

      return processos.map((p) => ({
        id: p.id,
        rotulo: `${p.cnjNumber.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6')} — ${p.legalCase.title}`,
      }));
    },
  },
};

export function criarCatalogoVinculos(transacao: Prisma.TransactionClient, idEscritorio: string,
  resolvedores: Record<TipoVinculo, ResolvedorVinculo> = RESOLVEDORES_VINCULO): CatalogoVinculos {
  return {
    existe: (vinculo: Vinculo) => resolvedores[vinculo.tipo].existe(transacao, idEscritorio, vinculo.id),
    pesquisar: async (tipo, pesquisa, limite): Promise<OpcaoVinculo[]> =>
      (await resolvedores[tipo].pesquisar(transacao, idEscritorio, pesquisa, limite)).map((opcao) => ({ tipo, ...opcao })),
  };
}

export const colunasDoVinculo = (vinculo: Vinculo | null) => ({
  clientId: vinculo?.tipo === 'CLIENTE' ? vinculo.id : null,
  caseId: vinculo?.tipo === 'CASO' ? vinculo.id : null,
  processId: vinculo?.tipo === 'PROCESSO' ? vinculo.id : null,
});
export function vinculoDasColunas(registro: { clientId: string | null; caseId: string | null; processId: string | null }): Vinculo | null {
  if (registro.clientId) return { tipo: 'CLIENTE', id: registro.clientId };
  if (registro.caseId) return { tipo: 'CASO', id: registro.caseId };
  if (registro.processId) return { tipo: 'PROCESSO', id: registro.processId };
  return null;
}
