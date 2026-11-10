import { Prisma, type PrismaClient } from '@prisma/client';
import type { DadosTokenAcesso } from '../../application/authentication/authentication-contracts.js';
import { PoliticaClientes } from '../../application/clients/client-policy.js';
import { PoliticaCasosProcessos } from '../../application/cases/case-policy.js';
import { ErroPainel, type ConsultaPainel, type GrupoPainel, type RepositorioPainel } from '../../application/dashboard/dashboard-contracts.js';
import { abrirContextoDoEscritorio, listarMembrosAtivos } from './office-access.js';

const link = (rota: string, parametros: Record<string, string>) => `${rota}?${new URLSearchParams(parametros)}`;
const civil = (data: Date | null) => data?.toISOString().slice(0, 10) ?? null;
const banco = (data: string) => new Date(`${data}T00:00:00Z`);
const LIMITE = 10;

// Contagens e amostras compartilham o mesmo filtro e snapshot; cada leitura inclui o escritório da sessão.
export class RepositorioPainelPrisma implements RepositorioPainel {
  constructor(private readonly prisma: PrismaClient) {}
  async consultar(contexto: DadosTokenAcesso, filtro: ConsultaPainel) {
    // A atualização periódica da atividade da sessão pode concorrer com outra requisição.
    // Repete o snapshot completo, incluindo autorização, apenas no conflito de serialização.
    for (let tentativa = 0; ; tentativa++) {
      try { return await this.consultarEmTransacao(contexto, filtro); }
      catch (erro) {
        if (!(erro instanceof Prisma.PrismaClientKnownRequestError) || erro.code !== 'P2034' || tentativa >= 2) throw erro;
      }
    }
  }
  private consultarEmTransacao(contexto: DadosTokenAcesso, filtro: ConsultaPainel) {
    return this.prisma.$transaction(async (tx) => {
      const autor = await abrirContextoDoEscritorio(tx, contexto), officeId = contexto.idEscritorioAtivo;
      const vinculoAutor = await tx.membership.findFirstOrThrow({ where: { officeId, userId: autor.idUsuario, active: true }, select: { permissions: true } });
      const politica = { ...autor, idEscritorio: officeId, permissoes: vinculoAutor.permissions };
      const podeClientes = PoliticaClientes.permissoesEfetivas(politica).includes('CLIENTE_VISUALIZAR');
      const podeCasos = PoliticaCasosProcessos.permissoesEfetivas(politica).includes('CASO_VISUALIZAR');
      const idUsuario = filtro.responsavel === 'EU' ? autor.idUsuario : filtro.responsavel === 'TODOS' ? undefined : filtro.responsavel;
      const vinculo = idUsuario ? await tx.membership.findFirst({ where: { officeId, userId: idUsuario, active: true, user: { status: 'ACTIVE' } }, select: { id: true } }) : null;
      if (idUsuario && !vinculo) throw new ErroPainel();
      const responsavel: Record<string, string> = idUsuario ? { idResponsavel: idUsuario } : {};
      const vinculoFiltro: Record<string, string> = vinculo ? { idVinculoResponsavel: vinculo.id } : {};
      const atribuicao = idUsuario ? { responsibleId: idUsuario } : {};
      const atribuicaoVinculo = vinculo ? { responsibleMembershipId: vinculo.id } : {};
      const hoje = banco(filtro.hoje), ate = banco(filtro.ate), critico = banco(filtro.limiteCritico);
      async function tarefas(periodo: 'HOJE' | 'ATRASADAS' | 'FUTURAS'): Promise<GrupoPainel> {
        const where: Prisma.TaskWhereInput = { officeId, ...atribuicao, status: { in: ['PENDING', 'IN_PROGRESS'] },
          internalDueDate: periodo === 'HOJE' ? hoje : periodo === 'ATRASADAS' ? { lt: hoje } : { gt: hoje, lte: ate } };
        const registros = await tx.task.findMany({ where, select: { id: true, title: true, internalDueDate: true },
          orderBy: [{ internalDueDate: 'asc' }, { id: 'asc' }], take: LIMITE });
        return { total: await tx.task.count({ where }), href: link('/tarefas', { periodo, ...responsavel, ...(periodo === 'FUTURAS' ? { ate: filtro.ate } : {}) }),
          itens: registros.map((r) => ({ id: r.id, titulo: r.title, data: civil(r.internalDueDate), href: link('/tarefas', { id: r.id }) })) };
      }
      async function prazos(proximos: boolean): Promise<GrupoPainel> {
        const where: Prisma.JudicialDeadlineWhereInput = { officeId, ...atribuicao, status: 'PENDING',
          dueDate: proximos ? { gt: critico, lte: ate } : { lte: critico } };
        const registros = await tx.judicialDeadline.findMany({ where, select: { id: true, description: true, dueDate: true },
          orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: LIMITE });
        return { total: await tx.judicialDeadline.count({ where }), href: link('/prazos', { ...responsavel, situacao: 'PENDENTE',
          ...(proximos ? { depois: filtro.limiteCritico, ate: filtro.ate } : { somenteCriticos: 'true' }) }),
          itens: registros.map((r) => ({ id: r.id, titulo: r.description, data: civil(r.dueDate), href: link('/prazos', { id: r.id }) })) };
      }
      const whereAgenda: Prisma.AppointmentWhereInput = { officeId, status: 'AGENDADO', endsAt: { gt: filtro.agora },
        startsAt: { lt: filtro.fimCompromissos }, ...(idUsuario ? { participants: { some: { userId: idUsuario } } } : {}) };
      const agenda = await tx.appointment.findMany({ where: whereAgenda, select: { id: true, title: true, startsAt: true },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }], take: LIMITE });
      const compromissos: GrupoPainel = { total: await tx.appointment.count({ where: whereAgenda }),
        href: link('/agenda', { inicioPainel: filtro.agora.toISOString(), fimPainel: filtro.fimCompromissos.toISOString(), ...(idUsuario ? { idParticipante: idUsuario } : {}) }),
        itens: agenda.map((r) => ({ id: r.id, titulo: r.title, data: r.startsAt.toISOString(), href: link('/agenda', { id: r.id }) })) };
      const whereCaso: Prisma.LegalCaseWhereInput = { officeId, status: 'ACTIVE', ...atribuicaoVinculo };
      const whereInativos = { ...whereCaso, lastActivityAt: { lte: new Date(filtro.agora.getTime() - filtro.dias * 86400000) } };
      let casosSemAtividade: GrupoPainel | null = null;
      if (podeCasos) {
        const casos = await tx.legalCase.findMany({ where: whereInativos, select: { id: true, title: true, lastActivityAt: true },
          orderBy: [{ lastActivityAt: 'asc' }, { id: 'asc' }], take: LIMITE });
        casosSemAtividade = { total: await tx.legalCase.count({ where: whereInativos }),
          href: link('/casos', { semAtividadeDesdeDias: String(filtro.dias), ...vinculoFiltro }),
          itens: casos.map((r) => ({ id: r.id, titulo: r.title, data: r.lastActivityAt.toISOString(), href: link('/casos', { id: r.id }) })) };
      }
      return { hoje: filtro.hoje, ate: filtro.ate, dias: filtro.dias, responsavel: idUsuario ?? 'TODOS', idUsuario: autor.idUsuario,
        membros: await listarMembrosAtivos(tx, officeId),
        tarefas: { hoje: await tarefas('HOJE'), atrasadas: await tarefas('ATRASADAS'), futuras: await tarefas('FUTURAS') },
        prazosCriticos: await prazos(false), prazosProximos: await prazos(true), compromissos, casosSemAtividade,
        clientesAtivos: podeClientes ? { total: await tx.client.count({ where: { officeId, status: 'ACTIVE', ...atribuicaoVinculo } }),
          href: link('/clientes', { situacao: 'ATIVO', ...vinculoFiltro }) } : null,
        casosAtivos: podeCasos ? { total: await tx.legalCase.count({ where: whereCaso }), href: link('/casos', { situacao: 'ATIVO', ...vinculoFiltro }) } : null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
  }
}
