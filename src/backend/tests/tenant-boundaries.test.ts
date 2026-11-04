import { readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { DadosTokenAcesso } from '../src/application/authentication/authentication-contracts.js';
import { RepositorioEquipePrisma } from '../src/infrastructure/prisma/prisma-team-repository.js';

describe('fronteiras de persistência multiempresa', () => {
  it('exige classificação explícita de todo novo adaptador Prisma', () => {
    // Inventário exige revisão de novos adaptadores; não prova isolamento por texto.
    // A prova comportamental abaixo executa as operações sobre delegates instrumentados.
    expect(readdirSync(new URL('../src/infrastructure/prisma/', import.meta.url)).filter(n => n.startsWith('prisma-')).sort()).toEqual([
      'prisma-authentication-repository.ts', // Global: autenticação por identidade e sessão.
      'prisma-business-links.ts', // Negócio: resolvedores recebem o escritório da sessão.
      'prisma-cases-repository.ts', // Negócio: escopo obrigatório por escritório (RF-031..RF-048).
      'prisma-clients-repository.ts', // Negócio: escopo obrigatório e unicidade por escritório (RF-028).
      'prisma-document-repository.ts', // Negócio: escopo obrigatório; ver work-tenant-boundaries.
      'prisma-office-registration-repository.ts', // Público: criação atômica de um novo tenant.
      'prisma-offices-repository.ts', // Raiz de tenant, interno e sem endpoint de leitura.
      'prisma-password-repository.ts', // Global: credencial da conta autenticada/token de recuperação.
      'prisma-rate-limit-store.ts', // Global: orçamento de abuso por chave HMAC.
      'prisma-recovery-email-jobs.ts', // Global: worker autorizado por lease.
      'prisma-reminder-repository.ts', // Global: worker; destinatários limitados a vínculos ativos do mesmo escritório.
      'prisma-session-management-repository.ts', // Global por usuário; troca verifica vínculo de destino.
      'prisma-task-repository.ts', // Negócio: escopo obrigatório; ver work-tenant-boundaries.
      'prisma-team-repository.ts', // Negócio: escopo obrigatório e autorização atual.
    ]);
  });
  it.each([undefined, {}, { idEscritorioAtivo: randomUUID() }])('rejeita contexto incompleto antes de consultar o banco (%#)', async contexto => {
    const prisma = { $transaction: vi.fn() };
    await expect(new RepositorioEquipePrisma(prisma as unknown as PrismaClient).executar(contexto as DadosTokenAcesso, async () => {})).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('executa leituras, histórico e alteração com escritório explícito em cada delegate e SQL de negócio', async () => {
    const idEscritorio = randomUUID(), idAlheio = randomUUID(), idUsuario = randomUUID(), idSessao = randomUUID(), idMembro = randomUUID();
    const membro = { id: idMembro, officeId: idEscritorio, userId: randomUUID(), role: 'LAWYER', permissions: [], active: true, version: 0, createdAt: new Date(), user: { id: randomUUID(), name: 'Pessoa', email: 'pessoa@example.test', mustChangePassword: false } };
    const autor = { ...membro, id: randomUUID(), userId: idUsuario, role: 'OWNER', permissions: ['EQUIPE_VISUALIZAR'] };
    const escopo = (argumentos: { where: { officeId?: string } }) => { expect(argumentos.where.officeId).toBe(idEscritorio); };
    const transacao = {
      $executeRaw: vi.fn(async () => 0),
      $queryRaw: vi.fn(async (consulta: TemplateStringsArray, ...valores: unknown[]) => {
        // Bloqueio de conta é exceção global documentada; lock do tenant deve usar seu ID.
        if (consulta.join('').includes('FROM offices')) expect(valores).toContain(idEscritorio);
        else expect(consulta.join('')).toContain('FROM users'); return [];
      }),
      session: { findFirst: vi.fn(async (argumentos) => { expect(argumentos.where).toMatchObject({ id: idSessao, userId: idUsuario, activeOfficeId: idEscritorio }); return { user: { mustChangePassword: false }, restricted: false, membership: autor }; }),
        updateMany: vi.fn(async (argumentos) => { expect(argumentos.where).toMatchObject({ activeOfficeId: idEscritorio, userId: membro.userId }); return { count: 1 }; }) },
      membership: {
        findFirst: vi.fn(async (argumentos) => { escopo(argumentos); return argumentos.where.id === idAlheio ? null : membro; }),
        findMany: vi.fn(async (argumentos) => { escopo(argumentos); return [membro]; }), count: vi.fn(async (argumentos) => { escopo(argumentos); return 1; }),
        updateMany: vi.fn(async (argumentos) => { escopo(argumentos); expect(argumentos.where).toMatchObject({ id: idMembro, version: 0 }); return { count: 1 }; }),
      },
      membershipHistory: {
        findMany: vi.fn(async (argumentos) => { expect(argumentos.where).toEqual({ membershipId: idMembro, membership: { officeId: idEscritorio } }); return []; }),
        create: vi.fn(async (argumentos) => { expect(argumentos.data).toMatchObject({ membershipId: idMembro, actorId: idUsuario }); return {}; }),
      },
    };
    const prisma = { $transaction: async (executar: (t: typeof transacao) => unknown) => executar(transacao) };
    const repositorio = new RepositorioEquipePrisma(prisma as unknown as PrismaClient);
    await repositorio.executar({ idUsuario, idSessao, idEscritorioAtivo: idEscritorio, papel: 'PROPRIETARIO' }, async equipe => {
      expect((await equipe.listar({ pagina: 1, tamanhoPagina: 10, pesquisa: '' })).total).toBe(1);
      await expect(equipe.consultar(idAlheio)).rejects.toMatchObject({ situacao: 404 });
      const atual = await equipe.consultar(idMembro); await equipe.historico(idMembro);
      await equipe.alterar(atual, { papel: 'ESTAGIARIO', permissoes: [], estaAtivo: false });
    });
    expect(transacao.membership.updateMany).toHaveBeenCalledOnce(); expect(transacao.membershipHistory.create).toHaveBeenCalledOnce();
  });
});
