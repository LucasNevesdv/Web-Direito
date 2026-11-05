// Verificação real da trilha de auditoria e da administração do escritório sobre PostgreSQL migrado.
// A auditoria é imutável por trigger: execute somente em banco descartável (VERIFICACAO_BANCO_DESCARTAVEL=true).
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { PrismaClient } from '@prisma/client';
import type { DadosTokenAcesso } from '../../src/application/authentication/authentication-contracts.js';
import { AutenticacaoDeUsuario } from '../../src/application/authentication/authenticate-user.js';
import { EncerramentoDeSessao } from '../../src/application/authentication/logout-session.js';
import { GestaoAdministracao } from '../../src/application/administration/manage-administration.js';
import type { ArmazenamentoArquivos } from '../../src/application/documents/document-contracts.js';
import { GestaoDocumentos } from '../../src/application/documents/manage-documents.js';
import { GestaoTarefas } from '../../src/application/tasks/manage-tasks.js';
import { GestaoEquipe } from '../../src/application/team/manage-team.js';
import { RepositorioAdministracaoPrisma } from '../../src/infrastructure/prisma/prisma-administration-repository.js';
import { RepositorioAutenticacaoPrisma } from '../../src/infrastructure/prisma/prisma-authentication-repository.js';
import { RepositorioDocumentosPrisma } from '../../src/infrastructure/prisma/prisma-document-repository.js';
import { AuditoriaAutenticacaoPrisma } from '../../src/infrastructure/prisma/prisma-login-audit.js';
import { RepositorioTarefasPrisma } from '../../src/infrastructure/prisma/prisma-task-repository.js';
import { RepositorioEquipePrisma } from '../../src/infrastructure/prisma/prisma-team-repository.js';
import { ProtecaoDeSenhasArgon2 } from '../../src/infrastructure/security/argon2-password-hasher.js';
import { TokensAcessoJose } from '../../src/infrastructure/security/jose-access-tokens.js';
import { TokensRenovacaoCriptograficos } from '../../src/infrastructure/security/crypto-refresh-tokens.js';

if (process.env.VERIFICACAO_BANCO_DESCARTAVEL !== 'true' || !process.env.DATABASE_URL) {
  console.error('Defina DATABASE_URL de um banco descartável e VERIFICACAO_BANCO_DESCARTAVEL=true.');
  process.exit(1);
}
const prisma = new PrismaClient();
const agora = new Date();
const SENHA = 'senha de verificacao segura';
const protecao = new ProtecaoDeSenhasArgon2();

