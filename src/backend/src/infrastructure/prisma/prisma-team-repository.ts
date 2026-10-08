import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { DadosTokenAcesso } from '../../application/authentication/authentication-contracts.js';
import { ErroTokenAcessoInvalido, ErroPrimeiroAcessoObrigatorio } from '../../application/authentication/authentication-errors.js';
import type { MembroEquipe, OperacoesEquipe, RepositorioEquipe } from '../../application/team/team-contracts.js';
import { ErroEquipe } from '../../application/team/team-policy.js';
import { converterMembro, PAPEIS_PRISMA } from './team-mapper.js';
import { bloquearUsuarioParaTrocaDeSenha } from './prisma-password-repository.js';
import { validarContextoDoEscritorio } from '../../application/authentication/office-context.js';
import { registrarAtividadeDaSessao } from './session-activity.js';

const estadoAdministrativo = (membro: MembroEquipe) => ({ papel: membro.papel, permissoes: membro.permissoes, estaAtivo: membro.estaAtivo, versao: membro.versao });
export class RepositorioEquipePrisma implements RepositorioEquipe {
  constructor(private readonly prisma: PrismaClient) {}
  async executar<T>(contexto: DadosTokenAcesso, operacao: (equipe: OperacoesEquipe) => Promise<T>): Promise<T> {
    validarContextoDoEscritorio(contexto);
    try {
      return await this.prisma.$transaction(async (transacao) => {
        await transacao.$executeRaw`SET LOCAL statement_timeout = '5s'`;
        // Serializa decisões administrativas do escritório e sua auditoria.
        await transacao.$queryRaw`SELECT id FROM offices WHERE id = ${contexto.idEscritorioAtivo}::uuid FOR UPDATE`;
        const sessao = await transacao.session.findFirst({ where: { id: contexto.idSessao, userId: contexto.idUsuario, activeOfficeId: contexto.idEscritorioAtivo,
          revokedAt: null, expiresAt: { gt: new Date() }, user: { status: 'ACTIVE' }, office: { status: 'ACTIVE' }, membership: { active: true } }, include: { user: true, membership: { include: { user: true } } } });
        if (!sessao) throw new ErroTokenAcessoInvalido();
        if (sessao.restricted || sessao.user.mustChangePassword) throw new ErroPrimeiroAcessoObrigatorio();
        await registrarAtividadeDaSessao(transacao, sessao);
        const autor = converterMembro(sessao.membership);
        async function consultar(id: string) {
          const registro = await transacao.membership.findFirst({ where: { id, officeId: contexto.idEscritorioAtivo }, include: { user: true } });
          if (!registro) throw new ErroEquipe('NAO_ENCONTRADO', 404);
          return converterMembro(registro);
        }
        async function registrarHistorico(atual: MembroEquipe, acao: string, anterior?: MembroEquipe) {
          await transacao.membershipHistory.create({ data: { id: randomUUID(), membershipId: atual.id, actorId: autor.idUsuario, action: acao,
            previous: anterior ? estadoAdministrativo(anterior) : Prisma.DbNull, current: estadoAdministrativo(atual), createdAt: new Date() } });
        }
        return operacao({ autor, consultar,
          listar: async ({ pesquisa, pagina, tamanhoPagina }) => {
            const where: Prisma.MembershipWhereInput = { officeId: contexto.idEscritorioAtivo, ...(pesquisa ? { user: { OR: [
              { name: { contains: pesquisa, mode: 'insensitive' } }, { email: { contains: pesquisa, mode: 'insensitive' } },
            ] } } : {}) };
            const registros = await transacao.membership.findMany({ where, include: { user: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (pagina - 1) * tamanhoPagina, take: tamanhoPagina });
            return { usuarios: registros.map(converterMembro), total: await transacao.membership.count({ where }) };
          },
          historico: async (id) => (await transacao.membershipHistory.findMany({ where: { membershipId: id, membership: { officeId: contexto.idEscritorioAtivo } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 }))
            .map((registro) => ({ id: registro.id, idAutor: registro.actorId, acao: registro.action, anterior: registro.previous, atual: registro.current, criadoEm: registro.createdAt })),
          criar: async (dados) => {
            // Mesmo e-mail, inclusive em escritórios distintos, usa o mesmo lock transacional.
            await transacao.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dados.email}, 0))::text`;
            let usuario = await transacao.user.findUnique({ where: { email: dados.email } });
            if (usuario) {
              const existente = await transacao.membership.findUnique({ where: { officeId_userId: { officeId: contexto.idEscritorioAtivo, userId: usuario.id } } });
              if (existente) throw new ErroEquipe(existente.active ? 'VINCULO_EXISTENTE' : 'VINCULO_INATIVO', 409);
              if (!dados.confirmarContaExistente) throw new ErroEquipe('CONTA_EXISTENTE', 409);
              if (usuario.status !== 'ACTIVE') throw new ErroEquipe('CONFLITO', 409);
            } else {
              if (dados.confirmarContaExistente || !dados.usuarioNovo) throw new ErroEquipe('CONFLITO', 409);
              const novo = dados.usuarioNovo;
              usuario = await transacao.user.create({ data: { id: novo.id, name: novo.nome, email: novo.email, passwordHash: novo.hashSenha,
                status: 'ACTIVE', mustChangePassword: true, createdAt: novo.criadoEm, updatedAt: novo.atualizadoEm } });
            }
            const registro = await transacao.membership.create({ data: { id: randomUUID(), userId: usuario.id, officeId: contexto.idEscritorioAtivo,
              role: PAPEIS_PRISMA[dados.papel], permissions: dados.permissoes, active: true, createdAt: new Date(), updatedAt: new Date() }, include: { user: true } });
            const membro = converterMembro(registro); await registrarHistorico(membro, dados.confirmarContaExistente ? 'VINCULO_CRIADO' : 'USUARIO_CRIADO'); return membro;
          },
          alterar: async (anterior, dados) => {
            // Mesmo bloqueio do login/troca de senha evita sessão criada durante inativação.
            await bloquearUsuarioParaTrocaDeSenha(transacao, anterior.idUsuario);
            const agora = new Date();
            const mudou = await transacao.membership.updateMany({ where: { id: anterior.id, officeId: contexto.idEscritorioAtivo, version: anterior.versao },
              data: { role: PAPEIS_PRISMA[dados.papel], permissions: dados.permissoes, active: dados.estaAtivo, version: { increment: 1 }, updatedAt: agora } });
            if (mudou.count !== 1) throw new ErroEquipe('CONFLITO', 409);
            await transacao.session.updateMany({ where: { userId: anterior.idUsuario, activeOfficeId: contexto.idEscritorioAtivo, revokedAt: null }, data: { revokedAt: agora, updatedAt: agora } });
            const atual = await consultar(anterior.id);
            await registrarHistorico(atual, anterior.estaAtivo !== atual.estaAtivo ? atual.estaAtivo ? 'REATIVADO' : 'INATIVADO' : 'AUTORIZACAO_ALTERADA', anterior);
            return atual;
          },
        });
      }, { maxWait: 5000, timeout: 10000 });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(erro.code)) throw new ErroEquipe('CONFLITO', 409);
      throw erro;
    }
  }
}
