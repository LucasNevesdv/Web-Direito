import type { MembershipRole, Prisma } from '@prisma/client';
import type { PapelVinculoEscritorio } from '../../domain/memberships/membership.js';
import type { MembroEquipe } from '../../application/team/team-contracts.js';
import { PoliticaEquipe } from '../../application/team/team-policy.js';
export const PAPEIS_DOMINIO: Record<MembershipRole, PapelVinculoEscritorio> = { OWNER: 'PROPRIETARIO', ADMIN: 'ADMINISTRADOR', LAWYER: 'ADVOGADO', INTERN: 'ESTAGIARIO', SECRETARY: 'SECRETARIO' };
export const PAPEIS_PRISMA: Record<PapelVinculoEscritorio, MembershipRole> = { PROPRIETARIO: 'OWNER', ADMINISTRADOR: 'ADMIN', ADVOGADO: 'LAWYER', ESTAGIARIO: 'INTERN', SECRETARIO: 'SECRETARY' };
export function converterMembro(registro: Prisma.MembershipGetPayload<{ include: { user: true } }>): MembroEquipe {
  const papel = PAPEIS_DOMINIO[registro.role];
  return { id: registro.id, idUsuario: registro.userId, nome: registro.user.name, email: registro.user.email, papel,
    permissoes: papel === 'PROPRIETARIO' ? PoliticaEquipe.permissoesPadrao(papel) : registro.permissions,
    estaAtivo: registro.active, deveAlterarSenha: registro.user.mustChangePassword, criadoEm: registro.createdAt, versao: registro.version };
}
