import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import type { DadosTokenAcesso } from '../../src/application/authentication/authentication-contracts.js';
import { GestaoAgenda } from '../../src/application/agenda/manage-agenda.js';
import type { DadosCompromisso } from '../../src/application/agenda/agenda-contracts.js';
import { RepositorioAgendaPrisma } from '../../src/infrastructure/prisma/prisma-agenda-repository.js';
import { registrarRotasAgenda } from '../../src/presentation/agenda-routes.js';
import { GestaoAdministracao } from '../../src/application/administration/manage-administration.js';
import { RepositorioAdministracaoPrisma } from '../../src/infrastructure/prisma/prisma-administration-repository.js';
import { GestaoTarefas } from '../../src/application/tasks/manage-tasks.js';
import { RepositorioTarefasPrisma } from '../../src/infrastructure/prisma/prisma-task-repository.js';
import { registrarRotasTarefas } from '../../src/presentation/task-routes.js';

if (process.env.VERIFICACAO_BANCO_DESCARTAVEL !== 'true' || !new URL(process.env.DATABASE_URL!).pathname.startsWith('/webdireito_agenda_test_')) throw new Error('Use pnpm run verify:agenda.');
const prisma = new PrismaClient(), agora = new Date();
const contextos = new Map<string, DadosTokenAcesso>();
const tokens = { validarTokenDeAcesso: async (token: string) => { const contexto = contextos.get(token); if (!contexto) throw new Error('Token de teste inválido'); return contexto; } };
const agenda = new GestaoAgenda(new RepositorioAgendaPrisma(prisma), tokens, 'America/Sao_Paulo', () => new Date('2030-01-15T12:00:00Z'));
const app = Fastify(); registrarRotasAgenda(app, agenda, 'http://localhost:5173');
registrarRotasTarefas(app, new GestaoTarefas(new RepositorioTarefasPrisma(prisma), tokens, { fusoHorario: 'America/Sao_Paulo', diasPrazoCritico: 3 }), 'http://localhost:5173');
async function escritorio(nome: string) {
  const officeId = randomUUID(); await prisma.office.create({ data: { id: officeId, name: nome, createdAt: agora, updatedAt: agora } });
  const pessoas = [];
  for (const papel of ['OWNER', 'LAWYER', 'INTERN', 'SECRETARY'] as const) {
    const userId = randomUUID(), sessionId = randomUUID();
    await prisma.user.create({ data: { id: userId, name: `${nome} ${papel}`, email: `${userId}@example.test`, passwordHash: 'teste', createdAt: agora, updatedAt: agora } });
    await prisma.membership.create({ data: { id: randomUUID(), officeId, userId, role: papel, createdAt: agora } });
    await prisma.session.create({ data: { id: sessionId, userId, activeOfficeId: officeId, refreshTokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 3600000), createdAt: agora, updatedAt: agora } });
    contextos.set(userId, { idUsuario: userId, idSessao: sessionId, idEscritorioAtivo: officeId,
      papel: ({ OWNER: 'PROPRIETARIO', LAWYER: 'ADVOGADO', INTERN: 'ESTAGIARIO', SECRETARY: 'SECRETARIO' } as const)[papel] });
    pessoas.push(userId);
  }
  return { id: officeId, dono: pessoas[0], advogado: pessoas[1], estagiario: pessoas[2], secretario: pessoas[3] };
}
try {
  const a = await escritorio('Agenda A'), b = await escritorio('Agenda B');
  const base: DadosCompromisso = { titulo: 'Reunião de preparação', descricao: 'Fictícia', tipo: 'REUNIAO', inicio: '2030-01-15T12:00:00Z', fim: '2030-01-15T13:00:00Z',
    local: 'Sala 1', linkRemoto: 'https://example.com/reuniao', participantes: [a.advogado], vinculo: null, lembreteMinutos: 15, confirmarConflito: false };
  const filtro = { inicio: '2030-01-01T03:00:00Z', fim: '2030-02-01T03:00:00Z', pagina: 1, tamanhoPagina: 100 };
  let evento = await agenda.criar(a.advogado, base);
  assert.equal((await agenda.consultar(a.dono, evento.id)).titulo, base.titulo);
  assert.equal((await agenda.listar(a.dono, filtro)).total, 1);
  assert.equal((await agenda.listar(b.dono, filtro)).total, 0);
  await assert.rejects(agenda.consultar(b.dono, evento.id), { codigo: 'NAO_ENCONTRADO' });
  await assert.rejects(agenda.historico(b.dono, evento.id), { codigo: 'NAO_ENCONTRADO' });
  await assert.rejects(agenda.alterar(a.estagiario, evento.id, { ...base, versao: 0 }), { codigo: 'PROIBIDO' });
  await assert.rejects(agenda.criar(a.dono, { ...base, participantes: [b.advogado] }), { codigo: 'PARTICIPANTE_INVALIDO' });
  await prisma.membership.update({ where: { officeId_userId: { officeId: a.id, userId: a.estagiario } }, data: { active: false } });
  await assert.rejects(agenda.criar(a.dono, { ...base, participantes: [a.estagiario] }), { codigo: 'PARTICIPANTE_INVALIDO' });

  // Conflito precisa de consentimento; horários adjacentes não conflitam.
  await assert.rejects(agenda.criar(a.dono, base), { codigo: 'CONFLITO_HORARIO' });
  const sobreposto = await agenda.criar(a.dono, { ...base, confirmarConflito: true });
  const adjacente = await agenda.criar(a.dono, { ...base, inicio: base.fim, fim: '2030-01-15T14:00:00Z' });
  assert.ok(adjacente.id);
  await agenda.situacao(a.dono, sobreposto.id, { situacao: 'CANCELADO', versao: 0, observacao: 'Teste' });
  const simultaneos = await Promise.allSettled([1, 2].map(() => agenda.criar(a.dono, { ...base, inicio: '2030-01-16T12:00:00Z', fim: '2030-01-16T13:00:00Z' })));
  assert.equal(simultaneos.filter((r) => r.status === 'fulfilled').length, 1, 'apenas uma reserva simultânea pode entrar sem confirmação');
  const falhaConflito = simultaneos.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal(falhaConflito.reason.codigo, 'CONFLITO_HORARIO');

  // Lembretes são persistentes e particulares; edição invalida o agendamento antigo.
  const lembretes = await agenda.lembretes(a.advogado);
  assert.ok(lembretes.some((l) => l.idCompromisso === evento.id));
  assert.deepEqual((await agenda.lembretes(a.advogado)).map((l) => l.id), lembretes.map((l) => l.id));
  await assert.rejects(agenda.marcarLembrete(b.dono, lembretes[0].id), { codigo: 'NAO_ENCONTRADO' });
  await agenda.marcarLembrete(a.advogado, lembretes[0].id);
  assert.ok(!(await agenda.lembretes(a.advogado)).some((l) => l.id === lembretes[0].id));
  evento = await agenda.alterar(a.advogado, evento.id, { ...base, inicio: '2030-01-20T12:00:00Z', fim: '2030-01-20T13:00:00Z', versao: 0 });
  assert.equal(evento.versao, 1);
  await assert.rejects(agenda.alterar(a.advogado, evento.id, { ...base, versao: 0 }), { codigo: 'CONFLITO' });
  assert.ok(!(await agenda.lembretes(a.advogado)).some((l) => l.idCompromisso === evento.id));
  const concorrentes = await Promise.allSettled(['A', 'B'].map((sufixo) => agenda.alterar(a.advogado, evento.id, { ...base,
    titulo: `Edição ${sufixo}`, inicio: evento.inicio, fim: evento.fim, versao: evento.versao })));
  assert.equal(concorrentes.filter((r) => r.status === 'fulfilled').length, 1);
  evento = await agenda.consultar(a.dono, evento.id);
  await agenda.situacao(a.advogado, evento.id, { situacao: 'REALIZADO', versao: evento.versao, observacao: 'Reunião concluída' });
  await assert.rejects(agenda.alterar(a.dono, evento.id, { ...base, versao: evento.versao + 1 }), { codigo: 'ENCERRADO' });
  assert.equal(await prisma.appointmentReminder.count({ where: { appointmentId: evento.id } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { entityId: evento.id, entityType: 'COMPROMISSO' } }), (await agenda.historico(a.dono, evento.id)).length);
  const administracao = new GestaoAdministracao(new RepositorioAdministracaoPrisma(prisma), tokens);
  const exportacao = await administracao.exportarDados(a.dono);
  assert.ok((exportacao.compromissos as Array<{ id: string }>).some((c) => c.id === evento.id));
  assert.equal((await administracao.exportarDados(b.dono)).compromissos?.length, 0);
  await assert.rejects(prisma.$executeRaw`UPDATE appointment_history SET action = 'FORJADO' WHERE appointment_id = ${evento.id}::uuid`, /append-only/);

  // Vínculos reais aos três módulos, inclusive rejeição entre escritórios.
  const cliente = await prisma.client.create({ data: { id: randomUUID(), officeId: a.id, type: 'INDIVIDUAL', name: 'Cliente fictício', documentNumber: '12345678909', createdAt: agora, updatedAt: agora } });
  const caso = await prisma.legalCase.create({ data: { id: randomUUID(), officeId: a.id, title: 'Caso fictício', nature: 'JUDICIAL', legalArea: 'CIVEL', lastActivityAt: agora, createdAt: agora, updatedAt: agora } });
  const processo = await prisma.legalProcess.create({ data: { id: randomUUID(), officeId: a.id, caseId: caso.id, cnjNumber: '00000010020308130001', court: 'TJMG', instance: 'FIRST_INSTANCE', proceduralPhase: 'CONHECIMENTO', createdAt: agora, updatedAt: agora } });
  for (const vinculo of [{ tipo: 'CLIENTE' as const, id: cliente.id }, { tipo: 'CASO' as const, id: caso.id }, { tipo: 'PROCESSO' as const, id: processo.id }]) {
    const criado = await agenda.criar(a.dono, { ...base, vinculo, confirmarConflito: true });
    assert.deepEqual((await agenda.consultar(a.dono, criado.id)).vinculo, vinculo);
    await assert.rejects(agenda.criar(b.dono, { ...base, participantes: [b.dono], vinculo }), { codigo: 'VINCULO_INVALIDO' });
  }
  assert.equal((await agenda.listar(a.dono, { ...filtro, idParticipante: a.secretario })).total, 0);
  assert.equal((await agenda.listar(a.dono, { ...filtro, tipo: 'PERICIA' })).total, 0);
  // O acesso compartilhado ao compromisso não concede acesso aos cadastros vinculados.
  for (const [vinculo, rotulo, permissao] of [
    [{ tipo: 'CLIENTE', id: cliente.id }, cliente.name, 'CLIENTE_VISUALIZAR'],
    [{ tipo: 'CASO', id: caso.id }, caso.title, 'CASO_VISUALIZAR'],
    [{ tipo: 'PROCESSO', id: processo.id }, processo.cnjNumber, 'CASO_VISUALIZAR'],
  ] as const) {
    const dados = { ...base, vinculo, participantes: [a.secretario], confirmarConflito: true };
    const restrito = await agenda.criar(a.dono, dados);
    const consulta = await agenda.consultar(a.secretario, restrito.id);
    assert.equal(consulta.rotuloVinculo, null); assert.equal(consulta.vinculoRestrito, true);
    assert.equal((await agenda.listar(a.secretario, filtro)).compromissos.find((c) => c.id === restrito.id)?.rotuloVinculo, null);
    assert.equal((await agenda.proximos(a.secretario, filtro)).compromissos.find((c) => c.id === restrito.id)?.rotuloVinculo, null);
    assert.ok(!JSON.stringify(await agenda.historico(a.secretario, restrito.id)).includes(rotulo));
    const negada = await app.inject({ url: '/api/v1/vinculos?tipo=' + vinculo.tipo, headers: { authorization: 'Bearer ' + a.secretario } });
    assert.equal(negada.statusCode, 403); assert.ok(!negada.body.includes(rotulo));
    await assert.rejects(agenda.criar(a.secretario, dados), { codigo: 'VINCULO_PROIBIDO' });
    const editado = await agenda.alterar(a.secretario, restrito.id, { ...dados, titulo: 'Horário revisado', versao: restrito.versao });
    assert.equal(editado.rotuloVinculo, null); assert.deepEqual(editado.vinculo, vinculo);
    assert.equal((await agenda.consultar(a.dono, restrito.id)).rotuloVinculo, rotulo);
    assert.ok(JSON.stringify(await agenda.historico(a.dono, restrito.id)).includes(rotulo), 'histórico persistido mantém os rótulos para quem pode ler');
    const outroVinculo = vinculo.tipo === 'CLIENTE' ? { tipo: 'CASO' as const, id: caso.id } : { tipo: 'CLIENTE' as const, id: cliente.id };
    await assert.rejects(agenda.alterar(a.secretario, restrito.id, { ...dados, vinculo: outroVinculo, versao: editado.versao }), { codigo: 'VINCULO_PROIBIDO' });
    await prisma.membership.update({ where: { officeId_userId: { officeId: a.id, userId: a.secretario } }, data: { permissions: [permissao] } });
    assert.equal((await agenda.consultar(a.secretario, restrito.id)).rotuloVinculo, rotulo);
    const permitida = await app.inject({ url: '/api/v1/vinculos?tipo=' + vinculo.tipo, headers: { authorization: 'Bearer ' + a.secretario } });
    assert.equal(permitida.statusCode, 200); assert.ok(permitida.json().some((v: { id: string }) => v.id === vinculo.id));
    await prisma.membership.update({ where: { officeId_userId: { officeId: a.id, userId: a.secretario } }, data: { permissions: [] } });
    assert.equal((await agenda.consultar(a.secretario, restrito.id)).rotuloVinculo, null);
  }
  assert.deepEqual((await agenda.configuracao(a.secretario)).tiposVinculoPermitidos, []);
  const longo = await agenda.criar(a.dono, { ...base, tipo: 'PERICIA', inicio: '2030-01-31T23:00:00Z', fim: '2030-02-01T05:00:00Z' });
  assert.ok((await agenda.listar(a.dono, { ...filtro, inicio: '2030-02-01T03:00:00Z', fim: '2030-02-02T03:00:00Z' })).compromissos.some((e) => e.id === longo.id));

  const taskId = randomUUID();
  await prisma.task.create({ data: { id: taskId, officeId: a.id, title: 'Tarefa civil', description: '', status: 'PENDING', priority: 'MEDIUM', responsibleId: a.advogado, creatorId: a.dono, internalDueDate: new Date('2030-01-15'), createdAt: agora, updatedAt: agora } });
  assert.ok((await agenda.itensCivis(a.dono, filtro)).itens.some((i) => i.id === taskId && i.data === '2030-01-15'));
  assert.equal((await agenda.itensCivis(b.dono, filtro)).total, 0);
  for (const tipo of ['AUDIENCIA', 'REUNIAO', 'PERICIA', 'EVENTO_INTERNO'] as const) {
    const item = await agenda.criar(a.dono, { ...base, tipo, confirmarConflito: true });
    assert.equal(item.tipo, tipo);
    await assert.rejects(agenda.situacao(a.advogado, item.id, { situacao: 'CANCELADO', versao: 0, observacao: '' }), { codigo: 'PROIBIDO' });
    assert.equal((await agenda.alterar(a.advogado, item.id, { ...base, tipo, versao: 0, confirmarConflito: true })).versao, 1);
  }
  // Uma falha no histórico reverte também compromisso, participantes e lembretes.
  const contar = async () => [await prisma.appointment.count(), await prisma.appointmentParticipant.count(), await prisma.appointmentReminder.count()];
  const contagemAnterior = await contar();
  await prisma.$executeRawUnsafe(`CREATE FUNCTION falha_agenda_teste() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.current->>'titulo' = 'Falha intencional' THEN RAISE EXCEPTION 'Falha de teste'; END IF; RETURN NEW; END; $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER falha_agenda_teste BEFORE INSERT ON appointment_history FOR EACH ROW EXECUTE FUNCTION falha_agenda_teste()`);
  await assert.rejects(agenda.criar(a.dono, { ...base, titulo: 'Falha intencional', confirmarConflito: true }));
  assert.deepEqual(await contar(), contagemAnterior);
  await prisma.$executeRawUnsafe('DROP TRIGGER falha_agenda_teste ON appointment_history');
  await prisma.$executeRawUnsafe('DROP FUNCTION falha_agenda_teste()');
  // HTTP: autenticação, origem, payload estrito, links perigosos e respostas sanitizadas.
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/agenda/configuracao' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/agenda', headers: { authorization: `Bearer ${a.dono}`, origin: 'https://outra-origem.test' }, payload: base })).statusCode, 403);
  for (const invalido of [{ ...base, fim: base.inicio }, { ...base, linkRemoto: 'javascript:alert(1)' }, { ...base, participantes: [] }, { ...base, campoExtra: 'proibido' }]) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/agenda', headers: { authorization: `Bearer ${a.dono}`, origin: 'http://localhost:5173' }, payload: invalido })).statusCode, 400);
  }
  const http = await app.inject({ method: 'GET', url: `/api/v1/agenda/${evento.id}`, headers: { authorization: `Bearer ${a.dono}` } });
  assert.equal(http.statusCode, 200); assert.equal(http.headers['cache-control'], 'no-store');
  await prisma.membership.update({ where: { officeId_userId: { officeId: a.id, userId: a.advogado } }, data: { active: false } });
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/agenda/configuracao', headers: { authorization: `Bearer ${a.advogado}` } })).statusCode, 401);
  console.info('Agenda: persistência, vínculos, isolamento, concorrência, auditoria, lembretes, datas e HTTP aprovados.');
} finally { await app.close(); await prisma.$disconnect(); }
