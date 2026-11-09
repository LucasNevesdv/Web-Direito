import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import type { DadosTokenAcesso } from '../../src/application/authentication/authentication-contracts.js';
import { GestaoPainel } from '../../src/application/dashboard/manage-dashboard.js';
import { RepositorioPainelPrisma } from '../../src/infrastructure/prisma/prisma-dashboard-repository.js';
import { registrarRotasPainel } from '../../src/presentation/dashboard-routes.js';
import { GestaoTarefas } from '../../src/application/tasks/manage-tasks.js';
import { RepositorioTarefasPrisma } from '../../src/infrastructure/prisma/prisma-task-repository.js';
import { registrarRotasTarefas } from '../../src/presentation/task-routes.js';
import { GestaoAgenda } from '../../src/application/agenda/manage-agenda.js';
import { RepositorioAgendaPrisma } from '../../src/infrastructure/prisma/prisma-agenda-repository.js';
import { registrarRotasAgenda } from '../../src/presentation/agenda-routes.js';

if (process.env.VERIFICACAO_BANCO_DESCARTAVEL !== 'true' || !new URL(process.env.DATABASE_URL!).pathname.startsWith('/webdireito_dashboard_test_')) throw new Error('Use pnpm run verify:dashboard.');
const prisma = new PrismaClient(), agora = new Date('2030-01-16T01:00:00Z');
const config = { fusoHorario: 'America/Sao_Paulo', diasPrazoCritico: 3 };
const contextos = new Map<string, DadosTokenAcesso>();
const tokens = { validarTokenDeAcesso: async (token: string) => {
  const contexto = contextos.get(token); if (!contexto) throw new Error('Token de teste inválido'); return contexto;
} };
const painel = new GestaoPainel(new RepositorioPainelPrisma(prisma), tokens, config, () => agora);
const tarefas = new GestaoTarefas(new RepositorioTarefasPrisma(prisma), tokens, config, () => agora);
const app = Fastify(); registrarRotasPainel(app, painel, 'http://localhost:5173'); registrarRotasTarefas(app, tarefas, 'http://localhost:5173');
registrarRotasAgenda(app, new GestaoAgenda(new RepositorioAgendaPrisma(prisma), tokens, config.fusoHorario, () => agora), 'http://localhost:5173');
async function escritorio(nome: string) {
  const officeId = randomUUID(); await prisma.office.create({ data: { id: officeId, name: nome, createdAt: agora, updatedAt: agora } });
  const pessoas = [];
  for (const papel of ['OWNER', 'LAWYER', 'INTERN', 'SECRETARY'] as const) {
    const id = randomUUID(), sessao = randomUUID(), vinculo = randomUUID();
    await prisma.user.create({ data: { id, name: nome + papel, email: id + '@example.test', passwordHash: 'teste', createdAt: agora, updatedAt: agora } });
    await prisma.membership.create({ data: { id: vinculo, officeId, userId: id, role: papel, createdAt: agora } });
    await prisma.session.create({ data: { id: sessao, userId: id, activeOfficeId: officeId, refreshTokenHash: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(), updatedAt: new Date() } });
    // Papel propositalmente antigo: o repositório deve consultar as permissões atuais.
    contextos.set(id, { idUsuario: id, idSessao: sessao, idEscritorioAtivo: officeId, papel: 'PROPRIETARIO' });
    pessoas.push({ id, vinculo, sessao });
  }
  return { id: officeId, dono: pessoas[0], advogado: pessoas[1], estagiario: pessoas[2], secretario: pessoas[3] };
}
const dia = (data: string) => new Date(data + 'T00:00:00Z');
try {
  const a = await escritorio('Painel A'), b = await escritorio('Painel B');
  const tarefa = async (data: string | null, status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'CANCELED' = 'PENDING', officeId = a.id, usuario = a.dono.id) => {
    return prisma.task.create({ data: { id: randomUUID(), officeId, title: 'Tarefa ' + (data ?? 'sem prazo'), responsibleId: usuario, creatorId: usuario,
      internalDueDate: data ? dia(data) : null, status, createdAt: agora, updatedAt: agora,
      ...(status === 'DONE' ? { completedAt: agora, completedById: usuario } : {}) } });
  };
  for (let i = 0; i < 12; i++) await tarefa('2029-01-01');
  const hoje = await tarefa('2030-01-15'), futura = await tarefa('2030-01-22');
  await tarefa('2030-01-23'); await tarefa('2030-01-15', 'IN_PROGRESS', a.id, a.advogado.id);
  await tarefa(null); await tarefa('2030-01-14', 'DONE'); await tarefa('2030-01-14', 'CANCELED');
  await tarefa('2029-01-01', 'PENDING', b.id, b.dono.id);
  for (const data of ['2029-01-01', '2030-01-15', '2030-01-18', '2030-01-19', '2030-01-22', '2030-01-23']) {
    await prisma.judicialDeadline.create({ data: { id: randomUUID(), officeId: a.id, description: 'Prazo ' + data, dueDate: dia(data), source: 'SUMMONS',
      responsibleId: a.dono.id, confirmedById: a.dono.id, confirmedAt: agora, createdAt: agora, updatedAt: agora } });
  }
  await prisma.judicialDeadline.create({ data: { id: randomUUID(), officeId: a.id, description: 'Prazo encerrado', dueDate: dia('2029-01-01'), source: 'SUMMONS',
    status: 'FULFILLED', responsibleId: a.dono.id, confirmedById: a.dono.id, confirmedAt: agora, createdAt: agora, updatedAt: agora,
    completedAt: agora, completedById: a.dono.id } });
  for (const [inicio, fim, status] of [
    ['2030-01-16T00:00:00Z', '2030-01-16T02:00:00Z', 'AGENDADO'],
    ['2030-01-22T23:00:00Z', '2030-01-23T00:00:00Z', 'AGENDADO'],
    ['2030-01-16T00:00:00Z', '2030-01-16T01:00:00Z', 'AGENDADO'],
    ['2030-01-23T01:00:00Z', '2030-01-23T02:00:00Z', 'AGENDADO'],
    ['2030-01-17T00:00:00Z', '2030-01-17T01:00:00Z', 'CANCELADO'],
    ['2030-01-18T00:00:00Z', '2030-01-18T01:00:00Z', 'REALIZADO'],
  ] as const) {
    await prisma.appointment.create({ data: { id: randomUUID(), officeId: a.id, creatorId: a.dono.id, title: 'Compromisso ' + inicio, description: '', location: '', remoteLink: '',
      type: 'REUNIAO', startsAt: new Date(inicio), endsAt: new Date(fim), status, createdAt: agora, updatedAt: agora,
      participants: { create: [{ userId: a.dono.id }, { userId: a.advogado.id }] } } });
  }
  for (const [status, responsavel] of [['ACTIVE', a.dono.vinculo], ['ACTIVE', a.advogado.vinculo], ['INACTIVE', a.dono.vinculo]] as const) {
    await prisma.client.create({ data: { id: randomUUID(), officeId: a.id, type: 'INDIVIDUAL', name: 'Cliente fictício', documentNumber: randomUUID().slice(0, 14),
      status, responsibleMembershipId: responsavel, createdAt: agora, updatedAt: agora } });
  }
  for (const [dias, status] of [[7, 'ACTIVE'], [6, 'ACTIVE'], [31, 'ACTIVE'], [45, 'ARCHIVED']] as const) {
    await prisma.legalCase.create({ data: { id: randomUUID(), officeId: a.id, title: 'Caso ' + dias, nature: 'JUDICIAL', legalArea: 'CIVEL', status,
      responsibleMembershipId: a.dono.vinculo, lastActivityAt: new Date(agora.getTime() - dias * 86400000), createdAt: agora, updatedAt: agora } });
  }
  const resumo = await painel.consultar(a.dono.id, { dias: 7, responsavel: 'EU' });
  assert.equal(resumo.hoje, '2030-01-15', 'usa data do escritório, não UTC nem computador');
  assert.equal(resumo.tarefas.hoje.total, 1); assert.equal(resumo.tarefas.atrasadas.total, 12);
  assert.equal(resumo.tarefas.atrasadas.itens.length, 10, 'contagem não é limitada pela amostra');
  assert.equal(resumo.tarefas.futuras.total, 1);
  assert.equal(resumo.prazosCriticos.total, 3); assert.equal(resumo.prazosProximos.total, 2);
  assert.equal(resumo.compromissos.total, 2, 'inclui em andamento, exclui fim exato, início no limite e encerrados');
  assert.equal(resumo.clientesAtivos?.total, 1); assert.equal(resumo.casosAtivos?.total, 3); assert.equal(resumo.casosSemAtividade?.total, 2);
  assert.equal(resumo.tarefas.hoje.itens[0].href, '/tarefas?id=' + hoje.id);
  assert.equal(resumo.tarefas.futuras.itens[0].id, futura.id);
  const trinta = await painel.consultar(a.dono.id, { dias: 30, responsavel: 'EU' });
  assert.equal(trinta.tarefas.futuras.total, 2); assert.equal(trinta.casosSemAtividade?.total, 1);
  assert.equal(trinta.tarefas.atrasadas.total, 12);
  const todos = await painel.consultar(a.dono.id, { dias: 7, responsavel: 'TODOS' });
  assert.equal(todos.tarefas.hoje.total, 2); assert.equal(todos.clientesAtivos?.total, 2); assert.equal(todos.compromissos.total, 2);
  assert.equal((await painel.consultar(a.dono.id, { dias: 7, responsavel: a.advogado.id })).tarefas.hoje.total, 1);
  const outro = await painel.consultar(b.dono.id, { dias: 7, responsavel: 'TODOS' });
  assert.equal(outro.tarefas.atrasadas.total, 1); assert.equal(outro.compromissos.total, 0); assert.equal(outro.casosAtivos?.total, 0);
  await assert.rejects(painel.consultar(a.dono.id, { dias: 7, responsavel: b.dono.id }), { codigo: 'DADOS_INVALIDOS' });
  const restrito = await painel.consultar(a.secretario.id, { dias: 7, responsavel: 'TODOS' });
  assert.equal(restrito.clientesAtivos, null); assert.equal(restrito.casosAtivos, null); assert.equal(restrito.casosSemAtividade, null);
  assert.equal(restrito.tarefas.hoje.total, 2);
  assert.equal((await painel.consultar(a.estagiario.id, { dias: 7, responsavel: 'TODOS' })).casosAtivos?.total, 3);
  await prisma.membership.update({ where: { id: a.secretario.vinculo }, data: { permissions: ['CLIENTE_VISUALIZAR', 'CASO_VISUALIZAR'] } });
  assert.equal((await painel.consultar(a.secretario.id, { dias: 7, responsavel: 'TODOS' })).casosAtivos?.total, 3);
  await prisma.membership.update({ where: { id: a.secretario.vinculo }, data: { permissions: [] } });
  assert.equal((await painel.consultar(a.secretario.id, { dias: 7, responsavel: 'TODOS' })).casosAtivos, null);
  // Links das amostras e contagens abrem consultas reais com o mesmo responsável e corte.
  for (const grupo of [resumo.tarefas.hoje, resumo.tarefas.atrasadas, resumo.tarefas.futuras, resumo.prazosCriticos, resumo.prazosProximos]) {
    const resposta = await app.inject({ url: '/api/v1' + grupo.href, headers: { authorization: 'Bearer ' + a.dono.id } });
    assert.equal(resposta.statusCode, 200, resposta.body); assert.equal(resposta.json().total, grupo.total);
    const registro = await app.inject({ url: '/api/v1' + grupo.itens[0].href.replace('?id=', '/'), headers: { authorization: 'Bearer ' + a.dono.id } });
    assert.equal(registro.statusCode, 200);
  }
  const endpoint = await app.inject({ url: '/api/v1/painel/resumo', headers: { authorization: 'Bearer ' + a.dono.id } });
  const qAgenda = new URL(resumo.compromissos.href, 'http://localhost').searchParams;
  const consultaAgenda = new URLSearchParams({ inicio: qAgenda.get('inicioPainel')!, fim: qAgenda.get('fimPainel')!, idParticipante: qAgenda.get('idParticipante')! });
  const listaAgenda = await app.inject({ url: '/api/v1/agenda/proximos?' + consultaAgenda, headers: { authorization: 'Bearer ' + a.dono.id } });
  assert.equal(listaAgenda.statusCode, 200, listaAgenda.body); assert.equal(listaAgenda.json().total, resumo.compromissos.total);
  assert.deepEqual(listaAgenda.json().compromissos.map((c: { id: string }) => c.id), resumo.compromissos.itens.map((i) => i.id));
  assert.equal(endpoint.statusCode, 200); assert.equal(endpoint.headers['cache-control'], 'no-store');
  await prisma.session.update({ where: { id: a.dono.sessao }, data: { lastActivityAt: new Date(Date.now() - 600000) } });
  const concorrentes = await Promise.all(Array.from({ length: 5 }, () => painel.consultar(a.dono.id, { dias: 7, responsavel: 'EU' })));
  assert.ok(concorrentes.every((p) => p.tarefas.atrasadas.total === 12), 'requisições concorrentes após inatividade preservam snapshot e sessão');
  assert.equal((await app.inject({ url: '/api/v1/painel/resumo' })).statusCode, 401);
  for (const query of ['dias=0', 'dias=8', 'dias=366', 'responsavel=invalido', 'officeId=' + b.id]) {
    assert.equal((await app.inject({ url: '/api/v1/painel/resumo?' + query, headers: { authorization: 'Bearer ' + a.dono.id } })).statusCode, 400);
  }
  await prisma.membership.update({ where: { id: a.advogado.vinculo }, data: { active: false } });
  await assert.rejects(painel.consultar(a.dono.id, { dias: 7, responsavel: a.advogado.id }), { codigo: 'DADOS_INVALIDOS' });
  await prisma.session.update({ where: { id: a.dono.sessao }, data: { revokedAt: new Date() } });
  assert.equal((await app.inject({ url: '/api/v1/painel/resumo', headers: { authorization: 'Bearer ' + a.dono.id } })).statusCode, 401);
  console.info('Dashboard: contagens, limites, fuso, filtros, links reais, permissões atuais, isolamento e sessão revogada verificados.');
} finally { await app.close(); await prisma.$disconnect(); }
