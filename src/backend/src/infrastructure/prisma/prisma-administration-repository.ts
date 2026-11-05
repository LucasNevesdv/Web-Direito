import { randomUUID } from 'node:crypto';
import type { AuditLog, Prisma, PrismaClient } from '@prisma/client';
import type { DadosTokenAcesso } from '../../application/authentication/authentication-contracts.js';
import type { FiltroAuditoria, OperacoesAdministracao, RegistroAuditoria, RepositorioAdministracao } from '../../application/administration/administration-contracts.js';
import { abrirContextoDoEscritorio } from './office-access.js';
import { PAPEIS_DOMINIO } from './team-mapper.js';

// A auditoria não tem chave estrangeira para usuários: um autor removido aparece com o identificador e o nome indisponível.
function converterRegistro(registro: AuditLog, nomes: Map<string, string>): RegistroAuditoria {
  return { id: registro.id, ocorridoEm: registro.createdAt,
    autor: registro.actorId ? { id: registro.actorId, nome: nomes.get(registro.actorId) ?? 'Usuário removido' } : null,
    acao: registro.action, tipoEntidade: registro.entityType, idEntidade: registro.entityId, anterior: registro.previous, atual: registro.current, detalhes: registro.metadata };
}

function filtroDaAuditoria(idEscritorio: string, filtro: FiltroAuditoria): Prisma.AuditLogWhereInput {
  return { officeId: idEscritorio,
    ...(filtro.idUsuario ? { actorId: filtro.idUsuario } : {}),
    ...(filtro.tipoEntidade ? { entityType: filtro.tipoEntidade } : {}),
    ...(filtro.acao ? { action: filtro.acao } : {}),
    ...(filtro.de || filtro.ate ? { createdAt: { ...(filtro.de ? { gte: filtro.de } : {}), ...(filtro.ate ? { lte: filtro.ate } : {}) } } : {}) };
}

export class RepositorioAdministracaoPrisma implements RepositorioAdministracao {
  constructor(private readonly prisma: PrismaClient) {}

  async executar<T>(contexto: DadosTokenAcesso, operacao: (operacoes: OperacoesAdministracao) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (transacao) => {
      const autor = await abrirContextoDoEscritorio(transacao, contexto);
      const idEscritorio = contexto.idEscritorioAtivo;

      async function auditar(acao: string, anterior: Prisma.InputJsonValue | undefined, atual: Prisma.InputJsonValue | undefined) {
        await transacao.auditLog.create({ data: { id: randomUUID(), officeId: idEscritorio, actorId: autor.idUsuario, action: acao,
          entityType: 'ESCRITORIO', entityId: idEscritorio, previous: anterior, current: atual, createdAt: new Date() } });
      }

      return operacao({
        autor,
        consultarEscritorio: async () => {
          const escritorio = await transacao.office.findUniqueOrThrow({ where: { id: idEscritorio } });
          return { id: escritorio.id, nome: escritorio.name };
        },
        listarAuditoria: async (filtro) => {
          const where = filtroDaAuditoria(idEscritorio, filtro);
          const [registros, total] = await Promise.all([
            transacao.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              skip: (filtro.pagina - 1) * filtro.tamanhoPagina, take: filtro.tamanhoPagina }),
            transacao.auditLog.count({ where }),
          ]);
          const idsAutores = [...new Set(registros.flatMap((r) => r.actorId ? [r.actorId] : []))];
          const autores = await transacao.user.findMany({ where: { id: { in: idsAutores } }, select: { id: true, name: true } });
          const nomes = new Map(autores.map((a) => [a.id, a.name]));
          return { registros: registros.map((r) => converterRegistro(r, nomes)), total };
        },
        renomearEscritorio: async (nome) => {
          // Serializa renomeações concorrentes para que o nome anterior auditado seja o realmente substituído.
          await transacao.$queryRaw`SELECT id FROM offices WHERE id = ${idEscritorio}::uuid FOR UPDATE`;
          const anterior = await transacao.office.findUniqueOrThrow({ where: { id: idEscritorio } });
          const atual = await transacao.office.update({ where: { id: idEscritorio }, data: { name: nome, updatedAt: new Date() } });
          await auditar('ESCRITORIO_RENOMEADO', { nome: anterior.name }, { nome: atual.name });
          return { id: atual.id, nome: atual.name };
        },
        exportar: async () => {
          const escritorio = await transacao.office.findUniqueOrThrow({ where: { id: idEscritorio } });
          const [membros, tarefas, prazos, documentos, auditoria] = await Promise.all([
            transacao.membership.findMany({ where: { officeId: idEscritorio }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } }),
            transacao.task.findMany({ where: { officeId: idEscritorio }, include: { checklist: { orderBy: { position: 'asc' } }, history: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
            transacao.judicialDeadline.findMany({ where: { officeId: idEscritorio }, include: { history: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
            transacao.document.findMany({ where: { officeId: idEscritorio }, orderBy: { createdAt: 'asc' }, include: {
              versions: { select: { number: true, originalName: true, contentType: true, sizeBytes: true, sha256: true, uploaderId: true, createdAt: true }, orderBy: { number: 'asc' } },
              events: { orderBy: { createdAt: 'asc' } } } }),
            transacao.auditLog.findMany({ where: { officeId: idEscritorio }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
          ]);
          await auditar('EXPORTACAO_REALIZADA', undefined, undefined);
          return {
            geradoEm: new Date(),
            escritorio: { id: escritorio.id, nome: escritorio.name, criadoEm: escritorio.createdAt },
            membros: membros.map((m) => ({ idUsuario: m.user.id, nome: m.user.name, email: m.user.email, papel: PAPEIS_DOMINIO[m.role],
              permissoes: m.permissions, ativo: m.active, criadoEm: m.createdAt })),
            tarefas,
            prazos,
            documentos: documentos.map((d) => ({ ...d, versions: d.versions.map((v) => ({ ...v, sizeBytes: Number(v.sizeBytes) })) })),
            auditoria,
          };
        },
      });
    }, { maxWait: 5000, timeout: 30000 });
  }
}
