import type { PasswordRecovery } from '@prisma/client';
import { RecuperacaoDeSenha } from '../../domain/password-recovery/password-recovery.js';

export function converterRecuperacaoEmRegistroPrisma(recuperacao: RecuperacaoDeSenha): PasswordRecovery {
  const estado = recuperacao.obterEstadoDaRecuperacao();
  return { id: estado.id, userId: estado.idUsuario, tokenHash: estado.hashToken, createdAt: estado.criadoEm,
    expiresAt: estado.expiraEm, usedAt: estado.utilizadoEm, invalidatedAt: estado.invalidadoEm };
}

export function converterRegistroPrismaEmRecuperacao(registro: PasswordRecovery): RecuperacaoDeSenha {
  return RecuperacaoDeSenha.restaurar({ id: registro.id, idUsuario: registro.userId, hashToken: registro.tokenHash,
    criadoEm: registro.createdAt, expiraEm: registro.expiresAt, utilizadoEm: registro.usedAt, invalidadoEm: registro.invalidatedAt });
}
