import type { Prisma } from '@prisma/client';
import type { DadosTokenAcesso } from '../../application/authentication/authentication-contracts.js';
import { ErroPrimeiroAcessoObrigatorio, ErroTokenAcessoInvalido } from '../../application/authentication/authentication-errors.js';
import { validarContextoDoEscritorio } from '../../application/authentication/office-context.js';
import type { AutorEscritorio } from '../../application/tasks/task-contracts.js';
import { registrarAtividadeDaSessao } from './session-activity.js';
import { PAPEIS_DOMINIO } from './team-mapper.js';

// Revalida no PostgreSQL a sessão, o usuário, o escritório e o vínculo ativo antes de cada operação.
export async function abrirContextoDoEscritorio(transacao: Prisma.TransactionClient, contexto: DadosTokenAcesso): Promise<AutorEscritorio> {
  validarContextoDoEscritorio(contexto);
  await transacao.$executeRaw`SET LOCAL statement_timeout = '5s'`;
  const sessao = await transacao.session.findFirst({ where: { id: contexto.idSessao, userId: contexto.idUsuario, activeOfficeId: contexto.idEscritorioAtivo,
    revokedAt: null, expiresAt: { gt: new Date() }, user: { status: 'ACTIVE' }, office: { status: 'ACTIVE' }, membership: { active: true } },
  include: { user: true, membership: true } });
  if (!sessao) throw new ErroTokenAcessoInvalido();
  if (sessao.restricted || sessao.user.mustChangePassword) throw new ErroPrimeiroAcessoObrigatorio();
  await registrarAtividadeDaSessao(transacao, sessao);
  return { idUsuario: sessao.userId, papel: PAPEIS_DOMINIO[sessao.membership.role] };
}

export async function membroAtivoDoEscritorio(transacao: Prisma.TransactionClient, idEscritorio: string, idUsuario: string): Promise<boolean> {
  return (await transacao.membership.count({ where: { officeId: idEscritorio, userId: idUsuario, active: true, user: { status: 'ACTIVE' } } })) === 1;
}

export async function listarMembrosAtivos(transacao: Prisma.TransactionClient, idEscritorio: string) {
  const registros = await transacao.membership.findMany({ where: { officeId: idEscritorio, active: true, user: { status: 'ACTIVE' } },
    include: { user: { select: { id: true, name: true } } }, orderBy: [{ user: { name: 'asc' } }], take: 500 });
  return registros.map((registro) => ({ id: registro.user.id, nome: registro.user.name }));
}
