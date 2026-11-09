import type { DadosTokenAcesso } from '../authentication/authentication-contracts.js';
import type { CatalogoVinculos, Vinculo } from '../links/business-links.js';
import type { AutorEscritorio, EventoHistorico, Pessoa } from '../tasks/task-contracts.js';

export const TIPOS_COMPROMISSO = ['AUDIENCIA', 'REUNIAO', 'PERICIA', 'EVENTO_INTERNO'] as const;
export const SITUACOES_COMPROMISSO = ['AGENDADO', 'REALIZADO', 'CANCELADO'] as const;
export type TipoCompromisso = typeof TIPOS_COMPROMISSO[number];
export type SituacaoCompromisso = typeof SITUACOES_COMPROMISSO[number];
export interface DadosCompromisso {
  titulo: string; descricao: string; tipo: TipoCompromisso; inicio: string; fim: string;
  local: string; linkRemoto: string; participantes: string[]; vinculo: Vinculo | null;
  lembreteMinutos: number | null; confirmarConflito: boolean;
}
export interface Compromisso extends Omit<DadosCompromisso, 'participantes' | 'confirmarConflito'> {
  id: string; participantes: Pessoa[]; criador: Pessoa; situacao: SituacaoCompromisso;
  versao: number; criadoEm: string; atualizadoEm: string; podeEditar: boolean; podeCancelar: boolean;
  rotuloVinculo: string | null;
  vinculoRestrito?: boolean;
}
export interface FiltroAgenda {
  somenteAgendados?: boolean;
  inicio: string; fim: string; idParticipante?: string; tipo?: TipoCompromisso;
  pagina: number; tamanhoPagina: number;
}
export interface ItemCivil { id: string; titulo: string; data: string; origem: 'TAREFA' | 'PRAZO'; responsavel: Pessoa }
export interface LembreteAgenda { id: string; idCompromisso: string; titulo: string; inicio: string; avisarEm: string; lidaEm: string | null }
export interface OperacoesAgenda {
  autor: AutorEscritorio; vinculos: CatalogoVinculos;
  listarMembros(): Promise<Pessoa[]>;
  membroAtivo(id: string): Promise<boolean>;
  bloquearEscrita(): Promise<void>;
  listar(filtro: FiltroAgenda): Promise<{ compromissos: Compromisso[]; total: number }>;
  consultar(id: string): Promise<Compromisso>;
  possuiConflito(dados: DadosCompromisso, idIgnorado?: string): Promise<boolean>;
  criar(dados: DadosCompromisso): Promise<Compromisso>;
  alterar(anterior: Compromisso, dados: DadosCompromisso): Promise<Compromisso>;
  situacao(anterior: Compromisso, situacao: 'REALIZADO' | 'CANCELADO', observacao: string): Promise<Compromisso>;
  historico(id: string): Promise<EventoHistorico[]>;
  itensCivis(inicio: string, fim: string, idParticipante?: string): Promise<{ itens: ItemCivil[]; total: number }>;
  lembretes(agora: Date): Promise<LembreteAgenda[]>;
  marcarLembrete(id: string, agora: Date): Promise<void>;
}
export interface RepositorioAgenda {
  executar<T>(contexto: DadosTokenAcesso, operacao: (operacoes: OperacoesAgenda) => Promise<T>): Promise<T>;
}
