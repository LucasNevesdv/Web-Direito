import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { RepositorioDocumentosPrisma } from '../src/infrastructure/prisma/prisma-document-repository.js';
import { RepositorioTarefasPrisma } from '../src/infrastructure/prisma/prisma-task-repository.js';

const idEscritorio = randomUUID(), idAlheio = randomUUID(), idUsuario = randomUUID(), idSessao = randomUUID();
const contexto = { idUsuario, idSessao, idEscritorioAtivo: idEscritorio, papel: 'PROPRIETARIO' as const };
const pessoa = { id: idUsuario, name: 'Pessoa' };
const agora = new Date();
const TAREFA = { id: randomUUID(), officeId: idEscritorio, title: 'Tarefa', description: '', status: 'PENDING', priority: 'MEDIUM', responsibleId: idUsuario,
  reviewerId: null, creatorId: idUsuario, internalDueDate: null, clientId: null, caseId: null, processId: null, completedAt: null, completedById: null,
  completionNote: null, version: 0, createdAt: agora, updatedAt: agora, responsible: pessoa, reviewer: null, creator: pessoa, completedBy: null, checklist: [] };
const PRAZO = { id: randomUUID(), officeId: idEscritorio, description: 'Contestação', dueDate: new Date('2026-10-20T00:00:00Z'), source: 'INTIMATION', sourceDetails: '',
  status: 'PENDING', responsibleId: idUsuario, confirmedById: idUsuario, confirmedAt: agora, taskId: null, clientId: null, caseId: null, processId: null,
  completedAt: null, completedById: null, completionNote: null, version: 0, createdAt: agora, updatedAt: agora, responsible: pessoa, confirmedBy: pessoa, completedBy: null };
const VERSAO = { number: 1, originalName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 10n, sha256: 'a'.repeat(64), uploader: pessoa, createdAt: agora, storageKey: 'k' };
const DOCUMENTO = { id: randomUUID(), officeId: idEscritorio, name: 'Contrato', description: '', category: 'CONTRACT', confidential: false, active: true,
  clientId: null, caseId: null, processId: null, currentVersion: 1, creatorId: idUsuario, inactivatedAt: null, inactivatedById: null, version: 0,
  createdAt: agora, updatedAt: agora, creator: pessoa, inactivatedBy: null, versions: [VERSAO] };

type Chamada = { modelo: string; metodo: string; argumentos: { where?: Record<string, unknown>; data?: Record<string, unknown> } };
// Transação instrumentada: registra cada chamada de delegate e devolve dados somente para o escritório da sessão.
function transacaoInstrumentada(linhas: Record<string, unknown>) {
  const chamadas: Chamada[] = [];
  const delegate = (modelo: string) => new Proxy({}, { get: (_alvo, metodo: string) => vi.fn(async (argumentos: Chamada['argumentos']) => {
    chamadas.push({ modelo, metodo, argumentos });
    const alheio = argumentos?.where?.id === idAlheio;
    if (metodo === 'findFirst') return alheio ? null : linhas[modelo];
    if (metodo === 'findMany') return linhas[modelo] ? [linhas[modelo]] : [];
    if (metodo === 'count') return 1;
    if (metodo === 'updateMany') return { count: 1 };
    return {};
  }) });
  const transacao = new Proxy({}, { get: (_alvo, nome: string) => {
    if (nome === '$executeRaw') return vi.fn(async () => 0);
    if (nome === 'session') return { findFirst: vi.fn(async (argumentos: Chamada['argumentos']) => {
      expect(argumentos.where).toMatchObject({ id: idSessao, userId: idUsuario, activeOfficeId: idEscritorio });
      return { id: idSessao, userId: idUsuario, lastActivityAt: new Date(), revokedAt: null, expiresAt: new Date(Date.now() + 60000), restricted: false,
        user: { mustChangePassword: false }, membership: { role: 'OWNER' } };
    }) };
    return delegate(nome);
  } });
  return { chamadas, prisma: { $transaction: async (executar: (t: unknown) => unknown) => executar(transacao) } as unknown as PrismaClient };
}
// Toda leitura e escrita de negócio filtra pelo escritório ou por relação com registro do escritório.
function exigirEscopo(chamadas: Chamada[], relacoes: Record<string, string>) {
  for (const { modelo, metodo, argumentos } of chamadas) {
    if (metodo === 'create') {
      if (modelo in relacoes) continue;
      expect(argumentos.data?.officeId, `${modelo}.${metodo}`).toBe(idEscritorio);
      continue;
    }
    const where = argumentos.where ?? {};
    const relacao = relacoes[modelo];
    if (modelo === 'membership' || modelo === 'notification') expect(where.officeId, `${modelo}.${metodo}`).toBe(idEscritorio);
    else if (relacao && !('officeId' in where)) expect(where[relacao], `${modelo}.${metodo}`).toEqual({ officeId: idEscritorio });
    else if (!relacao || !['update', 'delete'].includes(metodo)) expect(where.officeId, `${modelo}.${metodo}`).toBe(idEscritorio);
  }
}

