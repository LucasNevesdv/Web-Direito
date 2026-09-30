import type { Prisma, PrismaClient, User } from '@prisma/client';
import type { RepositorioSenhas, TrocaDeSenha, UsuarioParaTrocaDeSenha } from '../../application/passwords/password-contracts.js';
import type { RecuperacaoDeSenha } from '../../domain/password-recovery/password-recovery.js';
import { converterRecuperacaoEmRegistroPrisma, converterRegistroPrismaEmRecuperacao } from './password-recovery-mapper.js';

const converterUsuario = (registro: User): UsuarioParaTrocaDeSenha => ({ id: registro.id, email: registro.email,
  hashSenha: registro.passwordHash, estaAtivo: registro.status === 'ACTIVE' });

export async function bloquearUsuarioParaTrocaDeSenha(transacao: Prisma.TransactionClient, idUsuario: string): Promise<void> {
  await transacao.$executeRaw`SET LOCAL statement_timeout = '5s'`;
  await transacao.$queryRaw`SELECT id FROM users WHERE id = ${idUsuario}::uuid FOR UPDATE`;
}

export class RepositorioSenhasPrisma implements RepositorioSenhas {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarUsuarioPorEmail(email: string) {
    const usuario = await this.prisma.user.findUnique({ where: { email } });
    return usuario ? converterUsuario(usuario) : null;
  }
  async buscarUsuarioPorId(idUsuario: string) {
    const usuario = await this.prisma.user.findUnique({ where: { id: idUsuario } });
    return usuario ? converterUsuario(usuario) : null;
  }
  async criarRecuperacao(recuperacao: RecuperacaoDeSenha, hashSenhaEsperado: string): Promise<boolean> {
    const registro = converterRecuperacaoEmRegistroPrisma(recuperacao);
    return this.prisma.$transaction(async (transacao) => {
      await bloquearUsuarioParaTrocaDeSenha(transacao, registro.userId);
      const usuario = await transacao.user.findFirst({ where: { id: registro.userId, passwordHash: hashSenhaEsperado, status: 'ACTIVE' } });
      if (!usuario) return false;
      await transacao.passwordRecovery.updateMany({ where: { userId: registro.userId, usedAt: null, invalidatedAt: null }, data: { invalidatedAt: registro.createdAt } });
      await transacao.passwordRecovery.create({ data: registro });
      return true;
    }, { maxWait: 5000, timeout: 10000 });
  }
  async buscarRecuperacaoPorHash(hashToken: string) {
    const registro = await this.prisma.passwordRecovery.findUnique({ where: { tokenHash: hashToken }, include: { user: true } });
    return registro ? { recuperacao: converterRegistroPrismaEmRecuperacao(registro), usuario: converterUsuario(registro.user) } : null;
  }
  async invalidarRecuperacao(id: string, agora: Date): Promise<void> {
    await this.prisma.passwordRecovery.updateMany({ where: { id, usedAt: null, invalidatedAt: null }, data: { invalidatedAt: agora } });
  }
  redefinirSenha(dados: TrocaDeSenha & { idRecuperacao: string }): Promise<boolean> { return this.executarTroca(dados, dados.idRecuperacao); }
  alterarSenha(dados: TrocaDeSenha & { idSessao: string }): Promise<boolean> { return this.executarTroca(dados, undefined, dados.idSessao); }

  private executarTroca(dados: TrocaDeSenha, idRecuperacao?: string, idSessao?: string): Promise<boolean> {
    return this.prisma.$transaction(async (transacao) => {
      await bloquearUsuarioParaTrocaDeSenha(transacao, dados.idUsuario);
      const usuario = await transacao.user.findFirst({ where: { id: dados.idUsuario, passwordHash: dados.hashSenhaAnterior, status: 'ACTIVE' } });
      if (!usuario) return false;
      // Reavalia expiração após obter o bloqueio; não aceita o relógio anterior à espera.
      const agora = new Date(Math.max(dados.agora.getTime(), Date.now()));
      if (idSessao && !await transacao.session.findFirst({ where: { id: idSessao, userId: dados.idUsuario, revokedAt: null,
        expiresAt: { gt: agora }, office: { status: 'ACTIVE' }, membership: { role: 'OWNER' } } })) return false;
      if (idRecuperacao) {
        const consumo = await transacao.passwordRecovery.updateMany({ where: { id: idRecuperacao, userId: dados.idUsuario,
          usedAt: null, invalidatedAt: null, expiresAt: { gt: agora } }, data: { usedAt: agora } });
        if (consumo.count !== 1) return false;
      }
      await transacao.user.update({ where: { id: dados.idUsuario }, data: { passwordHash: dados.novoHashSenha, updatedAt: agora } });
      await transacao.session.updateMany({ where: { userId: dados.idUsuario, revokedAt: null }, data: { revokedAt: agora, updatedAt: agora } });
      await transacao.passwordRecovery.updateMany({ where: { userId: dados.idUsuario, usedAt: null, invalidatedAt: null }, data: { invalidatedAt: agora } });
      await transacao.recoveryEmailJob.updateMany({ where: { userId: dados.idUsuario, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'FAILED', errorCode: 'SENHA_ALTERADA', updatedAt: agora, leaseId: null, lockedAt: null, lockedUntil: null } });
      return true;
    }, { maxWait: 5000, timeout: 10000 });
  }
  async removerRecuperacoesExpiradas(): Promise<number> {
    return this.prisma.$executeRaw`DELETE FROM password_recoveries WHERE id IN (
      SELECT id FROM password_recoveries WHERE expires_at <= clock_timestamp()
      AND NOT EXISTS (SELECT 1 FROM recovery_email_jobs WHERE recovery_id = password_recoveries.id AND status IN ('PENDING', 'PROCESSING'))
      ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED)`;
  }
}
