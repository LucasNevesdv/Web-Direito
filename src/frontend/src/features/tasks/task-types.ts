import type { Vinculo } from '../../shared/link-picker';

export type SituacaoTarefa = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';
export type PrioridadeTarefa = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
export type OrigemPrazo = 'INTIMACAO' | 'PUBLICACAO' | 'CITACAO' | 'DESPACHO' | 'AUDIENCIA' | 'OUTRA';
export type SituacaoPrazo = 'PENDENTE' | 'CUMPRIDO' | 'CANCELADO';
export interface Pessoa { id: string; nome: string }
export interface Conclusao { em: string; autor: Pessoa; observacao: string | null }
export interface Tarefa {
  id: string; titulo: string; descricao: string; situacao: SituacaoTarefa; prioridade: PrioridadeTarefa; responsavel: Pessoa; revisor: Pessoa | null;
  criador: Pessoa; prazoInterno: string | null; vinculo: Vinculo | null; conclusao: Conclusao | null; versao: number; criadoEm: string; podeEditar?: boolean;
  checklist: Array<{ id: string; titulo: string; concluido: boolean; concluidoEm: string | null; concluidoPor: Pessoa | null }>;
}
export interface PrazoJudicial {
  id: string; descricao: string; dataLimite: string; origem: OrigemPrazo; detalhesOrigem: string; situacao: SituacaoPrazo; responsavel: Pessoa;
  confirmadoPor: Pessoa; confirmadoEm: string; idTarefa: string | null; vinculo: Vinculo | null; conclusao: Conclusao | null; versao: number;
  critico: boolean; vencido: boolean;
}
export interface EventoHistorico { id: string; autor: Pessoa; acao: string; anterior: unknown; atual: unknown; criadoEm: string }
export interface ConfiguracaoTarefas { hoje: string; diasPrazoCritico: number; podeGerirPrazos: boolean; idUsuario: string; membros: Pessoa[] }

export const SITUACOES_TAREFA: Record<SituacaoTarefa, string> = { PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada' };
export const PRIORIDADES: Record<PrioridadeTarefa, string> = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente' };
export const ORIGENS_PRAZO: Record<OrigemPrazo, string> = { INTIMACAO: 'Intimação', PUBLICACAO: 'Publicação (DJe)', CITACAO: 'Citação', DESPACHO: 'Despacho ou decisão',
  AUDIENCIA: 'Audiência', OUTRA: 'Outra' };
export const SITUACOES_PRAZO: Record<SituacaoPrazo, string> = { PENDENTE: 'Pendente', CUMPRIDO: 'Cumprido', CANCELADO: 'Cancelado' };
export const ACOES_HISTORICO: Record<string, string> = { CRIADA: 'Criada', ALTERADA: 'Alterada', SITUACAO_ALTERADA: 'Situação alterada', CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada', REABERTA: 'Reaberta', CHECKLIST_ADICIONADO: 'Item de checklist adicionado', CHECKLIST_CONCLUIDO: 'Item de checklist concluído',
  CHECKLIST_REABERTO: 'Item de checklist reaberto', CHECKLIST_REMOVIDO: 'Item de checklist removido', CRIADO: 'Registrado', ALTERADO: 'Alterado',
  DATA_ALTERADA: 'Data alterada', CUMPRIDO: 'Cumprido', CANCELADO: 'Cancelado', REABERTO: 'Reaberto' };
