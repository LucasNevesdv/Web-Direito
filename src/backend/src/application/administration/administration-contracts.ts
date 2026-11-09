import type { DadosTokenAcesso } from '../authentication/authentication-contracts.js';
import type { PapelVinculoEscritorio } from '../../domain/memberships/membership.js';

export const TIPOS_ENTIDADE_AUDITORIA = ['TAREFA', 'PRAZO_JUDICIAL', 'COMPROMISSO', 'DOCUMENTO', 'MEMBRO', 'SESSAO', 'AUTENTICACAO', 'ESCRITORIO'] as const;
export type TipoEntidadeAuditoria = typeof TIPOS_ENTIDADE_AUDITORIA[number];

export interface AutorAdministracao { idUsuario: string; papel: PapelVinculoEscritorio }
export interface FiltroAuditoria {
  pagina: number; tamanhoPagina: number;
  idUsuario?: string; tipoEntidade?: TipoEntidadeAuditoria; acao?: string; de?: Date; ate?: Date;
}
export interface RegistroAuditoria {
  id: string; ocorridoEm: Date; autor: { id: string; nome: string } | null; acao: string;
  tipoEntidade: string; idEntidade: string | null; anterior: unknown; atual: unknown; detalhes: unknown;
}
export interface DadosEscritorio { id: string; nome: string }

export interface ExportacaoEscritorio {
  geradoEm: Date;
  escritorio: DadosEscritorio & { criadoEm: Date };
  membros: unknown[];
  tarefas: Array<{ id: string } & Record<string, unknown>>;
  prazos: unknown[];
  documentos: Array<{ id: string } & Record<string, unknown>>;
  auditoria: unknown[];
  compromissos?: unknown[];
}

export interface OperacoesAdministracao {
  autor: AutorAdministracao;
  consultarEscritorio(): Promise<DadosEscritorio>;
  listarAuditoria(filtro: FiltroAuditoria): Promise<{ registros: RegistroAuditoria[]; total: number }>;
  renomearEscritorio(nome: string): Promise<DadosEscritorio>;
  exportar(): Promise<ExportacaoEscritorio>;
}
export interface RepositorioAdministracao {
  executar<T>(contexto: DadosTokenAcesso, operacao: (operacoes: OperacoesAdministracao) => Promise<T>): Promise<T>;
}
