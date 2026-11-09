import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { DadosTokenAcesso } from '../../application/authentication/authentication-contracts.js';
import type { Compromisso, DadosCompromisso, OperacoesAgenda, RepositorioAgenda } from '../../application/agenda/agenda-contracts.js';
import { ErroAgenda, podeCancelar, podeEditar } from '../../application/agenda/agenda-policy.js';
import type { AutorEscritorio } from '../../application/tasks/task-contracts.js';
import { abrirContextoDoEscritorio, listarMembrosAtivos, membroAtivoDoEscritorio } from './office-access.js';
import { colunasDoVinculo, criarCatalogoVinculos, vinculoDasColunas } from './prisma-business-links.js';

const INCLUSAO = { client: { select: { name: true } }, legalCase: { select: { title: true } }, process: { select: { cnjNumber: true } }, creator: { select: { id: true, name: true } }, participants: {
  include: { membership: { include: { user: { select: { id: true, name: true } } } } }, orderBy: { userId: 'asc' as const },
} } satisfies Prisma.AppointmentInclude;
type Registro = Prisma.AppointmentGetPayload<{ include: typeof INCLUSAO }>;
const json = (valor: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
function converter(registro: Registro, autor: AutorEscritorio): Compromisso {
  const evento = { id: registro.id, titulo: registro.title, descricao: registro.description, tipo: registro.type, situacao: registro.status,
    inicio: registro.startsAt.toISOString(), fim: registro.endsAt.toISOString(), local: registro.location, linkRemoto: registro.remoteLink,
    lembreteMinutos: registro.reminderMinutes, vinculo: vinculoDasColunas(registro), versao: registro.version,
    rotuloVinculo: registro.client?.name ?? registro.legalCase?.title ?? registro.process?.cnjNumber ?? null,
    criadoEm: registro.createdAt.toISOString(), atualizadoEm: registro.updatedAt.toISOString(),
    criador: { id: registro.creator.id, nome: registro.creator.name },
    participantes: registro.participants.map((p) => ({ id: p.userId, nome: p.membership.user.name })) };
  return { ...evento, podeEditar: registro.status === 'AGENDADO' && podeEditar(autor, evento), podeCancelar: registro.status === 'AGENDADO' && podeCancelar(autor, evento) };
}
const colunas = (dados: DadosCompromisso) => ({ title: dados.titulo, description: dados.descricao, type: dados.tipo, startsAt: new Date(dados.inicio),
  endsAt: new Date(dados.fim), location: dados.local, remoteLink: dados.linkRemoto, reminderMinutes: dados.lembreteMinutos, ...colunasDoVinculo(dados.vinculo) });

export class RepositorioAgendaPrisma implements RepositorioAgenda {
  constructor(private readonly prisma: PrismaClient) {}
  async executar<T>(contexto: DadosTokenAcesso, operacao: (op: OperacoesAgenda) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const autor = await abrirContextoDoEscritorio(tx, contexto), officeId = contexto.idEscritorioAtivo;
        async function consultar(id: string) {
          const registro = await tx.appointment.findFirst({ where: { id, officeId }, include: INCLUSAO });
          if (!registro) throw new ErroAgenda('NAO_ENCONTRADO');
          return converter(registro, autor);
        }
        async function registrar(id: string, acao: string, atual: unknown, anterior?: unknown) {
          await tx.appointmentHistory.create({ data: { id: randomUUID(), appointmentId: id, actorId: autor.idUsuario, action: acao,
            previous: anterior === undefined ? Prisma.DbNull : json(anterior), current: json(atual), createdAt: new Date() } });
        }
        async function participantesELembretes(id: string, dados: DadosCompromisso, criador: string) {
          await tx.appointmentParticipant.deleteMany({ where: { appointmentId: id, officeId } });
          await tx.appointmentParticipant.createMany({ data: dados.participantes.map((userId) => ({ appointmentId: id, officeId, userId })) });
          await tx.appointmentReminder.deleteMany({ where: { appointmentId: id } });
          if (dados.lembreteMinutos !== null) {
            const destinatarios = [...new Set([...dados.participantes, criador])];
            await tx.appointmentReminder.createMany({ data: destinatarios.map((userId) => ({ id: randomUUID(), appointmentId: id, userId,
              dueAt: new Date(Date.parse(dados.inicio) - dados.lembreteMinutos! * 60000) })) });
          }
        }
        async function atualizar(anterior: Compromisso, data: Prisma.AppointmentUpdateManyMutationInput) {
          const resultado = await tx.appointment.updateMany({ where: { id: anterior.id, officeId, version: anterior.versao, status: 'AGENDADO' },
            data: { ...data, version: { increment: 1 }, updatedAt: new Date() } });
          if (resultado.count !== 1) throw new ErroAgenda('CONFLITO');
        }
        return operacao({
          autor, vinculos: criarCatalogoVinculos(tx, officeId),
          listarMembros: () => listarMembrosAtivos(tx, officeId), membroAtivo: (id) => membroAtivoDoEscritorio(tx, officeId, id),
          // Serializa as escritas da agenda do escritório: duas reservas simultâneas não contornam a confirmação.
          bloquearEscrita: async () => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${officeId}), 78088)::text`; },
          consultar,
          listar: async (filtro) => {
            const where: Prisma.AppointmentWhereInput = { officeId, startsAt: { lt: new Date(filtro.fim) }, endsAt: { gt: new Date(filtro.inicio) },
              ...(filtro.somenteAgendados ? { status: 'AGENDADO' } : {}),
              ...(filtro.tipo ? { type: filtro.tipo } : {}), ...(filtro.idParticipante ? { participants: { some: { userId: filtro.idParticipante } } } : {}) };
            const registros = await tx.appointment.findMany({ where, include: INCLUSAO, orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
              skip: (filtro.pagina - 1) * filtro.tamanhoPagina, take: filtro.tamanhoPagina });
            return { compromissos: registros.map((r) => converter(r, autor)), total: await tx.appointment.count({ where }) };
          },
          possuiConflito: async (dados, idIgnorado) => (await tx.appointment.count({ where: { officeId, status: 'AGENDADO',
            ...(idIgnorado ? { id: { not: idIgnorado } } : {}), startsAt: { lt: new Date(dados.fim) }, endsAt: { gt: new Date(dados.inicio) },
            participants: { some: { userId: { in: dados.participantes } } } } })) > 0,
          criar: async (dados) => {
            const id = randomUUID(), agora = new Date();
            await tx.appointment.create({ data: { id, officeId, creatorId: autor.idUsuario, ...colunas(dados), createdAt: agora, updatedAt: agora } });
            await participantesELembretes(id, dados, autor.idUsuario);
            const atual = await consultar(id);
            await registrar(id, 'CRIADO', { ...atual, conflitoConfirmado: dados.confirmarConflito });
            return atual;
          },
          alterar: async (anterior, dados) => {
            await atualizar(anterior, colunas(dados));
            await participantesELembretes(anterior.id, dados, anterior.criador.id);
            const atual = await consultar(anterior.id);
            await registrar(anterior.id, 'ALTERADO', { ...atual, conflitoConfirmado: dados.confirmarConflito }, anterior);
            return atual;
          },
          situacao: async (anterior, situacao, observacao) => {
            await atualizar(anterior, { status: situacao });
            await tx.appointmentReminder.deleteMany({ where: { appointmentId: anterior.id } });
            const atual = await consultar(anterior.id);
            await registrar(anterior.id, situacao, { ...atual, observacao }, anterior);
            return atual;
          },
          historico: async (id) => (await tx.appointmentHistory.findMany({ where: { appointmentId: id, appointment: { officeId } },
            include: { actor: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200 }))
            .map((h) => ({ id: h.id, autor: { id: h.actor.id, nome: h.actor.name }, acao: h.action, anterior: h.previous, atual: h.current, criadoEm: h.createdAt })),
          itensCivis: async (inicio, fim, idParticipante) => {
            const comum = { officeId, ...(idParticipante ? { responsibleId: idParticipante } : {}) };
            const tarefasWhere: Prisma.TaskWhereInput = { ...comum, status: { in: ['PENDING', 'IN_PROGRESS'] }, internalDueDate: { gte: new Date(inicio), lt: new Date(fim) } };
            const prazosWhere: Prisma.JudicialDeadlineWhereInput = { ...comum, status: 'PENDING', dueDate: { gte: new Date(inicio), lt: new Date(fim) } };
            const tarefas = await tx.task.findMany({ where: tarefasWhere, include: { responsible: true }, orderBy: [{ internalDueDate: 'asc' }, { id: 'asc' }], take: 500 });
            const prazos = await tx.judicialDeadline.findMany({ where: prazosWhere, include: { responsible: true }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 500 });
            return { itens: [...tarefas.map((t) => ({ id: t.id, titulo: t.title, data: t.internalDueDate!.toISOString().slice(0, 10), origem: 'TAREFA' as const,
              responsavel: { id: t.responsibleId, nome: t.responsible.name } })), ...prazos.map((p) => ({ id: p.id, titulo: p.description, data: p.dueDate.toISOString().slice(0, 10),
              origem: 'PRAZO' as const, responsavel: { id: p.responsibleId, nome: p.responsible.name } }))],
            total: await tx.task.count({ where: tarefasWhere }) + await tx.judicialDeadline.count({ where: prazosWhere }) };
          },
          lembretes: async (agora) => (await tx.appointmentReminder.findMany({ where: { userId: autor.idUsuario, dueAt: { lte: agora }, readAt: null,
            appointment: { officeId, status: 'AGENDADO' } }, include: { appointment: true }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: 100 }))
            .map((r) => ({ id: r.id, idCompromisso: r.appointmentId, titulo: r.appointment.title, inicio: r.appointment.startsAt.toISOString(),
              avisarEm: r.dueAt.toISOString(), lidaEm: r.readAt?.toISOString() ?? null })),
          marcarLembrete: async (id, agora) => {
            const resultado = await tx.appointmentReminder.updateMany({ where: { id, userId: autor.idUsuario, dueAt: { lte: agora }, appointment: { officeId, status: 'AGENDADO' } }, data: { readAt: agora } });
            if (resultado.count !== 1) throw new ErroAgenda('NAO_ENCONTRADO');
          },
        });
      }, { timeout: 10000 });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2025'].includes(erro.code)) throw new ErroAgenda('CONFLITO');
      throw erro;
    }
  }
}
