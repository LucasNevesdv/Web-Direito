import type { Prisma, PrismaClient } from '@prisma/client';
import { ErroCredenciaisInvalidas } from '../../application/authentication/authentication-errors.js';
import { bloquearUsuarioParaTrocaDeSenha } from './prisma-password-repository.js';
import type { UsuarioComVinculos, RepositorioAutenticacao } from '../../application/authentication/authentication-contracts.js';
import { Sessao } from '../../domain/sessions/session.js';
import { PAPEIS_DOMINIO } from './team-mapper.js';
import { converterRegistroPrismaEmUsuario, converterRegistroPrismaEmSessao, converterSessaoEmRegistroPrisma } from './authentication-mapper.js';

const INCLUSAO_VINCULOS_E_ESCRITORIOS = { memberships: { include: { office: true } } } satisfies Prisma.UserInclude;
type RegistroPrismaDeUsuarioComVinculos = Prisma.UserGetPayload<{ include: typeof INCLUSAO_VINCULOS_E_ESCRITORIOS }>;

function converterRegistroPrismaEmUsuarioComVinculos(registroUsuario: RegistroPrismaDeUsuarioComVinculos): UsuarioComVinculos {
  return {
    usuario: converterRegistroPrismaEmUsuario(registroUsuario),
    vinculos: registroUsuario.memberships.map(({ office: escritorio, role: papel, active }) => ({
      escritorio: { id: escritorio.id, nome: escritorio.name, situacao: escritorio.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO' }, papel: PAPEIS_DOMINIO[papel], estaAtivo: active,
    })),
  };
}

export class RepositorioAutenticacaoPrisma implements RepositorioAutenticacao {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarUsuarioComVinculosPorEmail(email: string): Promise<UsuarioComVinculos | null> {
    const registroUsuario = await this.prisma.user.findUnique({ where: { email }, include: INCLUSAO_VINCULOS_E_ESCRITORIOS });
    return registroUsuario ? converterRegistroPrismaEmUsuarioComVinculos(registroUsuario) : null;
  }

  async salvarSessao(sessao: Sessao, hashSenhaEsperado: string): Promise<void> {
    await this.prisma.$transaction(async (transacao) => {
      await bloquearUsuarioParaTrocaDeSenha(transacao, sessao.idUsuario);
      if (!await transacao.user.findFirst({ where: { id: sessao.idUsuario, passwordHash: hashSenhaEsperado, status: 'ACTIVE', mustChangePassword: sessao.estaRestrita,
        memberships: { some: { officeId: sessao.idEscritorioAtivo, active: true, office: { status: 'ACTIVE' } } } } })) {
        throw new ErroCredenciaisInvalidas();
      }
      await transacao.session.create({ data: converterSessaoEmRegistroPrisma(sessao), select: { id: true } });
    }, { maxWait: 5000, timeout: 10000 });
  }

  async buscarSessaoComUsuarioPorId(id: string) {
    const registroSessao = await this.prisma.session.findUnique({
      where: { id }, include: { user: { include: INCLUSAO_VINCULOS_E_ESCRITORIOS } },
    });
    return registroSessao ? { sessao: converterRegistroPrismaEmSessao(registroSessao), usuarioComVinculos: converterRegistroPrismaEmUsuarioComVinculos(registroSessao.user) } : null;
  }

  async substituirHashDeRenovacao(substituicaoDoHash: { id: string; hashAtual: string; proximoHash: string; agora: Date }): Promise<boolean> {
    const resumoDaAtualizacao = await this.prisma.session.updateMany({
      where: {
        id: substituicaoDoHash.id, refreshTokenHash: substituicaoDoHash.hashAtual, revokedAt: null, expiresAt: { gt: substituicaoDoHash.agora },
        restricted: false, user: { status: 'ACTIVE', mustChangePassword: false }, office: { status: 'ACTIVE' }, membership: { active: true },
      },
      data: { refreshTokenHash: substituicaoDoHash.proximoHash, lastUsedAt: substituicaoDoHash.agora, updatedAt: substituicaoDoHash.agora },
    });
    return resumoDaAtualizacao.count === 1;
  }

  async revogarSessao(id: string, agora: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null }, data: { revokedAt: agora, updatedAt: agora },
    });
  }
}
