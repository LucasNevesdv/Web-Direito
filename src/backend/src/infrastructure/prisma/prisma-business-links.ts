import type { Prisma } from '@prisma/client';
import type { CatalogoVinculos, OpcaoVinculo, TipoVinculo, Vinculo } from '../../application/links/business-links.js';
import { TIPOS_VINCULO } from '../../application/links/business-links.js';

export type ResolvedorVinculo = {
  existe(transacao: Prisma.TransactionClient, idEscritorio: string, id: string): Promise<boolean>;
  pesquisar(transacao: Prisma.TransactionClient, idEscritorio: string, pesquisa: string, limite: number): Promise<Array<{ id: string; rotulo: string }>>;
};

// Clientes, casos e processos ainda não possuem tabelas: nenhum vínculo é aceito até seus módulos
// registrarem aqui um resolvedor que consulte por ID e escritório.
const SEM_REGISTROS: ResolvedorVinculo = { existe: async () => false, pesquisar: async () => [] };
export const RESOLVEDORES_VINCULO: Record<TipoVinculo, ResolvedorVinculo> = Object.fromEntries(
  TIPOS_VINCULO.map((tipo) => [tipo, SEM_REGISTROS]),
) as Record<TipoVinculo, ResolvedorVinculo>;

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
