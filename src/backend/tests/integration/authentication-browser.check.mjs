// Explicit Chrome + PostgreSQL verification. Requires pnpm build; never runs in Vitest.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { carregarAmbiente } from '../../dist/environment.js';
import { criarClientePrisma } from '../../dist/database.js';
import { SignJWT } from 'jose';
import { RepositorioAutenticacaoPrisma } from '../../dist/infrastructure/prisma/prisma-authentication-repository.js';
import { Sessao } from '../../dist/domain/sessions/session.js';
import { ChavesLimiteRequisicoesHmac } from '../../dist/infrastructure/security/hmac-rate-limit-keys.js';
import { RepositorioEscritoriosPrisma } from '../../dist/infrastructure/prisma/prisma-offices-repository.js';
import { MAPEADOR_ESCRITORIO } from '../../dist/infrastructure/prisma/office-mapper.js';
import { converterSessaoEmRegistroPrisma } from '../../dist/infrastructure/prisma/authentication-mapper.js';

const DIRETORIO_BACKEND = fileURLToPath(new URL('../../', import.meta.url));
const DIRETORIO_WORKSPACE = dirname(DIRETORIO_BACKEND.replace(/[\\/]$/, ''));
const ID_EXECUCAO = randomUUID();
const NOME_ESCRITORIO = `RF004-006 browser ${ID_EXECUCAO}`;
const NOME_ADMINISTRADOR = 'Browser Login Verification';
const EMAIL = `rf004-006-browser-${ID_EXECUCAO}@example.invalid`;
const SENHA = randomUUID() + randomUUID();
const LOGS_PROCESSOS = [];
let prisma, backend, frontend, chrome, navegador, segundoNavegador, perfil, possuiRegistros = false;
const SEGREDO_LIMITADOR = randomBytes(48).toString('base64url');
const CHAVES = new ChavesLimiteRequisicoesHmac(SEGREDO_LIMITADOR);
const HASHES_LIMITADOR = ['onboarding-ip', 'login-ip', 'login-identity', 'refresh-ip'].map((escopo) => CHAVES.gerarHashDaChave(escopo, '127.0.0.1', EMAIL));
let etapa = 'setup';
let tokenAcesso, tokenRenovacao;
const INTERCEPTADOS = new Map();
let registrosAnteriores;

