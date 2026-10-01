import { Prisma } from '@prisma/client';
import { PoliticaEquipe } from '../../application/team/team-policy.js';
import { ErroEmailJaCadastrado } from '../../application/onboarding/email-already-registered-error.js';
import type { RepositorioCadastroEscritorio } from '../../application/onboarding/office-registration-repository.js';
import { MAPEADOR_ESCRITORIO } from './office-mapper.js';

// Only operations used by onboarding; also accepts Prisma query extensions.
interface TransacaoCadastro {
  office: { create(argumentos: { data: Prisma.OfficeCreateInput }): Promise<unknown> };
  user: { create(argumentos: { data: Prisma.UserCreateInput; select: { id: true } }): Promise<unknown> };
  membership: { create(argumentos: { data: Prisma.MembershipUncheckedCreateInput }): Promise<unknown> };
}

interface ClientePrismaCadastro {
  user: {
    findUnique(argumentos: { where: { email: string }; select: { id: true } }): Promise<{ id: string } | null>;
  };
  $transaction(
    trabalho: (transacao: TransacaoCadastro) => Promise<void>,
    opcoes: { maxWait: number; timeout: number },
  ): Promise<void>;
}

export class RepositorioCadastroEscritorioPrisma implements RepositorioCadastroEscritorio {
  constructor(private readonly prisma: ClientePrismaCadastro) {}

  async possuiUsuarioComEmail(email: string): Promise<boolean> {
    const usuario = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return usuario !== null;
  }

  async salvarCadastroCompleto({ escritorio, usuario, vinculo }: Parameters<RepositorioCadastroEscritorio['salvarCadastroCompleto']>[0]): Promise<void> {
    try {
      await this.prisma.$transaction(async (transacao) => {
        await transacao.office.create({ data: MAPEADOR_ESCRITORIO.converterEscritorioEmRegistroPrisma(escritorio) });
        await transacao.user.create({
          data: {
            id: usuario.id,
            name: usuario.nome,
            email: usuario.email,
            passwordHash: usuario.hashSenha,
            status: usuario.situacao === 'ATIVO' ? 'ACTIVE' : 'INACTIVE',
            createdAt: usuario.criadoEm,
            updatedAt: usuario.atualizadoEm,
          },
          select: { id: true },
        });
        await transacao.membership.create({
          data: {
            id: vinculo.id,
            officeId: vinculo.idEscritorio,
            userId: vinculo.idUsuario,
            role: 'OWNER',
            permissions: PoliticaEquipe.permissoesPadrao('PROPRIETARIO'),
            createdAt: vinculo.criadoEm,
          },
        });
      }, { maxWait: 5000, timeout: 10000 });
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002' &&
        Array.isArray(erro.meta?.target) &&
        erro.meta.target.includes('email')
      ) {
        throw new ErroEmailJaCadastrado();
      }
      throw erro;
    }
  }
}