describe('fronteiras multiempresa de tarefas, prazos e documentos', () => {
  it('tarefas, prazos, histórico, painel e notificações usam o escritório da sessão', async () => {
    const { chamadas, prisma } = transacaoInstrumentada({ task: TAREFA, judicialDeadline: PRAZO, membership: { user: pessoa } });
    await new RepositorioTarefasPrisma(prisma).executar(contexto, async (operacoes) => {
      await expect(operacoes.consultarTarefa(idAlheio)).rejects.toMatchObject({ situacao: 404 });
      await expect(operacoes.consultarPrazo(idAlheio)).rejects.toMatchObject({ situacao: 404 });
      const tarefa = await operacoes.consultarTarefa(TAREFA.id);
      await operacoes.listarTarefas({ periodo: 'ATRASADAS', hoje: '2026-10-11', pagina: 1, tamanhoPagina: 20 });
      await operacoes.historicoTarefa(TAREFA.id);
      await operacoes.alterarTarefa(tarefa, { titulo: 'Nova', descricao: '', situacao: 'PENDENTE', prioridade: 'ALTA', idResponsavel: idUsuario,
        idRevisor: null, prazoInterno: null, vinculo: null, conclusao: null }, 'ALTERADA');
      const prazo = await operacoes.consultarPrazo(PRAZO.id);
      await operacoes.listarPrazos({ situacao: 'PENDENTE', ate: '2026-10-14', pagina: 1, tamanhoPagina: 10 });
      await operacoes.historicoPrazo(PRAZO.id);
      await operacoes.alterarPrazo(prazo, { descricao: 'Recurso', dataLimite: '2026-10-21', origem: 'PUBLICACAO', detalhesOrigem: '', situacao: 'PENDENTE',
        idResponsavel: idUsuario, idTarefa: null, vinculo: null, confirmacao: { em: agora, idAutor: idUsuario }, conclusao: null }, 'DATA_ALTERADA');
      await operacoes.membroAtivo(randomUUID());
      await operacoes.contarTarefasDoUsuario(idUsuario, '2026-10-11');
      await operacoes.listarNotificacoes(10);
      await operacoes.marcarNotificacaoLida(randomUUID());
      expect(await operacoes.vinculos.existe({ tipo: 'CLIENTE', id: randomUUID() })).toBe(false);
    });
    exigirEscopo(chamadas, { taskHistory: 'task', judicialDeadlineHistory: 'deadline', taskChecklistItem: 'task' });
    expect(chamadas.filter((chamada) => chamada.metodo === 'create').map((chamada) => chamada.modelo).sort()).toEqual(['judicialDeadlineHistory', 'taskHistory']);
  });

  it('documentos, versões, eventos e alterações usam o escritório da sessão', async () => {
    const { chamadas, prisma } = transacaoInstrumentada({ document: DOCUMENTO, documentVersion: VERSAO, documentEvent: undefined });
    await new RepositorioDocumentosPrisma(prisma).executar(contexto, async (operacoes) => {
      await expect(operacoes.consultar(idAlheio)).rejects.toMatchObject({ situacao: 404 });
      const documento = await operacoes.consultar(DOCUMENTO.id);
      await operacoes.listar({ pesquisa: 'contrato', ativos: true, verConfidenciais: false, pagina: 1, tamanhoPagina: 20 });
      await operacoes.versoes(DOCUMENTO.id);
      await operacoes.chaveDaVersao(DOCUMENTO.id, 1);
      await operacoes.eventos(DOCUMENTO.id);
      await operacoes.alterarMetadados(documento, { nome: 'Contrato social', descricao: '', categoria: 'CONTRATO', confidencial: false, vinculo: null });
      await operacoes.definirSituacao(documento, false);
    });
    exigirEscopo(chamadas, { documentVersion: 'document', documentEvent: 'document' });
    const listagem = chamadas.find((chamada) => chamada.modelo === 'document' && chamada.metodo === 'findMany')!;
    // Sem permissão para confidenciais, a listagem restringe aos públicos ou criados pela pessoa.
    expect(JSON.stringify(listagem.argumentos.where)).toContain(`{"OR":[{"confidential":false},{"creatorId":"${idUsuario}"}]}`);
  });
});
