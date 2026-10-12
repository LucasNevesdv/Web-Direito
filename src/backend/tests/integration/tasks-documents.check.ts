// Verificação real de tarefas, prazos, lembretes e documentos sobre PostgreSQL migrado.
// Históricos são imutáveis por trigger: execute somente em banco descartável (VERIFICACAO_BANCO_DESCARTAVEL=true).
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { PrismaClient } from '@prisma/client';
import type { DadosTokenAcesso } from '../../src/application/authentication/authentication-contracts.js';
import type { ArmazenamentoArquivos } from '../../src/application/documents/document-contracts.js';
import { GestaoDocumentos } from '../../src/application/documents/manage-documents.js';
import { GestaoTarefas } from '../../src/application/tasks/manage-tasks.js';
import { LembretesDePrazos } from '../../src/application/tasks/reminders.js';
import { hojeNoFuso, somarDias } from '../../src/application/tasks/civil-date.js';
import { RepositorioDocumentosPrisma } from '../../src/infrastructure/prisma/prisma-document-repository.js';
import { RepositorioLembretesPrisma } from '../../src/infrastructure/prisma/prisma-reminder-repository.js';
import { RepositorioTarefasPrisma } from '../../src/infrastructure/prisma/prisma-task-repository.js';

if (process.env.VERIFICACAO_BANCO_DESCARTAVEL !== 'true' || !process.env.DATABASE_URL) {
  console.error('Defina DATABASE_URL de um banco descartável e VERIFICACAO_BANCO_DESCARTAVEL=true.');
  process.exit(1);
}
const prisma = new PrismaClient();
const FUSO = 'America/Sao_Paulo';
const hoje = hojeNoFuso(FUSO);
const agora = new Date();

async function criarEscritorio(nome: string) {
  const escritorio = await prisma.office.create({ data: { id: randomUUID(), name: nome, createdAt: agora, updatedAt: agora } });
  const pessoas = await Promise.all(['OWNER', 'LAWYER', 'INTERN'].map(async (papel) => {
    const usuario = await prisma.user.create({ data: { id: randomUUID(), name: `${papel} ${nome}`, email: `${randomUUID()}@verificacao.test`, passwordHash: 'x', createdAt: agora, updatedAt: agora } });
    await prisma.membership.create({ data: { id: randomUUID(), officeId: escritorio.id, userId: usuario.id, role: papel as 'OWNER', createdAt: agora } });
    const sessao = await prisma.session.create({ data: { id: randomUUID(), userId: usuario.id, activeOfficeId: escritorio.id, refreshTokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 3600000), createdAt: agora, updatedAt: agora } });
    const papelDominio = ({ OWNER: 'PROPRIETARIO', LAWYER: 'ADVOGADO', INTERN: 'ESTAGIARIO' } as const)[papel as 'OWNER'];
    return { id: usuario.id, contexto: { idUsuario: usuario.id, idSessao: sessao.id, idEscritorioAtivo: escritorio.id, papel: papelDominio } satisfies DadosTokenAcesso };
  }));
  return { id: escritorio.id, dono: pessoas[0], advogado: pessoas[1], estagiario: pessoas[2] };
}
// O token é verificado em outros testes; aqui o "token" é a chave do contexto já revalidado no banco.
const contextos = new Map<string, DadosTokenAcesso>();
const token = (contexto: DadosTokenAcesso) => { const chave = randomUUID(); contextos.set(chave, contexto); return chave; };
const tokens = { validarTokenDeAcesso: async (chave: string) => contextos.get(chave)! };
const objetos = new Map<string, Buffer>();
const armazenamento: ArmazenamentoArquivos = {
  armazenar: async (chave, conteudo) => { const dados = Buffer.concat(await conteudo.toArray()); objetos.set(chave, dados); return { tamanhoBytes: dados.length, sha256: createHash('sha256').update(dados).digest('hex') }; },
  abrir: async (chave) => Readable.from([objetos.get(chave)!]), remover: async (chave) => { objetos.delete(chave); },
};

