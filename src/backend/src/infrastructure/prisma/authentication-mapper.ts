import type { Session as RegistroSessao, User as RegistroUsuario } from '@prisma/client';
import { Sessao } from '../../domain/sessions/session.js';
import { Usuario } from '../../domain/users/user.js';

export function converterRegistroPrismaEmUsuario(registroUsuario: Omit<RegistroUsuario, 'mustChangePassword'> & { mustChangePassword?: boolean }): Usuario {
  return Usuario.restaurar({ id: registroUsuario.id, nome: registroUsuario.name, email: registroUsuario.email,
    hashSenha: registroUsuario.passwordHash, situacao: registroUsuario.status === 'ACTIVE' ? 'ATIVO' : registroUsuario.status === 'INACTIVE' ? 'INATIVO' : registroUsuario.status,
    criadoEm: registroUsuario.createdAt, atualizadoEm: registroUsuario.updatedAt, deveAlterarSenha: registroUsuario.mustChangePassword });
}

export function converterRegistroPrismaEmSessao(registroSessao: Omit<RegistroSessao, 'restricted' | 'browser' | 'device' | 'maskedIp' | 'lastActivityAt'> & Partial<RegistroSessao>): Sessao {
  return Sessao.restaurar({ id: registroSessao.id, idUsuario: registroSessao.userId, idEscritorioAtivo: registroSessao.activeOfficeId,
    hashTokenRenovacao: registroSessao.refreshTokenHash, expiraEm: registroSessao.expiresAt, revogadaEm: registroSessao.revokedAt,
    criadoEm: registroSessao.createdAt, atualizadoEm: registroSessao.updatedAt, ultimoUsoEm: registroSessao.lastUsedAt, estaRestrita: registroSessao.restricted,
    ...(registroSessao.browser ? { metadados: { navegador: registroSessao.browser, dispositivo: registroSessao.device!, ipMascarado: registroSessao.maskedIp! } } : {}) });
}

export function converterSessaoEmRegistroPrisma(sessao: Sessao) {
  const estado = sessao.obterEstadoAtualDaSessao();
  return { id: estado.id, userId: estado.idUsuario, activeOfficeId: estado.idEscritorioAtivo,
    refreshTokenHash: estado.hashTokenRenovacao, expiresAt: estado.expiraEm, revokedAt: estado.revogadaEm,
    createdAt: estado.criadoEm, updatedAt: estado.atualizadoEm, lastUsedAt: estado.ultimoUsoEm, restricted: sessao.estaRestrita,
    ...(estado.metadados ? { browser: estado.metadados.navegador, device: estado.metadados.dispositivo, maskedIp: estado.metadados.ipMascarado, lastActivityAt: estado.criadoEm } : {}) };
}