async function criarEscritorio(nome: string) {
  const escritorio = await prisma.office.create({ data: { id: randomUUID(), name: nome, createdAt: agora, updatedAt: agora } });
  const hash = await protecao.gerarHashDaSenha(SENHA);
  const pessoas = await Promise.all(['OWNER', 'LAWYER', 'INTERN'].map(async (papel) => {
    const email = `${randomUUID()}@verificacao.test`;
    const usuario = await prisma.user.create({ data: { id: randomUUID(), name: `${papel} ${nome}`, email, passwordHash: hash, createdAt: agora, updatedAt: agora } });
    const vinculo = await prisma.membership.create({ data: { id: randomUUID(), officeId: escritorio.id, userId: usuario.id, role: papel as 'OWNER', createdAt: agora } });
    const sessao = await prisma.session.create({ data: { id: randomUUID(), userId: usuario.id, activeOfficeId: escritorio.id, refreshTokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 3600000), createdAt: agora, updatedAt: agora } });
    const papelDominio = ({ OWNER: 'PROPRIETARIO', LAWYER: 'ADVOGADO', INTERN: 'ESTAGIARIO' } as const)[papel as 'OWNER'];
    return { id: usuario.id, email, idVinculo: vinculo.id, contexto: { idUsuario: usuario.id, idSessao: sessao.id, idEscritorioAtivo: escritorio.id, papel: papelDominio } satisfies DadosTokenAcesso };
  }));
  return { id: escritorio.id, dono: pessoas[0], advogado: pessoas[1], estagiario: pessoas[2] };
}
// O token é verificado em outros testes; aqui o "token" é a chave do contexto já revalidado no banco.
const contextos = new Map<string, DadosTokenAcesso>();
const token = (contexto: DadosTokenAcesso) => { const chave = randomUUID(); contextos.set(chave, contexto); return chave; };
const tokens = { validarTokenDeAcesso: async (chave: string) => contextos.get(chave)!, criarTokenDeAcesso: async () => 'nao-usado' };
const objetos = new Map<string, Buffer>();
const armazenamento: ArmazenamentoArquivos = {
  armazenar: async (chave, conteudo) => { const dados = Buffer.concat(await conteudo.toArray()); objetos.set(chave, dados); return { tamanhoBytes: dados.length, sha256: createHash('sha256').update(dados).digest('hex') }; },
  abrir: async (chave) => Readable.from([objetos.get(chave)!]), remover: async (chave) => { objetos.delete(chave); },
};
const auditoriaDo = (idEscritorio: string) => prisma.auditLog.findMany({ where: { officeId: idEscritorio }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

try {
  const a = await criarEscritorio('A'), b = await criarEscritorio('B');
  const tarefas = new GestaoTarefas(new RepositorioTarefasPrisma(prisma), tokens, { fusoHorario: 'America/Sao_Paulo', diasPrazoCritico: 3 });
  const documentos = new GestaoDocumentos(new RepositorioDocumentosPrisma(prisma), tokens, armazenamento, 1024 * 1024);
  const equipe = new GestaoEquipe(new RepositorioEquipePrisma(prisma), tokens, protecao);
  const administracao = new GestaoAdministracao(new RepositorioAdministracaoPrisma(prisma), tokens);

  // Operações dos módulos existentes geram auditoria com escritório, autor e estados.
  const tarefa = await tarefas.criarTarefa(token(a.advogado.contexto), { titulo: 'Protocolar contestação', descricao: '', prioridade: 'ALTA',
    idResponsavel: a.advogado.id, idRevisor: a.dono.id, prazoInterno: null, vinculo: null });
  const concluida = await tarefas.alterarSituacaoTarefa(token(a.advogado.contexto), tarefa.id, { situacao: 'CONCLUIDA', observacao: 'Feito', versao: tarefa.versao });
  const eventosTarefa = (await auditoriaDo(a.id)).filter((r) => r.entityType === 'TAREFA' && r.entityId === tarefa.id);
  assert.deepEqual(eventosTarefa.map((r) => r.action), ['CRIADA', 'CONCLUIDA']);
  assert.ok(eventosTarefa.every((r) => r.actorId === a.advogado.id));
  assert.notEqual(eventosTarefa[1].previous, null, 'conclusão guarda o estado anterior');
  assert.notDeepEqual(eventosTarefa[1].previous, eventosTarefa[1].current);

  // Operação rejeitada não deixa auditoria.
  const antesConflito = (await auditoriaDo(a.id)).length;
  await assert.rejects(tarefas.alterarSituacaoTarefa(token(a.advogado.contexto), tarefa.id, { situacao: 'PENDENTE', versao: tarefa.versao }), { codigo: 'CONFLITO' });
  assert.equal((await auditoriaDo(a.id)).length, antesConflito);
  assert.ok(concluida);

  const documento = await documentos.enviar(token(a.advogado.contexto), { nome: 'Contrato', descricao: '', categoria: 'CONTRATO', confidencial: false, vinculo: null },
    { nomeOriginal: 'contrato.pdf', conteudo: Readable.from([Buffer.from('v1')]) });
  await documentos.consultar(token(a.dono.contexto), documento.id);
  await documentos.baixar(token(a.dono.contexto), documento.id, 1);
  const eventosDocumento = (await auditoriaDo(a.id)).filter((r) => r.entityType === 'DOCUMENTO' && r.entityId === documento.id);
  assert.deepEqual(eventosDocumento.map((r) => r.action), ['CRIADO', 'VISUALIZADO', 'BAIXADO']);
  assert.equal(eventosDocumento[2].actorId, a.dono.id);

  await equipe.alterar(token(a.dono.contexto), a.estagiario.idVinculo, { papel: 'ADVOGADO', permissoes: ['EQUIPE_VISUALIZAR'], versao: 0 });
  const permissao = (await auditoriaDo(a.id)).find((r) => r.entityType === 'MEMBRO' && r.entityId === a.estagiario.idVinculo);
  assert.equal(permissao?.action, 'AUTORIZACAO_ALTERADA');
  assert.equal((permissao?.previous as { papel: string }).papel, 'ESTAGIARIO');
  assert.equal((permissao?.current as { papel: string }).papel, 'ADVOGADO');
  assert.ok((await auditoriaDo(a.id)).some((r) => r.action === 'SESSAO_ENCERRADA' && r.actorId === a.estagiario.id), 'revogação por alteração de papel é auditada');

  // Autenticação: sucesso, falhas e logout.
  const repositorioAutenticacao = new RepositorioAutenticacaoPrisma(prisma);
  const renovacao = new TokensRenovacaoCriptograficos();
  const autenticacao = new AutenticacaoDeUsuario(repositorioAutenticacao, protecao,
    new TokensAcessoJose(randomBytes(32).toString('base64url'), 'verificacao', 'verificacao', 900), renovacao,
    { hashSenhaReferencia: await protecao.gerarHashDaSenha(randomUUID()), validadeAcessoSegundos: 900, validadeRenovacaoSegundos: 3600 },
    undefined, undefined, new AuditoriaAutenticacaoPrisma(prisma));
  const metadados = { navegador: 'Firefox', dispositivo: 'Computador', ipMascarado: '127.0.0.x' };
  const iniciosDoDono = async () => (await auditoriaDo(a.id)).filter((r) => r.action === 'SESSAO_INICIADA' && r.actorId === a.dono.id);
  const iniciosAntes = (await iniciosDoDono()).length;
  const login = await autenticacao.autenticarUsuario({ email: a.dono.email, senha: SENHA }, metadados);
  const inicios = await iniciosDoDono();
  assert.equal(inicios.length, iniciosAntes + 1);
  assert.equal((inicios.at(-1)!.metadata as { navegador: string }).navegador, 'Firefox');
  await assert.rejects(autenticacao.autenticarUsuario({ email: a.dono.email, senha: 'senha errada qualquer' }, metadados), { name: 'ErroCredenciaisInvalidas' });
  const falha = (await auditoriaDo(a.id)).filter((r) => r.action === 'LOGIN_FALHOU');
  assert.equal(falha.length, 1);
  assert.equal(falha[0].actorId, a.dono.id);
  assert.ok(!JSON.stringify(falha[0]).includes('senha errada'), 'senha digitada nunca é gravada');
  const emailInexistente = `${randomUUID()}@ninguem.test`;
  await assert.rejects(autenticacao.autenticarUsuario({ email: emailInexistente, senha: 'qualquer senha' }, metadados), { name: 'ErroCredenciaisInvalidas' });
  const semEscritorio = await prisma.auditLog.findMany({ where: { officeId: null, action: 'LOGIN_FALHOU' } });
  assert.ok(semEscritorio.length >= 1, 'falha com e-mail inexistente fica sem escritório');
  assert.ok(!(await prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM audit_logs WHERE audit_logs::text ILIKE ${'%' + emailInexistente + '%'}`)[0].total, 'e-mail digitado nunca é gravado');
  await new EncerramentoDeSessao(repositorioAutenticacao, renovacao).encerrarSessao(login.tokenRenovacao);
  assert.ok((await auditoriaDo(a.id)).some((r) => r.action === 'SESSAO_ENCERRADA' && r.actorId === a.dono.id), 'logout é auditado');

  // Trilha imutável.
  await assert.rejects(prisma.$executeRaw`UPDATE audit_logs SET action = 'X' WHERE office_id = ${a.id}::uuid`, /append-only/);
  await assert.rejects(prisma.$executeRaw`DELETE FROM audit_logs WHERE office_id = ${a.id}::uuid`, /append-only/);

  // Consulta: permissão, filtros, paginação e isolamento.
  await assert.rejects(administracao.listarAuditoria(token(a.advogado.contexto), { pagina: 1, tamanhoPagina: 20 }), { codigo: 'PROIBIDO' });
  const pagina = await administracao.listarAuditoria(token(a.dono.contexto), { pagina: 1, tamanhoPagina: 2 });
  assert.equal(pagina.registros.length, 2);
  assert.equal(pagina.total, (await auditoriaDo(a.id)).length);
  assert.ok(pagina.registros[0].ocorridoEm >= pagina.registros[1].ocorridoEm, 'mais recentes primeiro');
  const soDocumentos = await administracao.listarAuditoria(token(a.dono.contexto), { pagina: 1, tamanhoPagina: 50, tipoEntidade: 'DOCUMENTO' });
  assert.equal(soDocumentos.total, 3);
  assert.ok(soDocumentos.registros.every((r) => r.tipoEntidade === 'DOCUMENTO'));
  const doAdvogado = await administracao.listarAuditoria(token(a.dono.contexto), { pagina: 1, tamanhoPagina: 50, idUsuario: a.advogado.id, acao: 'CRIADA' });
  assert.deepEqual(doAdvogado.registros.map((r) => [r.acao, r.autor?.id]), [['CRIADA', a.advogado.id]]);
  const futuro = await administracao.listarAuditoria(token(a.dono.contexto), { pagina: 1, tamanhoPagina: 50, de: new Date(Date.now() + 86400000) });
  assert.equal(futuro.total, 0);
  const deB = await administracao.listarAuditoria(token(b.dono.contexto), { pagina: 1, tamanhoPagina: 50 });
  assert.ok(deB.registros.every((r) => r.autor === null || [b.dono.id, b.advogado.id, b.estagiario.id].includes(r.autor.id)), 'B nunca vê registros de A');
  assert.ok(!deB.registros.some((r) => r.idEntidade === tarefa.id));

  // Renomear escritório.
  await assert.rejects(administracao.renomearEscritorio(token(a.advogado.contexto), 'Outro nome'), { codigo: 'PROIBIDO' });
  await assert.rejects(administracao.renomearEscritorio(token(a.dono.contexto), ' x '), { codigo: 'DADOS_INVALIDOS' });
  const renomeado = await administracao.renomearEscritorio(token(a.dono.contexto), '  Escritório Silva  ');
  assert.equal(renomeado.nome, 'Escritório Silva');
  assert.equal((await prisma.office.findUniqueOrThrow({ where: { id: a.id } })).name, 'Escritório Silva');
  const renomeacao = (await auditoriaDo(a.id)).find((r) => r.action === 'ESCRITORIO_RENOMEADO');
  assert.deepEqual([(renomeacao?.previous as { nome: string }).nome, (renomeacao?.current as { nome: string }).nome], ['A', 'Escritório Silva']);
  assert.equal((await administracao.consultarEscritorio(token(a.dono.contexto))).nome, 'Escritório Silva');

  // Exportação: só proprietário, só dados do escritório, sem segredos.
  await assert.rejects(administracao.exportarDados(token(a.advogado.contexto)), { codigo: 'PROIBIDO' });
  const exportacao = await administracao.exportarDados(token(a.dono.contexto));
  const texto = JSON.stringify(exportacao);
  assert.equal(exportacao.escritorio.nome, 'Escritório Silva');
  assert.equal(exportacao.membros.length, 3);
  assert.ok(exportacao.tarefas.some((t) => t.id === tarefa.id));
  assert.ok(exportacao.documentos.some((d) => d.id === documento.id));
  assert.ok(exportacao.auditoria.length > 0);
  for (const proibido of [b.id, b.dono.id, b.dono.email, '$argon2', 'a'.repeat(64), ...objetos.keys()]) {
    assert.ok(!texto.includes(proibido), `exportação não contém ${proibido.slice(0, 12)}`);
  }
  assert.ok((await auditoriaDo(a.id)).some((r) => r.action === 'EXPORTACAO_REALIZADA' && r.actorId === a.dono.id));

  // Limpeza usada pelas verificações de equipe e sessões continua possível; a auditoria permanece.
  const c = await criarEscritorio('C');
  await equipe.alterar(token(c.dono.contexto), c.estagiario.idVinculo, { papel: 'ADVOGADO', permissoes: [], versao: 0 });
  const usuariosC = [c.dono.id, c.advogado.id, c.estagiario.id];
  const auditoriaC = (await auditoriaDo(c.id)).length;
  assert.ok(auditoriaC > 0);
  await prisma.$transaction(async (transacao) => {
    await transacao.membershipHistory.deleteMany({ where: { membership: { officeId: c.id } } });
    await transacao.session.deleteMany({ where: { userId: { in: usuariosC } } });
    await transacao.membership.deleteMany({ where: { userId: { in: usuariosC } } });
    await transacao.user.deleteMany({ where: { id: { in: usuariosC } } });
    await transacao.office.deleteMany({ where: { id: c.id } });
  });
  assert.equal((await auditoriaDo(c.id)).length, auditoriaC);

  console.info(JSON.stringify({ verificacao: 'auditoria_administracao', resultado: 'ok' }));
} finally {
  await prisma.$disconnect();
}