async function lerRegistrosExistentes() {
  const [escritorios, usuarios, vinculos, sessoes] = await Promise.all([
    prisma.office.findMany({ orderBy: { id: 'asc' } }),
    prisma.user.findMany({ orderBy: { id: 'asc' } }),
    prisma.membership.findMany({ orderBy: { id: 'asc' } }),
    prisma.session.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return { escritorios, usuarios, vinculos, sessoes };
}

async function verificarLeituraExistente(registros) {
  const escritorios = new RepositorioEscritoriosPrisma(prisma);
  const autenticacao = new RepositorioAutenticacaoPrisma(prisma);
  for (const registro of registros.escritorios) {
    const escritorio = await escritorios.buscarEscritorioPorId(registro.id);
    assert.ok(escritorio);
    assert.deepEqual(MAPEADOR_ESCRITORIO.converterEscritorioEmRegistroPrisma(escritorio), registro);
  }
  for (const registro of registros.usuarios) {
    const conta = await autenticacao.buscarUsuarioComVinculosPorEmail(registro.email);
    assert.ok(conta);
    assert.equal(conta.usuario.id, registro.id);
    assert.equal(conta.usuario.nome, registro.name);
    assert.equal(conta.usuario.hashSenha === registro.passwordHash, true);
    assert.equal(conta.usuario.situacao, registro.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO');
    const vinculos = registros.vinculos.filter((vinculo) => vinculo.userId === registro.id);
    assert.equal(conta.vinculos.length, vinculos.length);
    for (const vinculo of vinculos) assert.ok(conta.vinculos.some((atual) => atual.escritorio.id === vinculo.officeId && atual.papel === 'PROPRIETARIO'));
  }
  for (const registro of registros.sessoes) {
    const encontrado = await autenticacao.buscarSessaoComUsuarioPorId(registro.id);
    assert.ok(encontrado);
    assert.deepEqual(converterSessaoEmRegistroPrisma(encontrado.sessao), registro);
  }
  relatarEtapaDaVerificacao('leitura_dados_existentes', Object.fromEntries(Object.entries(registros).map(([nome, linhas]) => [nome, linhas.length])));
}

async function tratarInterceptacaoDeRequisicao(conexao, parametros) {
  try {
    if (!parametros.responseStatusCode) {
      const cabecalhos = Object.entries(parametros.request.headers).filter(([nome]) => nome.toLowerCase() !== 'authorization').map(([nome, valor]) => ({ name: nome, value: valor }));
      if (conexao.tokenAcessoExpirado) {
        cabecalhos.push({ name: 'Authorization', value: `Bearer ${conexao.tokenAcessoExpirado}` });
        conexao.tokenAcessoExpirado = undefined;
        await conexao.enviarComandoAoNavegador('Fetch.continueRequest', { requestId: parametros.requestId, headers: cabecalhos });
      } else await conexao.enviarComandoAoNavegador('Fetch.continueRequest', { requestId: parametros.requestId });
      return;
    }
    let corpo = null;
    if (parametros.responseStatusCode !== 204) {
      const bruto = await conexao.enviarComandoAoNavegador('Fetch.getResponseBody', { requestId: parametros.requestId });
      corpo = JSON.parse(bruto.base64Encoded ? Buffer.from(bruto.body, 'base64').toString() : bruto.body);
    }
    await conexao.enviarComandoAoNavegador('Fetch.continueResponse', { requestId: parametros.requestId });
    INTERCEPTADOS.set(parametros.networkId, { situacao: parametros.responseStatusCode, corpo: corpo });
  } catch { relatarFalha('browser_response_interception'); }
}

function relatarEtapaDaVerificacao(etapa, valores = {}) { console.log(JSON.stringify({ etapa, ok: true, ...valores })); }
function relatarFalha(etapa) { console.error(JSON.stringify({ etapa, ok: false })); process.exitCode = 1; }
async function aguardarCondicao(consultarCondicao, milissegundos = 20000) {
  const prazo = Date.now() + milissegundos;
  while (Date.now() < prazo) { const valor = await consultarCondicao(); if (valor) return valor; await delay(100); }
  throw new Error('Verification deadline exceeded');
}
async function conectarAoNavegador(url) {
  const socket = new WebSocket(url);
  await new Promise((resolver, rejeitar) => {
    socket.addEventListener('open', resolver, { once: true });
    socket.addEventListener('error', () => rejeitar(new Error('Browser unavailable')), { once: true });
  });
  let proximoIdComando = 0;
  const comandosPendentes = new Map(), eventos = [];
  socket.addEventListener('message', (evento) => {
    const mensagem = JSON.parse(String(evento.data));
    if (!mensagem.id) {
      eventos.push(mensagem);
      if (mensagem.method === 'Fetch.requestPaused') void tratarInterceptacaoDeRequisicao(conexao, mensagem.params);
      return;
    }
    const tarefa = comandosPendentes.get(mensagem.id);
    if (tarefa) {
      clearTimeout(tarefa.temporizador); comandosPendentes.delete(mensagem.id);
      if (mensagem.error) tarefa.rejeitar(new Error('Browser command failed')); else tarefa.resolver(mensagem.result);
    }
  });
  const conexao = { socket, eventos, enviarComandoAoNavegador(metodo, parametros = {}) {
    return new Promise((resolver, rejeitar) => {
      const id = ++proximoIdComando;
      const temporizador = setTimeout(() => { comandosPendentes.delete(id); rejeitar(new Error('Browser command timeout')); }, 10000);
      comandosPendentes.set(id, { resolver, rejeitar, temporizador }); socket.send(JSON.stringify({ id, method: metodo, params: parametros }));
    });
  } };
  return conexao;
}
async function avaliarExpressaoNaAbaPrincipal(expressao) {
  return avaliarExpressaoNaAba(navegador, expressao);
}
async function avaliarExpressaoNaAba(conexao, expressao) {
  const resultado = await conexao.enviarComandoAoNavegador('Runtime.evaluate', { expression: expressao, returnByValue: true, awaitPromise: true });
  if (resultado.exceptionDetails) throw new Error('Browser evaluation failed');
  return resultado.result.value;
}
async function clicarElemento(seletor) {
  const ponto = await avaliarExpressaoNaAbaPrincipal(`(() => { const elemento = document.querySelector(${JSON.stringify(seletor)}); if (!elemento) return null; elemento.scrollIntoView({block:'center'}); const retangulo = elemento.getBoundingClientRect(); return {x:retangulo.x+retangulo.width/2,y:retangulo.y+retangulo.height/2}; })()`);
  assert.ok(ponto);
  await navegador.enviarComandoAoNavegador('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...ponto });
  await navegador.enviarComandoAoNavegador('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...ponto });
}
async function preencherCamposDoFormulario(valores) {
  for (const [seletor, texto] of Object.entries(valores)) {
    await clicarElemento(seletor);
    // Reload can restore form values. Replace the field through native keyboard input.
    await navegador.enviarComandoAoNavegador('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await navegador.enviarComandoAoNavegador('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await navegador.enviarComandoAoNavegador('Input.insertText', { text: texto });
  }
}
async function aguardarRespostaDeRede(caminho, desde = 0) {
  const requisicao = await aguardarCondicao(() => navegador.eventos.slice(desde).find((evento) =>
    evento.method === 'Network.requestWillBeSent' && new URL(evento.params.request.url).pathname === caminho));
  if (caminho.startsWith('/api/v1/auth/')) {
    return { ...await aguardarCondicao(() => INTERCEPTADOS.get(requisicao.params.requestId)), requisicao: requisicao.params.request };
  }
  const resposta = await aguardarCondicao(() => navegador.eventos.find((evento) =>
    evento.method === 'Network.responseReceived' && evento.params.requestId === requisicao.params.requestId));
  await aguardarCondicao(() => navegador.eventos.some((evento) => evento.method === 'Network.loadingFinished' && evento.params.requestId === requisicao.params.requestId));
  const bruto = await navegador.enviarComandoAoNavegador('Network.getResponseBody', { requestId: requisicao.params.requestId });
  const corpo = JSON.parse(bruto.base64Encoded ? Buffer.from(bruto.body, 'base64').toString() : bruto.body);
  return { situacao: resposta.params.response.status, corpo: corpo, requisicao: requisicao.params.request };
}
function possuiCampoSensivel(valor) {
  return !!valor && typeof valor === 'object' && Object.entries(valor).some(([chave, item]) =>
    /password|senha|hash|refreshToken|tokenRenovacao/i.test(chave) || possuiCampoSensivel(item));
}

try {
  const ambiente = carregarAmbiente();
  const nomeHost = ambiente.HOST === '0.0.0.0' ? '127.0.0.1' : ambiente.HOST === '::' ? '[::1]' : ambiente.HOST.includes(':') ? `[${ambiente.HOST}]` : ambiente.HOST;
  const urlBackend = `http://${nomeHost}:${ambiente.PORT}`;
  prisma = criarClientePrisma(ambiente.DATABASE_URL);
  await prisma.$queryRaw`SELECT 1`;
  registrosAnteriores = await lerRegistrosExistentes();
  await verificarLeituraExistente(registrosAnteriores);
  assert.equal(await prisma.rateLimitBucket.count({ where: { keyHash: { in: HASHES_LIMITADOR } } }), 0);
  assert.equal(await prisma.user.count({ where: { email: EMAIL } }), 0);
  assert.equal(await prisma.office.count({ where: { name: NOME_ESCRITORIO } }), 0);
  possuiRegistros = true;
  const inicializacao = "process.on('message',mensagem=>{if(mensagem==='stop'){process.emit('SIGTERM');process.disconnect();}});await import('./dist/server.js');process.send(process.exitCode===1?'failed':'ready');";
  backend = spawn(process.execPath, ['--input-type=module', '-e', inicializacao], {
    cwd: DIRETORIO_BACKEND, env: { ...process.env, HOST: '127.0.0.1', TRUST_PROXY: '', RATE_LIMIT_HMAC_SECRET: SEGREDO_LIMITADOR, RATE_LIMIT_CLEANUP_INTERVAL_MS: '3600000', AUTH_FRONTEND_ORIGIN: 'http://127.0.0.1:5173' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  backend.stdout.on('data', (trecho) => LOGS_PROCESSOS.push(String(trecho)));
  backend.stderr.on('data', (trecho) => LOGS_PROCESSOS.push(String(trecho)));
  await new Promise((resolver, rejeitar) => {
    const temporizador = setTimeout(() => rejeitar(new Error('Backend startup deadline')), 15000);
    backend.once('message', (mensagem) => { clearTimeout(temporizador); mensagem === 'ready' ? resolver() : rejeitar(new Error('Backend startup failed')); });
    backend.once('exit', () => { clearTimeout(temporizador); rejeitar(new Error('Backend exited')); });
  });
  await aguardarCondicao(async () => {
    if (backend.exitCode !== null) throw new Error('Backend exited');
    try { return (await fetch(`${urlBackend}/health`, { signal: AbortSignal.timeout(1000) })).status === 200; } catch { return false; }
  });
  assert.equal((await fetch(`${urlBackend}/ready`)).status, 200);
  process.env.BACKEND_PROXY_TARGET = urlBackend;
  process.chdir(join(DIRETORIO_WORKSPACE, 'frontend'));
  frontend = await createServer({
    server: { host: '127.0.0.1', port: 5173, strictPort: true }, logLevel: 'silent',
  });
  await frontend.listen();
  const urlFrontend = `http://127.0.0.1:${frontend.httpServer.address().port}`;
  assert.equal((await fetch(`${urlFrontend}/favicon.svg`)).status, 200);
  assert.ok(existsSync(join(DIRETORIO_WORKSPACE, 'frontend', 'dist', 'favicon.svg')));
  etapa = 'browser_start';
  const executavel = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  assert.ok(existsSync(executavel));
  perfil = mkdtempSync(join(tmpdir(), 'neodireito-rf003-browser-'));
  mkdirSync(join(perfil, 'Default'));
  writeFileSync(join(perfil, 'Default', 'Preferences'), JSON.stringify({ credentials_enable_service: false, profile: { password_manager_enabled: false } }));
  chrome = spawn(executavel, ['--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--window-size=1280,1000', 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });
  await aguardarCondicao(() => existsSync(join(perfil, 'DevToolsActivePort')));
  const porta = Number(readFileSync(join(perfil, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
  const alvos = await fetch(`http://127.0.0.1:${porta}/json/list`).then((resposta) => resposta.json());
  navegador = await conectarAoNavegador(alvos.find((alvo) => alvo.type === 'page').webSocketDebuggerUrl);
  for (const metodo of ['Page.enable', 'Network.enable', 'Runtime.enable', 'Log.enable']) await navegador.enviarComandoAoNavegador(metodo);
  await navegador.enviarComandoAoNavegador('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/auth/*', requestStage: 'Response' }, { urlPattern: '*/api/v1/auth/me', requestStage: 'Request' }] });

  etapa = 'register_through_browser';
  await navegador.enviarComandoAoNavegador('Page.navigate', { url: `${urlFrontend}/register` });
  await aguardarCondicao(() => avaliarExpressaoNaAbaPrincipal("!!document.querySelector('#register-nomeEscritorio')"));
  await preencherCamposDoFormulario({ '#register-nomeEscritorio': NOME_ESCRITORIO, '#register-nomeAdministrador': NOME_ADMINISTRADOR, '#register-email': EMAIL.toUpperCase(), '#register-senha': SENHA, '#register-confirmacaoSenha': SENHA });
  await clicarElemento('button[type=submit]');
  const cadastro = await aguardarRespostaDeRede('/api/v1/onboarding');
  assert.equal(cadastro.situacao, 201);
  assert.deepEqual(Object.keys(JSON.parse(cadastro.requisicao.postData)).sort(), ['email', 'nomeAdministrador', 'nomeEscritorio', 'senha']);
  assert.deepEqual(Object.keys(cadastro.corpo).sort(), ['escritorio', 'papel', 'usuario']);
  assert.deepEqual(Object.keys(cadastro.corpo.escritorio).sort(), ['atualizadoEm', 'criadoEm', 'id', 'nome', 'situacao']);
  assert.equal(cadastro.corpo.escritorio.situacao, 'ATIVO');
  assert.equal(cadastro.corpo.papel, 'PROPRIETARIO');
  assert.equal(possuiCampoSensivel(cadastro.corpo), false);
  await aguardarCondicao(() => avaliarExpressaoNaAbaPrincipal("!!document.querySelector('a[href=\"/login\"]')"));
  relatarEtapaDaVerificacao(etapa, { situacao: 201 });

  etapa = 'login_through_browser';
  await clicarElemento('a[href="/login"]');
  await aguardarCondicao(() => avaliarExpressaoNaAbaPrincipal("!!document.querySelector('#login-email')"));
  await preencherCamposDoFormulario({ '#login-email': EMAIL.toUpperCase(), '#login-password': SENHA });
  const antesLogin = navegador.eventos.length;
  await clicarElemento('button[type=submit]');
  const entrar = await aguardarRespostaDeRede('/api/v1/auth/login', antesLogin);
  assert.equal(entrar.situacao, 200);
  assert.deepEqual(Object.keys(entrar.corpo).sort(), ['escritorio', 'expiraEmSegundos', 'tokenAcesso', 'usuario']);
  assert.deepEqual(Object.keys(JSON.parse(entrar.requisicao.postData)).sort(), ['email', 'senha']);
  assert.equal(possuiCampoSensivel(entrar.corpo), false);
  tokenAcesso = entrar.corpo.tokenAcesso;
  assert.equal(typeof tokenAcesso, 'string');
  const respostaIdentidade = await aguardarRespostaDeRede('/api/v1/auth/me', antesLogin);
  assert.equal(respostaIdentidade.situacao, 200); assert.equal(respostaIdentidade.corpo.escritorio.papel, 'PROPRIETARIO');
  assert.equal(respostaIdentidade.corpo.usuario.id, cadastro.corpo.usuario.id); assert.equal(respostaIdentidade.corpo.escritorio.id, cadastro.corpo.escritorio.id);
  assert.equal(possuiCampoSensivel(respostaIdentidade.corpo), false);
  assert.equal(JSON.stringify(respostaIdentidade.corpo).includes(tokenAcesso), false);
  await aguardarCondicao(() => avaliarExpressaoNaAbaPrincipal("!!document.querySelector('[role=status]')&&document.querySelector('#login-title').textContent==='Sessão autenticada'"));
  const texto = await avaliarExpressaoNaAbaPrincipal('document.body.innerText');
  assert.ok(texto.includes(NOME_ADMINISTRADOR) && texto.includes(NOME_ESCRITORIO) && texto.includes('PROPRIETARIO'));
  assert.equal(texto.includes(tokenAcesso), false);
  assert.equal(await avaliarExpressaoNaAbaPrincipal('localStorage.length===0&&sessionStorage.length===0'), true);
  const cookies = await navegador.enviarComandoAoNavegador('Network.getCookies', { urls: [`${urlFrontend}/api/v1/auth/me`] });
  const cookie = cookies.cookies.find((item) => item.name === 'refresh_token');
  assert.ok(cookie); tokenRenovacao = cookie.value;
  assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, 'Lax'); assert.equal(cookie.path, '/api/v1/auth');
  assert.equal(cookie.secure, ambiente.NODE_ENV === 'production');
  assert.equal(Buffer.from(tokenRenovacao.split('.')[1], 'base64url').length, 32);
  assert.equal(JSON.stringify(entrar.corpo).includes(tokenRenovacao), false);
  assert.equal(JSON.stringify(respostaIdentidade.corpo).includes(tokenRenovacao), false);
  assert.equal((await avaliarExpressaoNaAbaPrincipal('document.cookie')).includes(tokenRenovacao), false);
  relatarEtapaDaVerificacao(etapa, { entrar: 200, me: 200, proprietario: true, areaAutenticada: true, httpOnly: true, sameSite: 'Lax', secure: cookie.secure, armazenamentoNavegadorVazio: true });

  etapa = 'real_session_persistence';
  const registros = await prisma.session.findMany({ where: { userId: cadastro.corpo.usuario.id } });
  assert.equal(registros.length, 1);
  const sessao = registros[0];
  assert.equal(sessao.activeOfficeId, cadastro.corpo.escritorio.id);
  assert.equal(sessao.refreshTokenHash, createHash('sha256').update(tokenRenovacao).digest('hex'));
  assert.equal(sessao.expiresAt.getTime() - sessao.createdAt.getTime(), ambiente.AUTH_REFRESH_TTL_SECONDS * 1000);
  assert.equal(sessao.revokedAt, null);
  const usuario = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
  const escritorio = await prisma.office.findUniqueOrThrow({ where: { id: cadastro.corpo.escritorio.id } });
  const vinculo = await prisma.membership.findUniqueOrThrow({ where: { officeId_userId: { officeId: escritorio.id, userId: usuario.id } } });
  assert.equal(usuario.email, EMAIL);
  assert.equal(usuario.status, 'ACTIVE');
  assert.equal(escritorio.status, 'ACTIVE');
  assert.equal(vinculo.role, 'OWNER');
  assert.ok(usuario.passwordHash.startsWith('$argon2id$'));
  assert.equal(Object.keys(escritorio).some((campo) => /password|senha|hash/i.test(campo)), false);
  assert.equal(Object.keys(vinculo).some((campo) => /password|senha|hash/i.test(campo)), false);
  const armazenado = JSON.stringify({ sessao, usuario, escritorio, vinculo });
  for (const segredo of [SENHA, tokenRenovacao, tokenAcesso]) assert.equal(armazenado.includes(segredo), false);
  const colunasSegredos = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name LIKE '%token%'`;
  assert.deepEqual(colunasSegredos, [{ column_name: 'refresh_token_hash' }]);
  relatarEtapaDaVerificacao(etapa, { sessoes: 1, somenteHashRenovacao: true, validadeRenovacaoSegundos: ambiente.AUTH_REFRESH_TTL_SECONDS });

  etapa = 'reload_restores_and_rotates';
  const antesRecarga = navegador.eventos.length;
  await navegador.enviarComandoAoNavegador('Page.reload');
  await aguardarCondicao(async () => {
    try { return await avaliarExpressaoNaAbaPrincipal("document.querySelector('#login-title')?.textContent==='Sessão autenticada'"); }
    catch { return false; } // Navigation can destroy the previous execution context.
  });
  const renovado = await aguardarRespostaDeRede('/api/v1/auth/refresh', antesRecarga);
  assert.equal(renovado.situacao, 200); assert.equal(possuiCampoSensivel(renovado.corpo), false);
  const rotacionado = await prisma.session.findUniqueOrThrow({ where: { id: sessao.id } });
  assert.equal(rotacionado.refreshTokenHash === sessao.refreshTokenHash, false);
  assert.equal(rotacionado.expiresAt.getTime(), sessao.expiresAt.getTime());
  assert.ok(rotacionado.lastUsedAt);assert.equal(rotacionado.updatedAt.getTime(), rotacionado.lastUsedAt.getTime());
  assert.equal(await avaliarExpressaoNaAbaPrincipal('(async()=>localStorage.length===0&&sessionStorage.length===0&&(await indexedDB.databases()).length===0)()'), true);
  relatarEtapaDaVerificacao(etapa, { renovar: 200, autenticado: true, hashRotacionado: true, expiracaoAbsolutaPreservada: true, armazenamentosNavegadorVazios: true });

  etapa = 'expired_access_refresh_and_retry';
  const instante = Math.floor(Date.now() / 1000);
  // Substitute only one outgoing Bearer with a genuinely signed expired JWT.
  // The frontend's production HTTP client must handle the real API 401 itself.
  const tokenAcessoExpirado = await new SignJWT({ sessionId: sessao.id, activeOfficeId: sessao.activeOfficeId, role: 'OWNER' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(usuario.id)
    .setIssuer(ambiente.AUTH_JWT_ISSUER).setAudience(ambiente.AUTH_JWT_AUDIENCE)
    .setIssuedAt(instante - 901).setExpirationTime(instante - 1).sign(Buffer.from(ambiente.AUTH_JWT_SECRET, 'base64url'));
  const antesExpiracao = navegador.eventos.length;
  navegador.tokenAcessoExpirado = tokenAcessoExpirado;
  const situacaoFinal = await avaliarExpressaoNaAbaPrincipal("import('/src/authentication.ts').then(({CLIENTE_AUTENTICACAO})=>CLIENTE_AUTENTICACAO.enviarRequisicaoAutenticada('/api/v1/auth/me')).then(resposta=>resposta.status)");
  assert.equal(situacaoFinal, 200);
  const chamadas = navegador.eventos.slice(antesExpiracao).filter((evento) => evento.method === 'Network.requestWillBeSent' && new URL(evento.params.request.url).pathname.startsWith('/api/v1/auth/'));
  assert.deepEqual(chamadas.map((evento) => new URL(evento.params.request.url).pathname), ['/api/v1/auth/me', '/api/v1/auth/refresh', '/api/v1/auth/me']);
  assert.deepEqual(chamadas.map((evento) => INTERCEPTADOS.get(evento.params.requestId)?.situacao), [401, 200, 200]);
  relatarEtapaDaVerificacao(etapa, { acessoExpirado: 401, renovar: 200, repeticao: 200, requisicoesRenovacao: 1, repeticoes: 1 });

  etapa = 'two_real_tabs';
  const alvo = await navegador.enviarComandoAoNavegador('Target.createTarget', { url: 'about:blank' });
  const todosAlvos = await fetch(`http://127.0.0.1:${porta}/json/list`).then((resposta) => resposta.json());
  segundoNavegador = await conectarAoNavegador(todosAlvos.find((item) => item.id === alvo.targetId).webSocketDebuggerUrl);
  for (const metodo of ['Page.enable', 'Network.enable', 'Runtime.enable', 'Log.enable']) await segundoNavegador.enviarComandoAoNavegador(metodo);
  await segundoNavegador.enviarComandoAoNavegador('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/auth/*', requestStage: 'Response' }, { urlPattern: '*/api/v1/auth/me', requestStage: 'Request' }] });
  await segundoNavegador.enviarComandoAoNavegador('Page.navigate', { url: `${urlFrontend}/app` });
  const autenticado = "document.querySelector('#login-title')?.textContent==='Sessão autenticada'";
  await aguardarCondicao(() => avaliarExpressaoNaAba(segundoNavegador, autenticado));
  const requisicoes = (conexao, desde = 0) => conexao.eventos.slice(desde).filter((evento) => evento.method === 'Network.requestWillBeSent');
  assert.equal(requisicoes(segundoNavegador).filter((evento) => new URL(evento.params.request.url).pathname === '/api/v1/auth/refresh').length, 0);
  assert.equal(await avaliarExpressaoNaAba(segundoNavegador, "import('/src/authentication.ts').then(({CLIENTE_AUTENTICACAO})=>CLIENTE_AUTENTICACAO.obterEstadoDaAutenticacao().identidade.usuario.id)"), usuario.id);
  const antesAbas = [navegador.eventos.length, segundoNavegador.eventos.length];
  const rotacaoAnterior = await prisma.session.findUniqueOrThrow({ where: { id: sessao.id } });
  navegador.tokenAcessoExpirado = tokenAcessoExpirado; segundoNavegador.tokenAcessoExpirado = tokenAcessoExpirado;
  const situacoes = await Promise.all([navegador, segundoNavegador].map((conexao) => avaliarExpressaoNaAba(conexao,
    "import('/src/authentication.ts').then(({CLIENTE_AUTENTICACAO})=>CLIENTE_AUTENTICACAO.enviarRequisicaoAutenticada('/api/v1/auth/me')).then(resposta=>resposta.status)")));
  assert.deepEqual(situacoes, [200, 200]);
  const requisicoesAbas = [navegador, segundoNavegador].flatMap((conexao, indice) => requisicoes(conexao, antesAbas[indice]));
  const requisicoesRenovacao = requisicoesAbas.filter((evento) => new URL(evento.params.request.url).pathname === '/api/v1/auth/refresh');
  assert.equal(requisicoesRenovacao.length, 1); assert.equal(INTERCEPTADOS.get(requisicoesRenovacao[0].params.requestId)?.situacao, 200);
  const aposRotacao = await prisma.session.findUniqueOrThrow({ where: { id: sessao.id } });
  assert.notEqual(aposRotacao.refreshTokenHash, rotacaoAnterior.refreshTokenHash); assert.equal(aposRotacao.revokedAt, null);
  assert.equal(await prisma.session.count({ where: { userId: usuario.id } }), 1);
  for (const conexao of [navegador, segundoNavegador]) assert.equal(await avaliarExpressaoNaAba(conexao,
    '(async()=>localStorage.length===0&&sessionStorage.length===0&&(await indexedDB.databases()).length===0)()'), true);
  relatarEtapaDaVerificacao(etapa, { abas: 2, renovacoesSegundaAba: 0, erros401Simultaneos: 2, requisicoesRenovacao: 1, hashBancoRotacionado: true, sessaoAtiva: true, armazenamentoNavegadorVazio: true });

  // Both tabs observe definitive refresh failure; do not let a peer's current access token hide the test.
  etapa = 'reuse_revokes_session';
  await navegador.enviarComandoAoNavegador('Network.setCookie', { name: 'refresh_token', value: tokenRenovacao, url: urlFrontend, path: '/api/v1/auth', httpOnly: true, sameSite: 'Lax', secure: cookie.secure });
  const invalidada = await avaliarExpressaoNaAbaPrincipal("import('/src/authentication.ts').then(({CLIENTE_AUTENTICACAO})=>CLIENTE_AUTENTICACAO.renovarSessao())");
  assert.equal(invalidada, false);
  await aguardarCondicao(() => avaliarExpressaoNaAba(segundoNavegador, "location.pathname==='/login'&&!!document.querySelector('#login-email')"));
  assert.ok((await prisma.session.findUniqueOrThrow({ where: { id: sessao.id } })).revokedAt);
  relatarEtapaDaVerificacao(etapa, { situacao: 401, revogacaoPersistida: true, ambasAbasDesautenticadas: true });

  await aguardarCondicao(() => avaliarExpressaoNaAbaPrincipal("!!document.querySelector('#login-email')&&location.pathname==='/login'"));

  etapa = 'second_login_and_logout';
  await preencherCamposDoFormulario({ '#login-email': EMAIL, '#login-password': SENHA });
  const antesSegundoLogin = navegador.eventos.length;
  await clicarElemento('button[type=submit]');
  assert.equal((await aguardarRespostaDeRede('/api/v1/auth/login', antesSegundoLogin)).situacao, 200);
  await aguardarCondicao(() => avaliarExpressaoNaAbaPrincipal("document.querySelector('#login-title')?.textContent==='Sessão autenticada'"));
  await aguardarCondicao(() => avaliarExpressaoNaAba(segundoNavegador, autenticado));
  // Leave an authenticated document in browser history to exercise actual Back.
  await clicarElemento('a[href="/"]');
  await aguardarCondicao(() => avaliarExpressaoNaAbaPrincipal("location.pathname==='/'&&!!document.querySelector('a[href=\"/login\"]')"));
  await clicarElemento('a[href="/login"]');
  await aguardarCondicao(() => avaliarExpressaoNaAbaPrincipal("document.querySelector('#login-title')?.textContent==='Sessão autenticada'"));
  const antesSaida = navegador.eventos.length;
  await clicarElemento('button[type=button]');
  assert.equal((await aguardarRespostaDeRede('/api/v1/auth/logout', antesSaida)).situacao, 204);
  await aguardarCondicao(() => avaliarExpressaoNaAba(segundoNavegador, "location.pathname==='/login'&&!!document.querySelector('#login-email')"));
  assert.equal((await navegador.enviarComandoAoNavegador('Network.getCookies', { urls: [`${urlFrontend}/api/v1/auth/me`] })).cookies.some((item) => item.name === 'refresh_token'), false);
  const sessoes = await prisma.session.findMany({ where: { userId: usuario.id } });
  assert.equal(sessoes.length, 2);assert.equal(sessoes.every((linha) => linha.revokedAt !== null), true);
  await navegador.enviarComandoAoNavegador('Page.reload');
  await aguardarCondicao(() => avaliarExpressaoNaAbaPrincipal("document.readyState==='complete'&&!!document.querySelector('#login-email')&&location.pathname==='/login'"));
  assert.equal(await avaliarExpressaoNaAbaPrincipal("import('/src/authentication.ts').then(({CLIENTE_AUTENTICACAO})=>CLIENTE_AUTENTICACAO.obterEstadoDaAutenticacao().situacao==='naoAutenticado'&&CLIENTE_AUTENTICACAO.obterEstadoDaAutenticacao().identidade===null)"), true);
  const historico = await navegador.enviarComandoAoNavegador('Page.getNavigationHistory');
  const protegidaAnterior = historico.entries.slice(0, historico.currentIndex).reverse().find((entrada) => new URL(entrada.url).pathname === '/app');
  assert.ok(protegidaAnterior);
  await navegador.enviarComandoAoNavegador('Page.navigateToHistoryEntry', { entryId: protegidaAnterior.id });
  await aguardarCondicao(async () => {
    try { return await avaliarExpressaoNaAbaPrincipal("location.pathname==='/login'&&!!document.querySelector('#login-email')&&!document.body.innerText.includes('Sessão autenticada')"); }
    catch { return false; }
  });
  relatarEtapaDaVerificacao(etapa, { sair: 204, ambasAbasExibemLogin: true, loginPropagado: true, cookieRemovido: true, revogacaoPersistida: true, recargaExibeLogin: true, voltarExibeLogin: true, memoriaLimpa: true });

  etapa = 'real_atomic_rotation';
  const repositorio = new RepositorioAutenticacaoPrisma(prisma);
  const gerarHashDeRenovacaoTemporario = () => createHash('sha256').update(randomUUID()).digest('hex');
  const hashAtual = gerarHashDeRenovacaoTemporario(), proximosHashes = [gerarHashDeRenovacaoTemporario(), gerarHashDeRenovacaoTemporario()];
  const concorrente = Sessao.criar({ idUsuario: usuario.id, idEscritorioAtivo: escritorio.id, hashTokenRenovacao: hashAtual, expiraEm: new Date(Date.now() + 60000) });
  await repositorio.salvarSessao(concorrente);
  const rotacoes = await Promise.all(proximosHashes.map((proximoHash) => repositorio.substituirHashDeRenovacao({ id: concorrente.id, hashAtual, proximoHash, agora: new Date() })));
  assert.equal(rotacoes.filter(Boolean).length, 1);
  const rotacaoArmazenada = await prisma.session.findUniqueOrThrow({ where: { id: concorrente.id } });
  assert.equal(rotacaoArmazenada.refreshTokenHash === proximosHashes[rotacoes.indexOf(true)], true);
  await repositorio.revogarSessao(concorrente.id, new Date());
  assert.ok((await prisma.session.findUniqueOrThrow({ where: { id: concorrente.id } })).revokedAt);
  relatarEtapaDaVerificacao(etapa, { atualizacoesConcorrentes: 2, atualizacoesAceitas: 1, revogacaoPersistida: true });
  etapa = 'secret_redaction';
  const todosEventos = [...navegador.eventos, ...segundoNavegador.eventos];
  const logs = LOGS_PROCESSOS.join('\n') + JSON.stringify(todosEventos.filter((evento) => ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded'].includes(evento.method)));
  const tokensAcessoEmitidos = [...INTERCEPTADOS.values()].map((resposta) => resposta.corpo?.tokenAcesso).filter(Boolean);
  for (const segredo of [SENHA, tokenRenovacao, tokenAcesso, usuario.passwordHash, sessao.refreshTokenHash, rotacionado.refreshTokenHash, ...tokensAcessoEmitidos]) assert.equal(logs.includes(segredo), false);
  assert.equal(todosEventos.some((evento) => evento.method === 'Runtime.exceptionThrown'), false);
  const respostasFavicon = todosEventos.filter((evento) => evento.method === 'Network.responseReceived' && new URL(evento.params.response.url).pathname.startsWith('/favicon.'));
  assert.ok(respostasFavicon.some((evento) => evento.params.response.status === 200));
  assert.equal(respostasFavicon.some((evento) => evento.params.response.status === 404), false);
  relatarEtapaDaVerificacao(etapa, { segredosNosLogs: false, favicon: 200, faviconNoBuild: true, favicon404: false });
} catch {
  relatarFalha(etapa);
  if (navegador && etapa === 'invalid_password_submit') {
    try {
      relatarEtapaDaVerificacao('form_diagnostic', await avaliarExpressaoNaAbaPrincipal(`({emailCorresponde:document.querySelector('#login-email')?.value===${JSON.stringify(EMAIL)}, tamanhoSenha:document.querySelector('#login-password')?.value.length, alertas:document.querySelectorAll('[role=alert]').length})`));
      const respostas = navegador.eventos.filter((evento) => evento.method === 'Network.responseReceived' && new URL(evento.params.response.url).pathname.startsWith('/api/'));
      relatarEtapaDaVerificacao('network_diagnostic', { respostas: respostas.map((evento) => ({ caminho: new URL(evento.params.response.url).pathname, situacao: evento.params.response.status })) });
    } catch { /* Report only sanitized diagnostics. */ }
  }
}
finally {
  if (prisma) {
    try {
      if (possuiRegistros) {
        const usuarios = await prisma.user.findMany({ where: { email: EMAIL }, select: { id: true } });
        const escritorios = await prisma.office.findMany({ where: { name: NOME_ESCRITORIO }, select: { id: true } });
        const idsUsuarios = usuarios.map((linha) => linha.id), idsEscritorios = escritorios.map((linha) => linha.id);
        const removidos = await prisma.$transaction(async (transacao) => {
          const contadores = await transacao.rateLimitBucket.deleteMany({ where: { keyHash: { in: HASHES_LIMITADOR } } });
          const sessoes = await transacao.session.deleteMany({ where: { userId: { in: idsUsuarios }, activeOfficeId: { in: idsEscritorios } } });
          const vinculos = await transacao.membership.deleteMany({ where: { userId: { in: idsUsuarios }, officeId: { in: idsEscritorios } } });
          const usuarios = await transacao.user.deleteMany({ where: { id: { in: idsUsuarios }, email: EMAIL } });
          const escritorios = await transacao.office.deleteMany({ where: { id: { in: idsEscritorios }, name: NOME_ESCRITORIO } });
          return { contadores: contadores.count, sessoes: sessoes.count, vinculos: vinculos.count, usuarios: usuarios.count, escritorios: escritorios.count };
        });
        const restantes = await prisma.session.count({ where: { userId: { in: idsUsuarios } } })
          + await prisma.membership.count({ where: { userId: { in: idsUsuarios } } })
          + await prisma.user.count({ where: { email: EMAIL } }) + await prisma.office.count({ where: { name: NOME_ESCRITORIO } })
          + await prisma.rateLimitBucket.count({ where: { keyHash: { in: HASHES_LIMITADOR } } });
        assert.equal(restantes, 0); relatarEtapaDaVerificacao('temporary_records_cleanup', { removidos, restantes });
        if (registrosAnteriores) {
          // Comparação somente em memória; nenhum dado anterior é gravado ou exposto.
          assert.equal(JSON.stringify(await lerRegistrosExistentes()) === JSON.stringify(registrosAnteriores), true);
          relatarEtapaDaVerificacao('dados_anteriores_preservados', { semAlteracoes: true });
        }
      }
    } catch { relatarFalha('temporary_records_cleanup'); }
    finally { try { await prisma.$disconnect(); } catch { relatarFalha('disconnect'); } }
  }
  if (navegador) { try { await navegador.enviarComandoAoNavegador('Browser.close'); } catch { /* Chrome can close the socket before replying. */ } navegador.socket.close(); }
  segundoNavegador?.socket.close();
  if (chrome) { try { await aguardarCondicao(() => chrome.exitCode !== null, 10000); } catch { chrome.kill(); relatarFalha('browser_close'); } }
  if (frontend) { try { await frontend.close(); } catch { relatarFalha('frontend_close'); } }
  if (backend && backend.exitCode === null) {
    try { backend.send('stop'); await aguardarCondicao(() => backend.exitCode !== null, 10000); assert.equal(backend.exitCode, 0); }
    catch { backend.kill(); relatarFalha('backend_close'); }
  }
  if (perfil) {
    try {
      const resolvido = realpathSync(perfil), diretorioPai = realpathSync(tmpdir());
      assert.ok(resolvido.toLowerCase().startsWith((diretorioPai + sep).toLowerCase()));
      assert.ok(resolvido.split(sep).at(-1).startsWith('neodireito-rf003-browser-'));
      rmSync(resolvido, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    } catch { relatarFalha('profile_cleanup'); }
  }
  relatarEtapaDaVerificacao('verification_resources_closed');
}
