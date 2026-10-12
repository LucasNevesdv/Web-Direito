import type { DeadlineSource, DeadlineStatus, NotificationKind, Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import type { EstadoPrazo, EstadoTarefa, Notificacao, OrigemPrazo, PrazoJudicial, PrioridadeTarefa, SituacaoPrazo, SituacaoTarefa,
  Tarefa } from '../../application/tasks/task-contracts.js';
import { vinculoDasColunas } from './prisma-business-links.js';

const inverter = <A extends string, B extends string>(mapa: Record<A, B>) => Object.fromEntries(Object.entries(mapa).map(([a, b]) => [b, a])) as Record<B, A>;
export const SITUACOES_TAREFA_PRISMA: Record<SituacaoTarefa, TaskStatus> = { PENDENTE: 'PENDING', EM_ANDAMENTO: 'IN_PROGRESS', CONCLUIDA: 'DONE', CANCELADA: 'CANCELED' };
export const PRIORIDADES_PRISMA: Record<PrioridadeTarefa, TaskPriority> = { BAIXA: 'LOW', MEDIA: 'MEDIUM', ALTA: 'HIGH', URGENTE: 'URGENT' };
export const ORIGENS_PRISMA: Record<OrigemPrazo, DeadlineSource> = { INTIMACAO: 'INTIMATION', PUBLICACAO: 'PUBLICATION', CITACAO: 'SUMMONS',
  DESPACHO: 'ORDER', AUDIENCIA: 'HEARING', OUTRA: 'OTHER' };
export const SITUACOES_PRAZO_PRISMA: Record<SituacaoPrazo, DeadlineStatus> = { PENDENTE: 'PENDING', CUMPRIDO: 'FULFILLED', CANCELADO: 'CANCELED' };
export const TIPOS_NOTIFICACAO: Record<NotificationKind, Notificacao['tipo']> = { TASK_DUE_SOON: 'TAREFA_PROXIMA', TASK_OVERDUE: 'TAREFA_ATRASADA',
  DEADLINE_CRITICAL: 'PRAZO_CRITICO', DEADLINE_OVERDUE: 'PRAZO_VENCIDO' };
const SITUACOES_TAREFA = inverter(SITUACOES_TAREFA_PRISMA);
const PRIORIDADES = inverter(PRIORIDADES_PRISMA);
const ORIGENS = inverter(ORIGENS_PRISMA);
const SITUACOES_PRAZO = inverter(SITUACOES_PRAZO_PRISMA);

export const dataCivil = (data: Date) => data.toISOString().slice(0, 10);
export const dataDoBanco = (data: string) => new Date(`${data}T00:00:00.000Z`);
const pessoa = { select: { id: true, name: true } } as const;
const comoPessoa = (registro: { id: string; name: string }) => ({ id: registro.id, nome: registro.name });

export const INCLUSAO_TAREFA = { responsible: pessoa, reviewer: pessoa, creator: pessoa, completedBy: pessoa,
  checklist: { include: { doneBy: pessoa }, orderBy: [{ position: 'asc' }, { id: 'asc' }] } } satisfies Prisma.TaskInclude;
export const INCLUSAO_PRAZO = { responsible: pessoa, confirmedBy: pessoa, completedBy: pessoa } satisfies Prisma.JudicialDeadlineInclude;

export function converterTarefa(registro: Prisma.TaskGetPayload<{ include: typeof INCLUSAO_TAREFA }>): Tarefa {
  return { id: registro.id, titulo: registro.title, descricao: registro.description, situacao: SITUACOES_TAREFA[registro.status],
    prioridade: PRIORIDADES[registro.priority], responsavel: comoPessoa(registro.responsible), revisor: registro.reviewer ? comoPessoa(registro.reviewer) : null,
    criador: comoPessoa(registro.creator), prazoInterno: registro.internalDueDate ? dataCivil(registro.internalDueDate) : null, vinculo: vinculoDasColunas(registro),
    conclusao: registro.completedAt && registro.completedBy ? { em: registro.completedAt, autor: comoPessoa(registro.completedBy), observacao: registro.completionNote } : null,
    checklist: registro.checklist.map((item) => ({ id: item.id, titulo: item.title, concluido: item.done, concluidoEm: item.doneAt,
      concluidoPor: item.doneBy ? comoPessoa(item.doneBy) : null, posicao: item.position })),
    versao: registro.version, criadoEm: registro.createdAt, atualizadoEm: registro.updatedAt };
}
export function converterPrazo(registro: Prisma.JudicialDeadlineGetPayload<{ include: typeof INCLUSAO_PRAZO }>): PrazoJudicial {
  return { id: registro.id, descricao: registro.description, dataLimite: dataCivil(registro.dueDate), origem: ORIGENS[registro.source],
    detalhesOrigem: registro.sourceDetails, situacao: SITUACOES_PRAZO[registro.status], responsavel: comoPessoa(registro.responsible),
    confirmadoPor: comoPessoa(registro.confirmedBy), confirmadoEm: registro.confirmedAt, idTarefa: registro.taskId, vinculo: vinculoDasColunas(registro),
    conclusao: registro.completedAt && registro.completedBy ? { em: registro.completedAt, autor: comoPessoa(registro.completedBy), observacao: registro.completionNote } : null,
    versao: registro.version, criadoEm: registro.createdAt, atualizadoEm: registro.updatedAt };
}

// Instantâneos gravados no histórico; somente identificadores e valores de negócio.
export const instantaneoTarefa = (estado: EstadoTarefa) => ({ ...estado, conclusao: estado.conclusao ? { ...estado.conclusao, em: estado.conclusao.em.toISOString() } : null });
export const instantaneoPrazo = (estado: EstadoPrazo) => ({ ...estado, confirmacao: { ...estado.confirmacao, em: estado.confirmacao.em.toISOString() },
  conclusao: estado.conclusao ? { ...estado.conclusao, em: estado.conclusao.em.toISOString() } : null });
