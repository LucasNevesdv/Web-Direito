import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { DadosTokenAcesso } from '../../application/authentication/authentication-contracts.js';
import { estadoDaTarefa, estadoDoPrazo, type EstadoPrazo, type EstadoTarefa, type EventoHistorico, type OperacoesTarefas,
  type RepositorioTarefas } from '../../application/tasks/task-contracts.js';
import { ErroTarefas } from '../../application/tasks/task-policy.js';
import { abrirContextoDoEscritorio, listarMembrosAtivos, membroAtivoDoEscritorio } from './office-access.js';
import { colunasDoVinculo, criarCatalogoVinculos } from './prisma-business-links.js';
import { converterPrazo, converterTarefa, dataCivil, dataDoBanco, INCLUSAO_PRAZO, INCLUSAO_TAREFA, instantaneoPrazo, instantaneoTarefa,
  ORIGENS_PRISMA, PRIORIDADES_PRISMA, SITUACOES_PRAZO_PRISMA, SITUACOES_TAREFA_PRISMA, TIPOS_NOTIFICACAO } from './task-mapper.js';

const ABERTAS = [SITUACOES_TAREFA_PRISMA.PENDENTE, SITUACOES_TAREFA_PRISMA.EM_ANDAMENTO];
const colunasTarefa = (estado: EstadoTarefa) => ({ title: estado.titulo, description: estado.descricao, status: SITUACOES_TAREFA_PRISMA[estado.situacao],
  priority: PRIORIDADES_PRISMA[estado.prioridade], responsibleId: estado.idResponsavel, reviewerId: estado.idRevisor,
  internalDueDate: estado.prazoInterno ? dataDoBanco(estado.prazoInterno) : null, ...colunasDoVinculo(estado.vinculo),
  completedAt: estado.conclusao?.em ?? null, completedById: estado.conclusao?.idAutor ?? null, completionNote: estado.conclusao?.observacao ?? null });
const colunasPrazo = (estado: EstadoPrazo) => ({ description: estado.descricao, dueDate: dataDoBanco(estado.dataLimite), source: ORIGENS_PRISMA[estado.origem],
  sourceDetails: estado.detalhesOrigem, status: SITUACOES_PRAZO_PRISMA[estado.situacao], responsibleId: estado.idResponsavel, taskId: estado.idTarefa,
  ...colunasDoVinculo(estado.vinculo), confirmedById: estado.confirmacao.idAutor, confirmedAt: estado.confirmacao.em,
  completedAt: estado.conclusao?.em ?? null, completedById: estado.conclusao?.idAutor ?? null, completionNote: estado.conclusao?.observacao ?? null });
const historico = (registro: { id: string; action: string; previous: Prisma.JsonValue; current: Prisma.JsonValue; createdAt: Date; actor: { id: string; name: string } }): EventoHistorico =>
  ({ id: registro.id, autor: { id: registro.actor.id, nome: registro.actor.name }, acao: registro.action, anterior: registro.previous, atual: registro.current, criadoEm: registro.createdAt });
const json = (valor: unknown) => valor as Prisma.InputJsonValue;

export class RepositorioTarefasPrisma implements RepositorioTarefas {
  constructor(private readonly prisma: PrismaClient) {}

