import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { AuditoriaAutenticacao } from '../../application/authentication/authentication-contracts.js';

// Uma falha de usuário conhecido aparece na auditoria de cada escritório em que ele atua;
// uma falha sem usuário identificado fica sem escritório e só é consultável no banco.
export class AuditoriaAutenticacaoPrisma implements AuditoriaAutenticacao {
  constructor(private readonly prisma: PrismaClient) {}

  async registrarFalhaDeLogin({ idUsuario, motivo, metadados }: Parameters<AuditoriaAutenticacao['registrarFalhaDeLogin']>[0]): Promise<void> {
    const escritorios = idUsuario
      ? (await this.prisma.membership.findMany({ where: { userId: idUsuario, active: true, office: { status: 'ACTIVE' } }, select: { officeId: true } })).map((v) => v.officeId)
      : [];
    const criadoEm = new Date();
    const registro = (officeId: string | null) => ({ id: randomUUID(), officeId, actorId: idUsuario, action: 'LOGIN_FALHOU', entityType: 'AUTENTICACAO',
      entityId: idUsuario, metadata: { motivo, ...(metadados ?? {}) }, createdAt: criadoEm });
    await this.prisma.auditLog.createMany({ data: escritorios.length > 0 ? escritorios.map(registro) : [registro(null)] });
  }
}
