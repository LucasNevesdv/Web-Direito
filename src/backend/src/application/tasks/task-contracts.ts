import type { PapelVinculoEscritorio } from '../../domain/memberships/membership.js';
import type { DadosTokenAcesso } from '../authentication/authentication-contracts.js';
import type { CatalogoVinculos, Vinculo } from '../links/business-links.js';

export const SITUACOES_TAREFA = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'] as const;
export const PRIORIDADES_TAREFA = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const;
export const ORIGENS_PRAZO = ['INTIMACAO', 'PUBLICACAO', 'CITACAO', 'DESPACHO', 'AUDIENCIA', 'OUTRA'] as const;
export const SITUACOES_PRAZO = ['PENDENTE', 'CUMPRIDO', 'CANCELADO'] as const;
export const PERIODOS_TAREFA = ['TODAS', 'HOJE', 'FUTURAS', 'ATRASADAS'] as const;
export type SituacaoTarefa = typeof SITUACOES_TAREFA[number];
export type PrioridadeTarefa = typeof PRIORIDADES_TAREFA[number];
export type OrigemPrazo = typeof ORIGENS_PRAZO[number];
export type SituacaoPrazo = typeof SITUACOES_PRAZO[number];
export type PeriodoTarefa = typeof PERIODOS_TAREFA[number];

export interface AutorEscritorio { idUsuario: string; papel: PapelVinculoEscritorio; permissoes?: string[] }
export interface Pessoa { id: string; nome: string }
export interface Conclusao { em: Date; autor: Pessoa; observacao: string | null }
export interface ItemChecklist { id: string; titulo: string; concluido: boolean; concluidoEm: Date | null; concluidoPor: Pessoa | null; posicao: number }

export interface Tarefa {
  id: string; titulo: string; descricao: string; situacao: SituacaoTarefa; prioridade: PrioridadeTarefa;
  responsavel: Pessoa; revisor: Pessoa | null; criador: Pessoa; prazoInterno: string | null; vinculo: Vinculo | null;
  conclusao: Conclusao | null; checklist: ItemChecklist[]; versao: number; criadoEm: Date; atualizadoEm: Date;
}
export interface EstadoTarefa {
  titulo: string; descricao: string; situacao: SituacaoTarefa; prioridade: PrioridadeTarefa; idResponsavel: string;
  idRevisor: string | null; prazoInterno: string | null; vinculo: Vinculo | null;
  conclusao: { em: Date; idAutor: string; observacao: string | null } | null;
}
export type AlteracaoChecklist = { tipo: 'ADICIONAR'; titulo: string } | { tipo: 'MARCAR'; idItem: string; concluido: boolean } | { tipo: 'REMOVER'; idItem: string };

export interface PrazoJudicial {
  id: string; descricao: string; dataLimite: string; origem: OrigemPrazo; detalhesOrigem: string; situacao: SituacaoPrazo;
  responsavel: Pessoa; confirmadoPor: Pessoa; confirmadoEm: Date; idTarefa: string | null; vinculo: Vinculo | null;
  conclusao: Conclusao | null; versao: number; criadoEm: Date; atualizadoEm: Date;
}
export interface EstadoPrazo {
  descricao: string; dataLimite: string; origem: OrigemPrazo; detalhesOrigem: string; situacao: SituacaoPrazo; idResponsavel: string;
  idTarefa: string | null; vinculo: Vinculo | null; confirmacao: { em: Date; idAutor: string };
  conclusao: { em: Date; idAutor: string; observacao: string | null } | null;
}

export interface FiltroTarefas {
  periodo: PeriodoTarefa; hoje: string; idResponsavel?: string; situacao?: SituacaoTarefa; prioridade?: PrioridadeTarefa;
  pagina: number; tamanhoPagina: number; ate?: string;
}
export interface FiltroPrazos { situacao?: SituacaoPrazo; idResponsavel?: string; idTarefa?: string; ate?: string; depois?: string; pagina: number; tamanhoPagina: number }
export interface EventoHistorico { id: string; autor: Pessoa; acao: string; anterior: unknown; atual: unknown; criadoEm: Date }
export interface Notificacao {
  id: string; tipo: 'TAREFA_PROXIMA' | 'TAREFA_ATRASADA' | 'PRAZO_CRITICO' | 'PRAZO_VENCIDO'; escalonada: boolean;
  titulo: string; dataLimite: string; idTarefa: string | null; idPrazo: string | null; lidaEm: Date | null; criadoEm: Date;
}
export interface ContagemTarefas { hoje: number; atrasadas: number; futuras: number }

export interface OperacoesTarefas {
  autor: AutorEscritorio;
  vinculos: CatalogoVinculos;
  membroAtivo(idUsuario: string): Promise<boolean>;
  listarMembros(): Promise<Pessoa[]>;
  listarTarefas(filtro: FiltroTarefas): Promise<{ tarefas: Tarefa[]; total: number }>;
  consultarTarefa(id: string): Promise<Tarefa>;
  criarTarefa(estado: EstadoTarefa): Promise<Tarefa>;
  alterarTarefa(anterior: Tarefa, estado: EstadoTarefa, acao: string): Promise<Tarefa>;
  alterarChecklist(anterior: Tarefa, alteracao: AlteracaoChecklist): Promise<Tarefa>;
  historicoTarefa(id: string): Promise<EventoHistorico[]>;
  listarPrazos(filtro: FiltroPrazos): Promise<{ prazos: PrazoJudicial[]; total: number }>;
  consultarPrazo(id: string): Promise<PrazoJudicial>;
  criarPrazo(estado: EstadoPrazo): Promise<PrazoJudicial>;
  alterarPrazo(anterior: PrazoJudicial, estado: EstadoPrazo, acao: string): Promise<PrazoJudicial>;
  historicoPrazo(id: string): Promise<EventoHistorico[]>;
  contarTarefasDoUsuario(idUsuario: string, hoje: string): Promise<ContagemTarefas>;
  listarNotificacoes(limite: number): Promise<{ notificacoes: Notificacao[]; naoLidas: number }>;
  marcarNotificacaoLida(id: string): Promise<void>;
}
export interface RepositorioTarefas {
  executar<T>(contexto: DadosTokenAcesso, operacao: (operacoes: OperacoesTarefas) => Promise<T>): Promise<T>;
}

export const estadoDaTarefa = (tarefa: Tarefa): EstadoTarefa => ({ titulo: tarefa.titulo, descricao: tarefa.descricao, situacao: tarefa.situacao,
  prioridade: tarefa.prioridade, idResponsavel: tarefa.responsavel.id, idRevisor: tarefa.revisor?.id ?? null, prazoInterno: tarefa.prazoInterno,
  vinculo: tarefa.vinculo, conclusao: tarefa.conclusao ? { em: tarefa.conclusao.em, idAutor: tarefa.conclusao.autor.id, observacao: tarefa.conclusao.observacao } : null });
export const estadoDoPrazo = (prazo: PrazoJudicial): EstadoPrazo => ({ descricao: prazo.descricao, dataLimite: prazo.dataLimite, origem: prazo.origem,
  detalhesOrigem: prazo.detalhesOrigem, situacao: prazo.situacao, idResponsavel: prazo.responsavel.id, idTarefa: prazo.idTarefa, vinculo: prazo.vinculo,
  confirmacao: { em: prazo.confirmadoEm, idAutor: prazo.confirmadoPor.id },
  conclusao: prazo.conclusao ? { em: prazo.conclusao.em, idAutor: prazo.conclusao.autor.id, observacao: prazo.conclusao.observacao } : null });
