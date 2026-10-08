import type { Prisma } from '@prisma/client';

export async function registrarAtividadeDaSessao(prisma: Pick<Prisma.TransactionClient, 'session'>,
  sessao: { id: string; lastActivityAt: Date; revokedAt: Date | null; expiresAt: Date }, agora = new Date()) {
  const limite = new Date(agora.getTime() - 300000);
  if (!sessao.revokedAt && sessao.expiresAt > agora && sessao.lastActivityAt <= limite) {
    // A condição também protege de escritas duplicadas entre instâncias.
    await prisma.session.updateMany({ where: { id: sessao.id, revokedAt: null, expiresAt: { gt: agora }, lastActivityAt: { lte: limite } }, data: { lastActivityAt: agora } });
  }
}
