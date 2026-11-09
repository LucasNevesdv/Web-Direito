import type { DadosTokenAcesso } from '../authentication/authentication-contracts.js';

export interface ItemPainel { id: string; titulo: string; data: string | null; href: string }
export interface GrupoPainel { total: number; itens: ItemPainel[]; href: string }
export interface FiltroPainel { dias: number; responsavel: string }
export interface ConsultaPainel extends FiltroPainel {
  hoje: string; ate: string; limiteCritico: string; agora: Date; fimCompromissos: Date;
}
export interface ResumoPainel {
  hoje: string; ate: string; dias: number; diasPrazoCritico: number; fusoHorario: string;
  responsavel: string; idUsuario: string; membros: { id: string; nome: string }[];
  tarefas: { hoje: GrupoPainel; atrasadas: GrupoPainel; futuras: GrupoPainel };
  prazosCriticos: GrupoPainel; prazosProximos: GrupoPainel; compromissos: GrupoPainel;
  casosSemAtividade: GrupoPainel | null;
  clientesAtivos: { total: number; href: string } | null;
  casosAtivos: { total: number; href: string } | null;
}
export interface RepositorioPainel {
  consultar(contexto: DadosTokenAcesso, consulta: ConsultaPainel): Promise<Omit<ResumoPainel, 'fusoHorario' | 'diasPrazoCritico'>>;
}
export class ErroPainel extends Error {
  readonly situacao = 400;
  readonly codigo = 'DADOS_INVALIDOS';
}
