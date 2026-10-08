import type { Prisma, PrismaClient } from '@prisma/client';
import type { DadosTokenAcesso, UsuarioComVinculos } from '../../application/authentication/authentication-contracts.js';
import { ErroCredenciaisInvalidas, ErroPrimeiroAcessoObrigatorio, ErroTokenAcessoInvalido } from '../../application/authentication/authentication-errors.js';
import { ErroGestaoSessao, type AutorizacaoSelecao, type RepositorioGestaoSessoes, type SessaoPublica } from '../../application/authentication/session-management-contracts.js';
import type { Sessao } from '../../domain/sessions/session.js';
import { converterSessaoEmRegistroPrisma } from './authentication-mapper.js';
import { converterRegistroPrismaEmUsuarioComVinculos } from './prisma-authentication-repository.js';
import { bloquearUsuarioParaTrocaDeSenha } from './prisma-password-repository.js';
import { validarContextoDoEscritorio } from '../../application/authentication/office-context.js';
import { registrarAtividadeDaSessao } from './session-activity.js';

const LIMITES = { maxWait: 5000, timeout: 10000 };
const INCLUSAO = { memberships: { include: { office: true } } };
async function validarContexto(transacao: Prisma.TransactionClient, contexto: DadosTokenAcesso, agora: Date) {
  validarContextoDoEscritorio(contexto);
  const sessao = await transacao.session.findFirst({ where: { id: contexto.idSessao, userId: contexto.idUsuario, activeOfficeId: contexto.idEscritorioAtivo,
    revokedAt: null, expiresAt: { gt: agora }, user: { status: 'ACTIVE' }, office: { status: 'ACTIVE' }, membership: { active: true } }, include: { user: true } });
  if (!sessao) throw new ErroTokenAcessoInvalido();
  if (sessao.restricted || sessao.user.mustChangePassword) throw new ErroPrimeiroAcessoObrigatorio();
  await registrarAtividadeDaSessao(transacao, sessao, agora);
}
export class RepositorioGestaoSessoesPrisma implements RepositorioGestaoSessoes {
  constructor(private readonly prisma: PrismaClient) {}
  async emitirSelecao(entrada: AutorizacaoSelecao, hashSenhaEsperado: string) {
    await this.prisma.$transaction(async transacao => {
      await bloquearUsuarioParaTrocaDeSenha(transacao, entrada.idUsuario);
      const usuario = await transacao.user.findFirst({ where: { id: entrada.idUsuario, status: 'ACTIVE', passwordHash: hashSenhaEsperado } });
      if (!usuario) throw new ErroCredenciaisInvalidas();
      await transacao.officeSelection.updateMany({ where: { userId: usuario.id, consumedAt: null }, data: { consumedAt: entrada.criadoEm } });
      await transacao.officeSelection.create({ data: { tokenHash: entrada.hash, userId: usuario.id, userUpdatedAt: usuario.updatedAt,
        createdAt: entrada.criadoEm, expiresAt: entrada.expiraEm } });
    }, LIMITES);
  }
  async invalidarSelecao(hash: string, agora: Date) {
    await this.prisma.officeSelection.updateMany({ where: { tokenHash: hash, consumedAt: null }, data: { consumedAt: agora } });
  }
  async selecionar(hash: string, idEscritorio: string, agora: Date, criar: (usuario: UsuarioComVinculos) => Promise<Sessao>) {
    await this.prisma.$transaction(async transacao => {
      await transacao.$executeRaw`SET LOCAL statement_timeout = '5s'`;
      await transacao.$queryRaw`SELECT id FROM offices WHERE id = ${idEscritorio}::uuid FOR UPDATE`;
      const autorizacao = await transacao.officeSelection.findUnique({ where: { tokenHash: hash } });
      if (!autorizacao) throw new ErroGestaoSessao('SELECAO_INVALIDA', 401);
      await bloquearUsuarioParaTrocaDeSenha(transacao, autorizacao.userId);
      agora = new Date(Math.max(agora.getTime(), Date.now()));
      const usuario = await transacao.user.findUnique({ where: { id: autorizacao.userId }, include: INCLUSAO });
      if (!usuario || usuario.status !== 'ACTIVE' || usuario.updatedAt.getTime() !== autorizacao.userUpdatedAt.getTime()) throw new ErroGestaoSessao('SELECAO_INVALIDA', 401);
      const consumiu = await transacao.officeSelection.updateMany({ where: { tokenHash: hash, consumedAt: null, expiresAt: { gt: agora } }, data: { consumedAt: agora } });
      if (consumiu.count !== 1) throw new ErroGestaoSessao('SELECAO_ENCERRADA', 410);
      const sessao = await criar(converterRegistroPrismaEmUsuarioComVinculos(usuario));
      await transacao.session.create({ data: converterSessaoEmRegistroPrisma(sessao) });
    }, LIMITES);
  }
  async trocar(contexto: DadosTokenAcesso, idEscritorio: string, agora: Date, criar: (usuario: UsuarioComVinculos) => Promise<Sessao>) {
    await this.prisma.$transaction(async transacao => {
      await transacao.$executeRaw`SET LOCAL statement_timeout = '5s'`;
      await transacao.$queryRaw`SELECT id FROM offices WHERE id = ${idEscritorio}::uuid FOR UPDATE`;
      await bloquearUsuarioParaTrocaDeSenha(transacao, contexto.idUsuario);
      agora = new Date(Math.max(agora.getTime(), Date.now()));
      try { await validarContexto(transacao, contexto, agora); }
      catch (erro) { if (erro instanceof ErroTokenAcessoInvalido) throw new ErroGestaoSessao('CONFLITO', 409); throw erro; }
      const usuario = await transacao.user.findUniqueOrThrow({ where: { id: contexto.idUsuario }, include: INCLUSAO });
      const novaSessao = await criar(converterRegistroPrismaEmUsuarioComVinculos(usuario));
      const revogou = await transacao.session.updateMany({ where: { id: contexto.idSessao, userId: contexto.idUsuario, activeOfficeId: contexto.idEscritorioAtivo, revokedAt: null }, data: { revokedAt: agora, updatedAt: agora } });
      if (revogou.count !== 1) throw new ErroGestaoSessao('CONFLITO', 409);
      await transacao.session.create({ data: converterSessaoEmRegistroPrisma(novaSessao) });
    }, LIMITES);
  }
  async listar(contexto: DadosTokenAcesso, agora: Date): Promise<SessaoPublica[]> {
    return this.prisma.$transaction(async transacao => {
      await validarContexto(transacao, contexto, agora);
      const registros = await transacao.session.findMany({ where: { userId: contexto.idUsuario }, include: { office: { select: { id: true, name: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 100 });
      if (!registros.some(registro => registro.id === contexto.idSessao)) {
        const atual = await transacao.session.findFirst({ where: { id: contexto.idSessao, userId: contexto.idUsuario }, include: { office: { select: { id: true, name: true } } } });
        if (atual) registros.unshift(atual);
      }
      return registros.map(registro => ({ id: registro.id, escritorio: { id: registro.office.id, nome: registro.office.name }, atual: registro.id === contexto.idSessao,
        navegador: registro.browser, dispositivo: registro.device, ipMascarado: registro.maskedIp, criadoEm: registro.createdAt,
        ultimaAtividadeEm: registro.lastActivityAt, expiraEm: registro.expiresAt, situacao: registro.revokedAt ? 'REVOGADA' : registro.expiresAt <= agora ? 'EXPIRADA' : 'ATIVA' }));
    }, LIMITES);
  }
  async encerrar(contexto: DadosTokenAcesso, alvo: string | 'outras', agora: Date) {
    await this.prisma.$transaction(async transacao => {
      await bloquearUsuarioParaTrocaDeSenha(transacao, contexto.idUsuario);
      await validarContexto(transacao, contexto, agora);
      if (alvo !== 'outras' && !await transacao.session.findFirst({ where: { id: alvo, userId: contexto.idUsuario }, select: { id: true } })) throw new ErroGestaoSessao('NAO_ENCONTRADO', 404);
      await transacao.session.updateMany({ where: { userId: contexto.idUsuario, id: alvo === 'outras' ? { not: contexto.idSessao } : alvo, revokedAt: null }, data: { revokedAt: agora, updatedAt: agora } });
    }, LIMITES);
  }
}