  async executar<T>(contexto: DadosTokenAcesso, operacao: (operacoes: OperacoesTarefas) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(async (transacao) => {
        const autor = await abrirContextoDoEscritorio(transacao, contexto);
        const idEscritorio = contexto.idEscritorioAtivo;
        async function consultarTarefa(id: string) {
          const registro = await transacao.task.findFirst({ where: { id, officeId: idEscritorio }, include: INCLUSAO_TAREFA });
          if (!registro) throw new ErroTarefas('NAO_ENCONTRADO');
          return converterTarefa(registro);
        }
        async function consultarPrazo(id: string) {
          const registro = await transacao.judicialDeadline.findFirst({ where: { id, officeId: idEscritorio }, include: INCLUSAO_PRAZO });
          if (!registro) throw new ErroTarefas('NAO_ENCONTRADO');
          return converterPrazo(registro);
        }
        async function avancarVersaoTarefa(id: string, versao: number, dados: Prisma.TaskUncheckedUpdateManyInput = {}) {
          const alterou = await transacao.task.updateMany({ where: { id, officeId: idEscritorio, version: versao }, data: { ...dados, version: { increment: 1 }, updatedAt: new Date() } });
          if (alterou.count !== 1) throw new ErroTarefas('CONFLITO');
        }
        async function registrarTarefa(idTarefa: string, acao: string, atual: unknown, anterior?: unknown) {
          await transacao.taskHistory.create({ data: { id: randomUUID(), taskId: idTarefa, actorId: autor.idUsuario, action: acao,
            previous: anterior === undefined ? Prisma.DbNull : json(anterior), current: json(atual), createdAt: new Date() } });
        }
        async function registrarPrazo(idPrazo: string, acao: string, atual: unknown, anterior?: unknown) {
          await transacao.judicialDeadlineHistory.create({ data: { id: randomUUID(), deadlineId: idPrazo, actorId: autor.idUsuario, action: acao,
            previous: anterior === undefined ? Prisma.DbNull : json(anterior), current: json(atual), createdAt: new Date() } });
        }
        return operacao({
          autor,
          vinculos: criarCatalogoVinculos(transacao, idEscritorio),
          membroAtivo: (idUsuario) => membroAtivoDoEscritorio(transacao, idEscritorio, idUsuario),
          listarMembros: () => listarMembrosAtivos(transacao, idEscritorio),
          consultarTarefa,
          listarTarefas: async (filtro) => {
            const hoje = dataDoBanco(filtro.hoje);
            const periodo: Prisma.TaskWhereInput = filtro.periodo === 'HOJE' ? { status: { in: ABERTAS }, internalDueDate: hoje }
              : filtro.periodo === 'FUTURAS' ? { status: { in: ABERTAS }, internalDueDate: { gt: hoje } }
                : filtro.periodo === 'ATRASADAS' ? { status: { in: ABERTAS }, internalDueDate: { lt: hoje } } : {};
            const where: Prisma.TaskWhereInput = { officeId: idEscritorio, ...periodo,
              ...(filtro.idResponsavel ? { responsibleId: filtro.idResponsavel } : {}),
              ...(filtro.prioridade ? { priority: PRIORIDADES_PRISMA[filtro.prioridade] } : {}),
              ...(filtro.situacao ? { AND: [{ status: SITUACOES_TAREFA_PRISMA[filtro.situacao] }] } : {}) };
            const registros = await transacao.task.findMany({ where, include: INCLUSAO_TAREFA, skip: (filtro.pagina - 1) * filtro.tamanhoPagina, take: filtro.tamanhoPagina,
              orderBy: [{ internalDueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] });
            return { tarefas: registros.map(converterTarefa), total: await transacao.task.count({ where }) };
          },
          criarTarefa: async (estado) => {
            const id = randomUUID(), agora = new Date();
            await transacao.task.create({ data: { id, officeId: idEscritorio, creatorId: autor.idUsuario, createdAt: agora, updatedAt: agora, ...colunasTarefa(estado) } });
            await registrarTarefa(id, 'CRIADA', instantaneoTarefa(estado));
            return consultarTarefa(id);
          },
          alterarTarefa: async (anterior, estado, acao) => {
            await avancarVersaoTarefa(anterior.id, anterior.versao, colunasTarefa(estado));
            await registrarTarefa(anterior.id, acao, instantaneoTarefa(estado), instantaneoTarefa(estadoDaTarefa(anterior)));
            return consultarTarefa(anterior.id);
          },
          alterarChecklist: async (anterior, alteracao) => {
            await avancarVersaoTarefa(anterior.id, anterior.versao);
            if (alteracao.tipo === 'ADICIONAR') {
              const posicao = Math.max(-1, ...anterior.checklist.map((item) => item.posicao)) + 1;
              const id = randomUUID();
              await transacao.taskChecklistItem.create({ data: { id, taskId: anterior.id, title: alteracao.titulo, position: posicao, createdAt: new Date() } });
              await registrarTarefa(anterior.id, 'CHECKLIST_ADICIONADO', { id, titulo: alteracao.titulo });
            } else {
              const item = anterior.checklist.find((existente) => existente.id === alteracao.idItem)!;
              const anteriorItem = { id: item.id, titulo: item.titulo, concluido: item.concluido };
              if (alteracao.tipo === 'REMOVER') {
                await transacao.taskChecklistItem.delete({ where: { id: item.id } });
                await registrarTarefa(anterior.id, 'CHECKLIST_REMOVIDO', { id: item.id }, anteriorItem);
              } else {
                await transacao.taskChecklistItem.update({ where: { id: item.id }, data: { done: alteracao.concluido,
                  doneAt: alteracao.concluido ? new Date() : null, doneById: alteracao.concluido ? autor.idUsuario : null } });
                await registrarTarefa(anterior.id, alteracao.concluido ? 'CHECKLIST_CONCLUIDO' : 'CHECKLIST_REABERTO', { ...anteriorItem, concluido: alteracao.concluido }, anteriorItem);
              }
            }
            return consultarTarefa(anterior.id);
          },
          historicoTarefa: async (id) => (await transacao.taskHistory.findMany({ where: { taskId: id, task: { officeId: idEscritorio } },
            include: { actor: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200 })).map(historico),
          consultarPrazo,
          listarPrazos: async (filtro) => {
            const where: Prisma.JudicialDeadlineWhereInput = { officeId: idEscritorio,
              ...(filtro.situacao ? { status: SITUACOES_PRAZO_PRISMA[filtro.situacao] } : {}),
              ...(filtro.idResponsavel ? { responsibleId: filtro.idResponsavel } : {}),
              ...(filtro.idTarefa ? { taskId: filtro.idTarefa } : {}),
              ...(filtro.ate ? { dueDate: { lte: dataDoBanco(filtro.ate) } } : {}) };
            const registros = await transacao.judicialDeadline.findMany({ where, include: INCLUSAO_PRAZO, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
              skip: (filtro.pagina - 1) * filtro.tamanhoPagina, take: filtro.tamanhoPagina });
            return { prazos: registros.map(converterPrazo), total: await transacao.judicialDeadline.count({ where }) };
          },
          criarPrazo: async (estado) => {
            const id = randomUUID(), agora = new Date();
            await transacao.judicialDeadline.create({ data: { id, officeId: idEscritorio, createdAt: agora, updatedAt: agora, ...colunasPrazo(estado) } });
            await registrarPrazo(id, 'CRIADO', instantaneoPrazo(estado));
            return consultarPrazo(id);
          },
          alterarPrazo: async (anterior, estado, acao) => {
            const alterou = await transacao.judicialDeadline.updateMany({ where: { id: anterior.id, officeId: idEscritorio, version: anterior.versao },
              data: { ...colunasPrazo(estado), version: { increment: 1 }, updatedAt: new Date() } });
            if (alterou.count !== 1) throw new ErroTarefas('CONFLITO');
            await registrarPrazo(anterior.id, acao, instantaneoPrazo(estado), instantaneoPrazo(estadoDoPrazo(anterior)));
            return consultarPrazo(anterior.id);
          },
          historicoPrazo: async (id) => (await transacao.judicialDeadlineHistory.findMany({ where: { deadlineId: id, deadline: { officeId: idEscritorio } },
            include: { actor: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200 })).map(historico),
          contarTarefasDoUsuario: async (idUsuario, hojeTexto) => {
            const hoje = dataDoBanco(hojeTexto);
            const base = { officeId: idEscritorio, responsibleId: idUsuario, status: { in: ABERTAS } };
            const [hojeTotal, atrasadas, futuras] = await Promise.all([
              transacao.task.count({ where: { ...base, internalDueDate: hoje } }),
              transacao.task.count({ where: { ...base, internalDueDate: { lt: hoje } } }),
              transacao.task.count({ where: { ...base, internalDueDate: { gt: hoje } } }),
            ]);
            return { hoje: hojeTotal, atrasadas, futuras };
          },
          listarNotificacoes: async (limite) => {
            const where = { officeId: idEscritorio, userId: autor.idUsuario };
            const registros = limite ? await transacao.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limite }) : [];
            return { naoLidas: await transacao.notification.count({ where: { ...where, readAt: null } }),
              notificacoes: registros.map((registro) => ({ id: registro.id, tipo: TIPOS_NOTIFICACAO[registro.kind], escalonada: registro.escalated, titulo: registro.title,
                dataLimite: dataCivil(registro.dueDate), idTarefa: registro.taskId, idPrazo: registro.deadlineId, lidaEm: registro.readAt, criadoEm: registro.createdAt })) };
          },
          marcarNotificacaoLida: async (id) => {
            const where = { id, officeId: idEscritorio, userId: autor.idUsuario };
            const alterou = await transacao.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
            if (alterou.count === 0 && await transacao.notification.count({ where }) === 0) throw new ErroTarefas('NAO_ENCONTRADO');
          },
        });
      }, { maxWait: 5000, timeout: 10000 });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(erro.code)) throw new ErroTarefas('CONFLITO');
      throw erro;
    }
  }
}