try {
  const a = await criarEscritorio('A'), b = await criarEscritorio('B');
  const tarefas = new GestaoTarefas(new RepositorioTarefasPrisma(prisma), tokens, { fusoHorario: FUSO, diasPrazoCritico: 3 });
  const documentos = new GestaoDocumentos(new RepositorioDocumentosPrisma(prisma), tokens, armazenamento, 1024 * 1024);

  // Tarefas: criação, filtros, conclusão, reabertura, histórico e isolamento.
  const tarefa = await tarefas.criarTarefa(token(a.advogado.contexto), { titulo: 'Protocolar contestação', descricao: '', prioridade: 'URGENTE',
    idResponsavel: a.advogado.id, idRevisor: a.dono.id, prazoInterno: somarDias(hoje, -1), vinculo: null });
  assert.equal((await tarefas.listarTarefas(token(a.dono.contexto), { periodo: 'ATRASADAS', prioridade: 'URGENTE', pagina: 1, tamanhoPagina: 20 })).total, 1);
  assert.equal((await tarefas.listarTarefas(token(a.dono.contexto), { periodo: 'HOJE', pagina: 1, tamanhoPagina: 20 })).total, 0);
  await assert.rejects(tarefas.criarTarefa(token(a.advogado.contexto), { titulo: 'Responsável alheio', descricao: '', prioridade: 'BAIXA', idResponsavel: b.advogado.id,
    idRevisor: null, prazoInterno: null, vinculo: null }), { codigo: 'RESPONSAVEL_INVALIDO' });
  await assert.rejects(tarefas.consultarTarefa(token(b.dono.contexto), tarefa.id), { codigo: 'NAO_ENCONTRADO' });
  const comItem = await tarefas.alterarChecklist(token(a.advogado.contexto), tarefa.id, { tipo: 'ADICIONAR', titulo: 'Juntar procuração' }, tarefa.versao);
  const concluida = await tarefas.alterarSituacaoTarefa(token(a.advogado.contexto), tarefa.id, { situacao: 'CONCLUIDA', observacao: 'Protocolo 42', versao: comItem.versao });
  assert.equal(concluida.conclusao?.observacao, 'Protocolo 42');
  await assert.rejects(tarefas.alterarSituacaoTarefa(token(a.advogado.contexto), tarefa.id, { situacao: 'PENDENTE', versao: comItem.versao }), { codigo: 'CONFLITO' });
  await tarefas.alterarSituacaoTarefa(token(a.advogado.contexto), tarefa.id, { situacao: 'PENDENTE', versao: concluida.versao });
  const historico = await tarefas.historicoTarefa(token(a.dono.contexto), tarefa.id);
  assert.deepEqual(historico.map((evento) => evento.acao), ['REABERTA', 'CONCLUIDA', 'CHECKLIST_ADICIONADO', 'CRIADA']);
  await assert.rejects(prisma.$executeRaw`DELETE FROM task_history WHERE task_id = ${tarefa.id}::uuid`, /append-only/);
  await assert.rejects(prisma.$executeRaw`UPDATE tasks SET client_id = gen_random_uuid(), case_id = gen_random_uuid() WHERE id = ${tarefa.id}::uuid`, /tasks_single_link/);

  // Prazo judicial crítico: estagiário não registra; lembretes idempotentes e escalados ao proprietário.
  await assert.rejects(tarefas.criarPrazo(token(a.estagiario.contexto), { descricao: 'Recurso', dataLimite: hoje, origem: 'PUBLICACAO', detalhesOrigem: '',
    idResponsavel: a.advogado.id, idTarefa: null, vinculo: null }), { codigo: 'PROIBIDO' });
  const prazo = await tarefas.criarPrazo(token(a.advogado.contexto), { descricao: 'Contestação', dataLimite: somarDias(hoje, 2), origem: 'INTIMACAO',
    detalhesOrigem: 'DJe', idResponsavel: a.advogado.id, idTarefa: tarefa.id, vinculo: null });
  assert.equal(prazo.critico, true);
  await assert.rejects(tarefas.criarPrazo(token(b.advogado.contexto), { descricao: 'Vínculo alheio', dataLimite: hoje, origem: 'OUTRA', detalhesOrigem: 'x',
    idResponsavel: b.advogado.id, idTarefa: tarefa.id, vinculo: null }), { codigo: 'NAO_ENCONTRADO' });
  const painel = await tarefas.painel(token(a.dono.contexto));
  assert.equal(painel.totalPrazosCriticos, 1);
  assert.equal((await tarefas.painel(token(b.dono.contexto))).totalPrazosCriticos, 0);
  const enviados: string[] = [];
  const lembretes = new LembretesDePrazos(new RepositorioLembretesPrisma(prisma), { enviarEmail: async (mensagem) => { enviados.push(mensagem.destinatario); } },
    'http://localhost:5173', { fusoHorario: FUSO, diasPrazoCritico: 3, maximoTentativas: 3, atrasoInicialSegundos: 30, atrasoMaximoSegundos: 60 });
  const gerados = await lembretes.gerar();
  assert.equal(await lembretes.gerar(), 0, 'geração repetida no mesmo dia não duplica lembretes');
  const notificacoesA = await prisma.notification.findMany({ where: { officeId: a.id } });
  assert.equal(gerados, notificacoesA.length);
  assert.ok(notificacoesA.some((n) => n.userId === a.advogado.id && n.kind === 'TASK_OVERDUE'), 'responsável recebe aviso de tarefa vencida');
  assert.ok(notificacoesA.some((n) => n.userId === a.dono.id && n.kind === 'DEADLINE_CRITICAL' && n.escalated), 'prazo crítico escalado ao proprietário');
  assert.ok(!notificacoesA.some((n) => n.userId === a.estagiario.id), 'estagiário não recebe escalonamento');
  while (await lembretes.enviarPendentes(60, new AbortController().signal));
  assert.equal(await prisma.notification.count({ where: { officeId: a.id, emailStatus: 'SENT' } }), notificacoesA.length);
  assert.equal(enviados.length, notificacoesA.length);
  const { notificacoes } = await tarefas.listarNotificacoes(token(a.dono.contexto));
  await tarefas.marcarNotificacaoLida(token(a.dono.contexto), notificacoes[0].id);
  await assert.rejects(tarefas.marcarNotificacaoLida(token(b.dono.contexto), notificacoes[0].id), { codigo: 'NAO_ENCONTRADO' });

  // Documentos: versões, confidencialidade, inativação, eventos e isolamento.
  const documento = await documentos.enviar(token(a.advogado.contexto), { nome: 'Contrato', descricao: 'Honorários', categoria: 'CONTRATO', confidencial: true, vinculo: null },
    { nomeOriginal: 'contrato.pdf', conteudo: Readable.from([Buffer.from('v1')]) });
  const v2 = await documentos.substituir(token(a.advogado.contexto), documento.id, documento.versao, { nomeOriginal: 'contrato-v2.pdf', conteudo: Readable.from([Buffer.from('versão 2')]) });
  assert.equal(v2.versaoAtual.numero, 2);
  assert.equal(Buffer.concat(await (await documentos.baixar(token(a.dono.contexto), documento.id, 1)).conteudo.toArray()).toString(), 'v1');
  assert.equal((await documentos.listar(token(a.estagiario.contexto), { pesquisa: 'contrato', ativos: true, pagina: 1, tamanhoPagina: 20 })).total, 0, 'confidencial oculto');
  assert.equal((await documentos.listar(token(a.dono.contexto), { pesquisa: 'HONOR', ativos: true, pagina: 1, tamanhoPagina: 20 })).total, 1);
  await assert.rejects(documentos.consultar(token(b.dono.contexto), documento.id), { codigo: 'NAO_ENCONTRADO' });
  await documentos.definirSituacao(token(a.dono.contexto), documento.id, false, v2.versao);
  assert.equal((await documentos.listar(token(a.dono.contexto), { pesquisa: '', ativos: false, pagina: 1, tamanhoPagina: 20 })).total, 1);
  assert.deepEqual((await documentos.eventos(token(a.dono.contexto), documento.id)).map((evento) => evento.acao), ['INATIVADO', 'BAIXADO', 'NOVA_VERSAO', 'CRIADO']);
  await assert.rejects(prisma.$executeRaw`UPDATE document_versions SET size_bytes = 1 WHERE document_id = ${documento.id}::uuid`, /append-only/);
  console.info(JSON.stringify({ verificacao: 'tarefas_prazos_documentos', resultado: 'ok', lembretes: gerados }));
} finally {
  await prisma.$disconnect();
}
