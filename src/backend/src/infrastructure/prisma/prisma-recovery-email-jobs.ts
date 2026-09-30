import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient, RecoveryEmailJob } from '@prisma/client';
import type { CodigoFalhaEnvio, RepositorioTrabalhosRecuperacao, ReservaEnvioRecuperacao, SituacaoEnvioRecuperacao } from '../../application/passwords/recovery-email-jobs.js';
import { bloquearUsuarioParaTrocaDeSenha } from './prisma-password-repository.js';

export const SITUACOES_ENVIO: Record<RecoveryEmailJob['status'], SituacaoEnvioRecuperacao> = {
  PENDING: 'PENDENTE', PROCESSING: 'EM_PROCESSAMENTO', SENT: 'ENVIADO', FAILED: 'FALHA_DEFINITIVA',
};
const SEM_RESERVA = { leaseId: null, lockedAt: null, lockedUntil: null };
const OPCOES_TRANSACAO = { maxWait: 5000, timeout: 10000 };

export class RepositorioTrabalhosRecuperacaoPrisma implements RepositorioTrabalhosRecuperacao {
  constructor(private readonly prisma: PrismaClient) {}

  async registrarSolicitacao(email: string): Promise<void> {
    await this.prisma.$transaction(async (transacao) => {
      await transacao.$executeRaw`SET LOCAL statement_timeout = '5s'`;
      const usuarios = await transacao.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE email = ${email} AND status = 'ACTIVE' FOR UPDATE`;
      const usuario = usuarios[0];
      if (!usuario) return;
      const agora = await this.agora(transacao);
      await transacao.recoveryEmailJob.updateMany({ where: { userId: usuario.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'FAILED', errorCode: 'SUBSTITUIDO', updatedAt: agora, ...SEM_RESERVA } });
      await transacao.passwordRecovery.updateMany({ where: { userId: usuario.id, usedAt: null, invalidatedAt: null }, data: { invalidatedAt: agora } });
      await transacao.recoveryEmailJob.create({ data: { id: randomUUID(), userId: usuario.id, nextAttemptAt: agora, createdAt: agora, updatedAt: agora } });
    }, OPCOES_TRANSACAO);
  }

  async reservarTrabalho(duracaoReservaSegundos: number): Promise<ReservaEnvioRecuperacao | null> {
    const idReserva = randomUUID();
    const registros = await this.prisma.$queryRaw<Array<{ id: string; user_id: string; attempts: number }>>`
      WITH disponivel AS (
        SELECT id FROM recovery_email_jobs
        WHERE (status = 'PENDING' AND next_attempt_at <= clock_timestamp())
           OR (status = 'PROCESSING' AND locked_until <= clock_timestamp())
        ORDER BY next_attempt_at, created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      UPDATE recovery_email_jobs AS trabalho SET status = 'PROCESSING', attempts = attempts + 1,
        lease_id = ${idReserva}::uuid, locked_at = clock_timestamp(),
        locked_until = clock_timestamp() + ${duracaoReservaSegundos} * interval '1 second', updated_at = clock_timestamp()
      FROM disponivel WHERE trabalho.id = disponivel.id
      RETURNING trabalho.id, trabalho.user_id, trabalho.attempts`;
    return registros[0] ? { id: registros[0].id, idUsuario: registros[0].user_id, idReserva, tentativas: registros[0].attempts } : null;
  }

  private async agora(transacao: Prisma.TransactionClient): Promise<Date> {
    return (await transacao.$queryRaw<Array<{ agora: Date }>>`SELECT clock_timestamp() AS agora`)[0].agora;
  }
  private async bloquearReserva(transacao: Prisma.TransactionClient, reserva: ReservaEnvioRecuperacao): Promise<RecoveryEmailJob | null> {
    await bloquearUsuarioParaTrocaDeSenha(transacao, reserva.idUsuario);
    const possuiReserva = await transacao.$queryRaw<Array<{ id: string }>>`SELECT id FROM recovery_email_jobs WHERE id = ${reserva.id}::uuid
      AND user_id = ${reserva.idUsuario}::uuid AND lease_id = ${reserva.idReserva}::uuid
      AND status = 'PROCESSING' AND locked_until > clock_timestamp() FOR UPDATE`;
    return possuiReserva.length ? transacao.recoveryEmailJob.findUnique({ where: { id: reserva.id } }) : null;
  }

  async prepararTentativa(reserva: ReservaEnvioRecuperacao, hashToken: string): Promise<{ email: string } | null> {
    return this.prisma.$transaction(async (transacao) => {
      const trabalho = await this.bloquearReserva(transacao, reserva);
      if (!trabalho) return null;
      const usuario = await transacao.user.findUniqueOrThrow({ where: { id: reserva.idUsuario } });
      const recuperacao = trabalho.recoveryId ? await transacao.passwordRecovery.findUnique({ where: { id: trabalho.recoveryId } }) : null;
      const agora = await this.agora(transacao);
      // Uma recuperação consumida, invalidada externamente ou removida nunca é ressuscitada.
      const invalidadaExternamente = recuperacao?.invalidatedAt && trabalho.errorCode !== 'PROVEDOR_TRANSITORIO';
      if (usuario.status !== 'ACTIVE' || recuperacao?.usedAt || invalidadaExternamente || (trabalho.recoveryId && !recuperacao)) {
        await transacao.recoveryEmailJob.update({ where: { id: trabalho.id }, data: { status: 'FAILED', errorCode: 'RECUPERACAO_INDISPONIVEL', updatedAt: agora, ...SEM_RESERVA } });
        if (recuperacao && !recuperacao.usedAt) await transacao.passwordRecovery.update({ where: { id: recuperacao.id }, data: { invalidatedAt: agora } });
        return null;
      }
      const idRecuperacao = trabalho.recoveryId ?? randomUUID();
      await transacao.passwordRecovery.updateMany({ where: { userId: usuario.id, id: { not: idRecuperacao }, usedAt: null, invalidatedAt: null }, data: { invalidatedAt: agora } });
      const dados = { tokenHash: hashToken, createdAt: agora, expiresAt: new Date(agora.getTime() + 1800000), invalidatedAt: null, usedAt: null };
      await transacao.passwordRecovery.upsert({ where: { id: idRecuperacao }, create: { id: idRecuperacao, userId: usuario.id, ...dados }, update: dados });
      await transacao.recoveryEmailJob.update({ where: { id: trabalho.id }, data: { recoveryId: idRecuperacao, updatedAt: agora, errorCode: null } });
      return { email: usuario.email };
    }, OPCOES_TRANSACAO);
  }

  async concluirEnvio(reserva: ReservaEnvioRecuperacao): Promise<boolean> {
    const quantidade = await this.prisma.$executeRaw`UPDATE recovery_email_jobs SET status = 'SENT', sent_at = clock_timestamp(),
      updated_at = clock_timestamp(), lease_id = NULL, locked_at = NULL, locked_until = NULL, error_code = NULL
      WHERE id = ${reserva.id}::uuid AND lease_id = ${reserva.idReserva}::uuid AND status = 'PROCESSING' AND locked_until > clock_timestamp()`;
    return quantidade === 1;
  }

  async registrarFalha(reserva: ReservaEnvioRecuperacao, codigo: CodigoFalhaEnvio, definitiva: boolean, atrasoSegundos: number): Promise<boolean> {
    return this.prisma.$transaction(async (transacao) => {
      const trabalho = await this.bloquearReserva(transacao, reserva);
      if (!trabalho) return false;
      const agora = await this.agora(transacao);
      if (trabalho.recoveryId) await transacao.passwordRecovery.updateMany({ where: { id: trabalho.recoveryId, usedAt: null }, data: { invalidatedAt: agora } });
      await transacao.recoveryEmailJob.update({ where: { id: trabalho.id }, data: { status: definitiva ? 'FAILED' : 'PENDING', errorCode: codigo,
        nextAttemptAt: new Date(agora.getTime() + atrasoSegundos * 1000), updatedAt: agora, ...SEM_RESERVA } });
      return true;
    }, OPCOES_TRANSACAO);
  }

  async removerTrabalhosAntigos(retencaoDias: number): Promise<number> {
    return this.prisma.$executeRaw`DELETE FROM recovery_email_jobs WHERE id IN (
      SELECT id FROM recovery_email_jobs WHERE status IN ('SENT', 'FAILED')
      AND updated_at < clock_timestamp() - ${retencaoDias} * interval '1 day'
      ORDER BY updated_at LIMIT 500 FOR UPDATE SKIP LOCKED)`;
  }
}
