// Verificação explícita de RF-009/010/011 com Chrome e PostgreSQL reais.
// Os dados usam marcador único; o finally limpa somente esta execução.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as criarServidorTcp } from 'node:net';
import { setTimeout as aguardar } from 'node:timers/promises';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { carregarAmbiente } from '../../dist/environment.js';
import { criarClientePrisma } from '../../dist/database.js';
import { RepositorioEquipePrisma } from '../../dist/infrastructure/prisma/prisma-team-repository.js';
import { GestaoEquipe } from '../../dist/application/team/manage-team.js';
import { PERMISSOES_EQUIPE } from '../../dist/application/team/team-policy.js';
import { TokensAcessoJose } from '../../dist/infrastructure/security/jose-access-tokens.js';
import { ProtecaoDeSenhasArgon2 } from '../../dist/infrastructure/security/argon2-password-hasher.js';
import { ChavesLimiteRequisicoesHmac } from '../../dist/infrastructure/security/hmac-rate-limit-keys.js';

const EXECUCAO = randomUUID(), SEGREDO = randomBytes(48).toString('base64url');
const CHAVES = new ChavesLimiteRequisicoesHmac(SEGREDO), HASHES = new Set(), EMAILS = new Set();
const CONEXOES = [], FILHOS = [], LOGS = [], SEGREDOS = [];
const email = (nome) => { const valor = `equipe-${EXECUCAO}-${nome.toLowerCase()}@example.invalid`; EMAILS.add(valor); HASHES.add(CHAVES.gerarHashDaChave('login-identity', '127.0.0.1', valor)); return valor; };
const senha = () => { const valor = randomUUID(); SEGREDOS.push(valor); return valor; };
let prisma, frontend, chrome, perfil, anteriores, portaChrome, navegador, urlFrontend, endereco;
let etapa = 'inicializacao';
const verificar = (condicao) => assert.equal(Boolean(condicao), true);
const relatar = (dados = {}) => console.log(JSON.stringify({ etapa, ok: true, ...dados }));
async function esperar(consultar, prazo = 45000) {
  const ate = Date.now() + prazo;
  while (Date.now() < ate) { const resultado = await consultar(); if (resultado) return resultado; await aguardar(80); }
  throw new Error('Prazo da verificação excedido');
}
async function portaLivre() {
  const servidor = criarServidorTcp(); await new Promise((resolver, rejeitar) => { servidor.on('error', rejeitar); servidor.listen(0, '127.0.0.1', resolver); });
  const porta = servidor.address().port; await new Promise((resolver) => servidor.close(resolver)); return porta;
}
async function conectar(url, pagina = true) {
  const socket = new WebSocket(url); await new Promise((resolver, rejeitar) => { socket.onopen = resolver; socket.onerror = rejeitar; });
  let numero = 0; const pendentes = new Map(), eventos = [];
  socket.onmessage = ({ data }) => {
    const mensagem = JSON.parse(String(data));
    if (!mensagem.id) { eventos.push(mensagem); return; }
    const tarefa = pendentes.get(mensagem.id);
    if (tarefa) { clearTimeout(tarefa.prazo); pendentes.delete(mensagem.id); mensagem.error ? tarefa.rejeitar(new Error('Comando Chrome falhou')) : tarefa.resolver(mensagem.result); }
  };
  const conexao = { socket, eventos, comando(metodo, parametros = {}) {
    return new Promise((resolver, rejeitar) => { const id = ++numero; const prazo = setTimeout(() => { pendentes.delete(id); rejeitar(new Error('Prazo Chrome')); }, 10000);
      pendentes.set(id, { resolver, rejeitar, prazo }); socket.send(JSON.stringify({ id, method: metodo, params: parametros })); });
  } };
  CONEXOES.push(conexao); for (const metodo of pagina ? ['Page.enable', 'Runtime.enable', 'Network.enable'] : []) await conexao.comando(metodo); return conexao;
}
async function avaliar(aba, expressao) {
  const resultado = await aba.comando('Runtime.evaluate', { expression: expressao, returnByValue: true, awaitPromise: true });
  verificar(!resultado.exceptionDetails); return resultado.result.value;
}
async function abrir(aba, url, seletor) {
  await aba.comando('Page.navigate', { url }); await esperar(() => avaliar(aba, `!!document.querySelector(${JSON.stringify(seletor)})`));
}
async function clicar(aba, seletor) {
  const ponto = await avaliar(aba, `(()=>{const e=document.querySelector(${JSON.stringify(seletor)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  verificar(ponto); for (const type of ['mousePressed', 'mouseReleased']) await aba.comando('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...ponto });
}
async function preencher(aba, campos) {
  for (const [seletor, valor] of Object.entries(campos)) {
    await clicar(aba, seletor);
    await aba.comando('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await aba.comando('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await aba.comando('Input.insertText', { text: valor });
  }
}
async function enviarFormulario(aba, caminho, campos) {
  const inicio = aba.eventos.length; await preencher(aba, campos); await clicar(aba, 'button[type=submit]');
  const evento = await esperar(() => aba.eventos.slice(inicio).find((e) => e.method === 'Network.responseReceived' && new URL(e.params.response.url).pathname === caminho));
  return evento.params.response.status;
}

async function fotografarDados() {
  return JSON.stringify(await Promise.all(['office', 'user', 'membership', 'session', 'passwordRecovery', 'recoveryEmailJob', 'membershipHistory']
    .map((modelo) => prisma[modelo].findMany({ orderBy: { id: 'asc' } }))));
}
async function iniciarBackend(porta, portaFrontend) {
  const filho = spawn(process.execPath, ['--input-type=module', '-e', "process.on('message',m=>{if(m==='stop'){process.emit('SIGTERM');process.disconnect();}});await import('./dist/server.js');process.send(process.exitCode===1?'failed':'ready');"], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, PORT: String(porta), HOST: '127.0.0.1', NODE_ENV: 'development',
      URL_FRONTEND: `http://127.0.0.1:${portaFrontend}`, AUTH_FRONTEND_ORIGIN: `http://127.0.0.1:${portaFrontend}`,
      AUTH_JWT_SECRET: SEGREDO, AUTH_JWT_ISSUER: 'verificacao-equipe', AUTH_JWT_AUDIENCE: 'verificacao-equipe',
      RATE_LIMIT_HMAC_SECRET: SEGREDO, RATE_LIMIT_CLEANUP_INTERVAL_MS: '3600000', EMAIL_FILA_INTERVALO_MS: '3600000',
      RATE_LIMIT_ONBOARDING_MAX: '100', RATE_LIMIT_LOGIN_IP_MAX: '100', RATE_LIMIT_LOGIN_IDENTITY_MAX: '100', ALTERACAO_SENHA_LIMITE: '100' },
  });
  FILHOS.push(filho); filho.stdout.on('data', (d) => LOGS.push(String(d))); filho.stderr.on('data', (d) => LOGS.push(String(d)));
  await new Promise((resolver, rejeitar) => { const prazo = setTimeout(() => rejeitar(new Error('Backend indisponível')), 20000);
    filho.once('message', (mensagem) => { clearTimeout(prazo); mensagem === 'ready' ? resolver() : rejeitar(new Error('Backend indisponível')); });
    filho.once('exit', () => { clearTimeout(prazo); rejeitar(new Error('Backend encerrado')); }); });
  return `http://127.0.0.1:${porta}`;
}
async function novaAba(contexto) {
  const { targetId } = await navegador.comando('Target.createTarget', { url: 'about:blank', ...(contexto ? { browserContextId: contexto } : {}) });
  return conectar(`ws://127.0.0.1:${portaChrome}/devtools/page/${targetId}`);
}
async function novoContexto() { return (await navegador.comando('Target.createBrowserContext')).browserContextId; }
async function clicarTexto(aba, texto, raiz = 'body') {
  verificar(await avaliar(aba, `(()=>{const e=[...document.querySelector(${JSON.stringify(raiz)}).querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(texto)});if(!e)return false;e.setAttribute('data-verificacao','clicar');return true})()`));
  await clicar(aba, '[data-verificacao=clicar]');
  await avaliar(aba, "document.querySelector('[data-verificacao=clicar]')?.removeAttribute('data-verificacao')");
}
async function esperarResposta(aba, inicio, caminho) {
  const evento = await esperar(() => aba.eventos.slice(inicio).find((e) => e.method === 'Network.responseReceived' && new URL(e.params.response.url).pathname === caminho));
  if (evento.params.response.status === 401) return { status: 401, corpo: {} };
  const identificador = evento.params.requestId;
  await esperar(() => aba.eventos.some((e) => e.method === 'Network.loadingFinished' && e.params.requestId === identificador));
  const conteudo = await aba.comando('Network.getResponseBody', { requestId: identificador });
  const corpo = JSON.parse(conteudo.body);
  if (corpo.tokenAcesso) SEGREDOS.push(corpo.tokenAcesso);
  verificar(!Object.hasOwn(corpo, 'password') && !Object.hasOwn(corpo, 'passwordHash') && !Object.hasOwn(corpo, 'hashSenha'));
  return { status: evento.params.response.status, corpo };
}
async function entrar(aba, emailUsuario, senhaUsuario, esperado = 200, restrito = false) {
  await abrir(aba, `${urlFrontend}/login`, '#login-email'); const inicio = aba.eventos.length;
  verificar(await enviarFormulario(aba, '/api/v1/auth/login', { '#login-email': emailUsuario, '#login-password': senhaUsuario }) === esperado);
  const resultado = await esperarResposta(aba, inicio, '/api/v1/auth/login');
  if (esperado === 200) await esperar(() => avaliar(aba, `location.pathname===${JSON.stringify(restrito ? '/primeiro-acesso' : '/app')}`));
  return resultado.corpo.tokenAcesso;
}
async function cadastrarEscritorio(aba, nome) {
  const emailUsuario = email(nome), senhaUsuario = senha();
  await abrir(aba, `${urlFrontend}/register`, '#register-nomeEscritorio');
  verificar(await enviarFormulario(aba, '/api/v1/onboarding', { '#register-nomeEscritorio': `Equipe ${EXECUCAO} ${nome}`, '#register-nomeAdministrador': `Pessoa ${nome}`, '#register-email': emailUsuario.toUpperCase(), '#register-senha': senhaUsuario, '#register-confirmacaoSenha': senhaUsuario }) === 201);
  const token = await entrar(aba, emailUsuario, senhaUsuario);
  const usuario = await prisma.user.findUniqueOrThrow({ where: { email: emailUsuario } });
  const vinculo = await prisma.membership.findFirstOrThrow({ where: { userId: usuario.id } });
  verificar(vinculo.role === 'OWNER' && vinculo.permissions.length === 5);
  return { usuario, vinculo, token, senha: senhaUsuario, email: emailUsuario };
}
async function abrirEquipe(aba) { await abrir(aba, `${urlFrontend}/equipe`, 'h1'); await esperar(() => avaliar(aba, "!!document.querySelector('table')")); }
async function criarUsuario(aba, nome, papel = 'ADVOGADO', emailExistente) {
  const emailUsuario = emailExistente ?? email(nome), senhaUsuario = senha();
  await clicarTexto(aba, 'Novo usuário');
  await preencher(aba, { '#equipe-nome': nome, '#equipe-email': emailUsuario.toUpperCase(), '#equipe-senhaTemporaria': senhaUsuario, '#equipe-confirmacaoSenhaTemporaria': senhaUsuario });
  await avaliar(aba, `(()=>{const e=document.querySelector('#equipe-papel');e.value=${JSON.stringify(papel)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const inicio = aba.eventos.length; await clicarTexto(aba, 'Salvar usuário');
  const resultado = await esperarResposta(aba, inicio, '/api/v1/equipe/usuarios');
  if (resultado.status === 201) await esperar(() => avaliar(aba, "document.body.innerText.includes('Usuário cadastrado')"));
  else verificar(await avaliar(aba, "document.querySelector('#equipe-senhaTemporaria').value===''&&document.querySelector('#equipe-confirmacaoSenhaTemporaria').value===''") );
  return { ...resultado, email: emailUsuario, senha: senhaUsuario };
}
async function primeiroAcesso(aba, senhaTemporaria, novaSenha) {
  verificar(await enviarFormulario(aba, '/api/v1/auth/primeiro-acesso', { '#senha-senhaAtual': senhaTemporaria, '#senha-novaSenha': novaSenha, '#senha-confirmacaoNovaSenha': novaSenha }) === 200);
  await esperar(() => avaliar(aba, "location.pathname==='/login'&&document.body.innerText.includes('Senha alterada')"));
}
async function api(token, caminho, metodo = 'GET', corpo) {
  const resposta = await fetch(`${endereco}${caminho}`, { method: metodo, headers: { Authorization: `Bearer ${token}`, Origin: urlFrontend, ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
  return { status: resposta.status, corpo: await resposta.json() };
}
const raizMembro = (emailUsuario) => `tr[data-membro="${emailUsuario}"]`;
async function alterarSituacao(aba, emailUsuario, ativo) {
  const usuario = await prisma.user.findUniqueOrThrow({ where: { email: emailUsuario } });
  const inicio = aba.eventos.length; await clicarTexto(aba, ativo ? 'Reativar' : 'Inativar', raizMembro(emailUsuario));
  await clicarTexto(aba, 'Confirmar', '[role=alertdialog]');
  await esperar(() => aba.eventos.slice(inicio).some((e) => e.method === 'Network.responseReceived' && e.params.response.url.endsWith(ativo ? '/ativar' : '/inativar') && e.params.response.status === 200));
  await esperar(async () => !!await prisma.membership.findFirst({ where: { userId: usuario.id, active: ativo, role: { not: 'OWNER' } } }));
  await esperar(() => avaliar(aba, '!document.querySelector("[role=alertdialog]")'));
}
try {
  const ambiente = carregarAmbiente(); prisma = criarClientePrisma(ambiente.DATABASE_URL); await prisma.$queryRaw`SELECT 1`;
  anteriores = await fotografarDados();
  // Não iniciar workers sobre trabalhos alheios pendentes.
  verificar(await prisma.recoveryEmailJob.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }) === 0);
  const portaFrontend = await portaLivre(); endereco = await iniciarBackend(await portaLivre(), portaFrontend); urlFrontend = `http://127.0.0.1:${portaFrontend}`;
  verificar((await fetch(`${endereco}/ready`)).status === 200);
  process.chdir(fileURLToPath(new URL('../../../frontend/', import.meta.url)));
  frontend = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: portaFrontend, strictPort: true, proxy: { '/api': { target: endereco, changeOrigin: true } } } }); await frontend.listen();
  perfil = mkdtempSync(join(tmpdir(), 'neodireito-equipe-')); mkdirSync(join(perfil, 'Default'));
  writeFileSync(join(perfil, 'Default', 'Preferences'), JSON.stringify({ credentials_enable_service: false, profile: { password_manager_enabled: false } }));
  chrome = spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--no-first-run', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--window-size=1280,1000', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await esperar(() => existsSync(join(perfil, 'DevToolsActivePort'))); portaChrome = Number(readFileSync(join(perfil, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
  const versaoChrome = await fetch(`http://127.0.0.1:${portaChrome}/json/version`).then((r) => r.json()); navegador = await conectar(versaoChrome.webSocketDebuggerUrl, false);
  for (const escopo of ['onboarding-ip', 'team-create-ip', 'login-ip', 'refresh-ip', 'password-change-ip', 'reset-ip']) HASHES.add(CHAVES.gerarHashDaChave(escopo, '127.0.0.1'));
  etapa = 'cadastro_proprietario_e_advogado_pelo_chrome';
  const abaProprietario = await novaAba(), proprietario = await cadastrarEscritorio(abaProprietario, 'proprietario'); await abrirEquipe(abaProprietario);
  const advogado = await criarUsuario(abaProprietario, 'Advogado'); verificar(advogado.status === 201);
  const usuarioAdvogado = await prisma.user.findUniqueOrThrow({ where: { email: advogado.email } });
  verificar(usuarioAdvogado.mustChangePassword && usuarioAdvogado.passwordHash.startsWith('$argon2id$'));
  const vinculoAdvogado = await prisma.membership.findFirstOrThrow({ where: { userId: usuarioAdvogado.id } });
  verificar(vinculoAdvogado.active && vinculoAdvogado.role === 'LAWYER' && vinculoAdvogado.permissions.length === 0);
  HASHES.add(CHAVES.gerarHashDaChave('password-change-user', '127.0.0.1', usuarioAdvogado.id)); relatar();
  etapa = 'primeiro_acesso_restrito_e_duas_abas';
  const contextoAdvogado = await novoContexto(), abaAdvogado = await novaAba(contextoAdvogado);
  const tokenRestrito = await entrar(abaAdvogado, advogado.email, advogado.senha, 200, true);
  verificar((await api(tokenRestrito, '/api/v1/auth/me')).corpo.deveAlterarSenha === true);
  verificar((await api(tokenRestrito, '/api/v1/equipe/usuarios')).status === 403);
  verificar((await api(tokenRestrito, '/api/v1/auth/alterar-senha', 'POST', { senhaAtual: advogado.senha, novaSenha: senha(), confirmacaoNovaSenha: senha() })).status === 403);
  etapa = 'primeiro_acesso_restauracao_segunda_aba';
  const segundaAba = await novaAba(contextoAdvogado); await abrir(segundaAba, `${urlFrontend}/equipe`, '#senha-senhaAtual');
  verificar(await avaliar(segundaAba, "location.pathname==='/primeiro-acesso'"));
  etapa = 'primeiro_acesso_troca_e_logout';
  const novaSenhaAdvogado = senha(); await primeiroAcesso(abaAdvogado, advogado.senha, novaSenhaAdvogado);
  await esperar(() => avaliar(segundaAba, "location.pathname==='/login'"));
  verificar(!(await prisma.user.findUniqueOrThrow({ where: { id: usuarioAdvogado.id } })).mustChangePassword);
  verificar(await prisma.session.count({ where: { userId: usuarioAdvogado.id, revokedAt: null } }) === 0);
  await entrar(abaAdvogado, advogado.email, advogado.senha, 401); let tokenAdvogado = await entrar(abaAdvogado, advogado.email, novaSenhaAdvogado); relatar({ logoutDuasAbas: true });
  etapa = 'administrador_cria_inferior_e_nao_administrador';
  const administrador = await criarUsuario(abaProprietario, 'Administrador', 'ADMINISTRADOR'); verificar(administrador.status === 201);
  const usuarioAdministrador = await prisma.user.findUniqueOrThrow({ where: { email: administrador.email } }); HASHES.add(CHAVES.gerarHashDaChave('password-change-user', '127.0.0.1', usuarioAdministrador.id));
  const abaAdministrador = await novaAba(await novoContexto()); await entrar(abaAdministrador, administrador.email, administrador.senha, 200, true);
  const senhaAdministrador = senha(); await primeiroAcesso(abaAdministrador, administrador.senha, senhaAdministrador); const tokenAdministrador = await entrar(abaAdministrador, administrador.email, senhaAdministrador);
  await abrirEquipe(abaAdministrador); const secretario = await criarUsuario(abaAdministrador, 'Secretario', 'SECRETARIO'); verificar(secretario.status === 201);
  await clicarTexto(abaAdministrador, 'Novo usuário'); verificar(await avaliar(abaAdministrador, "![...document.querySelector('#equipe-papel').options].some(o=>['ADMINISTRADOR','PROPRIETARIO'].includes(o.value))"));
  const dadosCriacao = (nome) => { const s = senha(); return { nome, email: email(nome), papel: 'ADVOGADO', permissoes: [], senhaTemporaria: s, confirmacaoSenhaTemporaria: s }; };
  verificar((await api(tokenAdministrador, '/api/v1/equipe/usuarios', 'POST', { ...dadosCriacao('proibido'), papel: 'ADMINISTRADOR', permissoes: [...PERMISSOES_EQUIPE] })).status === 403); relatar();
  etapa = 'edicao_permissoes_revogacao_imediata';
  await clicarTexto(abaProprietario, 'Editar', raizMembro(advogado.email)); await clicar(abaProprietario, 'form[aria-busy] input[type=checkbox]');
  await clicarTexto(abaProprietario, 'Salvar usuário'); await clicarTexto(abaProprietario, 'Confirmar', '[role=alertdialog]');
  await esperar(async () => (await prisma.membership.findUniqueOrThrow({ where: { id: vinculoAdvogado.id } })).permissions.includes('EQUIPE_VISUALIZAR'));
  verificar((await api(tokenAdvogado, '/api/v1/auth/me')).status === 401);
  await esperar(() => avaliar(abaAdvogado, "location.pathname==='/login'")); tokenAdvogado = await entrar(abaAdvogado, advogado.email, novaSenhaAdvogado);
  verificar((await api(tokenAdvogado, '/api/v1/equipe/usuarios')).status === 200);
  await esperar(() => avaliar(abaProprietario, '!document.querySelector("[role=alertdialog]")'));
  await clicarTexto(abaProprietario, 'Editar', raizMembro(advogado.email)); await clicar(abaProprietario, 'form[aria-busy] input[type=checkbox]');
  await clicarTexto(abaProprietario, 'Salvar usuário'); await clicarTexto(abaProprietario, 'Confirmar', '[role=alertdialog]');
  await esperar(async () => (await prisma.membership.findUniqueOrThrow({ where: { id: vinculoAdvogado.id } })).permissions.length === 0);
  verificar((await api(tokenAdvogado, '/api/v1/equipe/usuarios')).status === 401); await esperar(() => avaliar(abaAdvogado, "location.pathname==='/login'"));
  tokenAdvogado = await entrar(abaAdvogado, advogado.email, novaSenhaAdvogado); verificar((await api(tokenAdvogado, '/api/v1/equipe/usuarios')).status === 403); relatar();
  etapa = 'inativacao_duas_abas_reativacao';
  await abrir(segundaAba, `${urlFrontend}/app`, 'h1'); await esperar(() => avaliar(segundaAba, "document.body.innerText.includes('Sessão autenticada')"));
  await esperar(() => avaliar(abaProprietario, '!document.querySelector("[role=alertdialog]")')); await alterarSituacao(abaProprietario, advogado.email, false);
  verificar((await api(tokenAdvogado, '/api/v1/auth/me')).status === 401);
  for (const aba of [abaAdvogado, segundaAba]) await esperar(() => avaliar(aba, "location.pathname==='/login'"));
  await entrar(abaAdvogado, advogado.email, novaSenhaAdvogado, 401); await alterarSituacao(abaProprietario, advogado.email, true);
  verificar((await api(tokenAdvogado, '/api/v1/auth/me')).status === 401); tokenAdvogado = await entrar(abaAdvogado, advogado.email, novaSenhaAdvogado); relatar({ logoutDuasAbas: true, exigeNovoLogin: true });
  etapa = 'conta_existente_preserva_outro_escritorio';
  const outraAba = await novaAba(await novoContexto()), outro = await cadastrarEscritorio(outraAba, 'outro');
  const fotografiaOutro = JSON.stringify({ usuario: await prisma.user.findUnique({ where: { id: outro.usuario.id } }), sessoes: await prisma.session.findMany({ where: { userId: outro.usuario.id }, orderBy: { id: 'asc' } }) });
  const existente = await criarUsuario(abaProprietario, 'Conta existente', 'ADVOGADO', outro.email); verificar(existente.status === 409 && existente.corpo.erro === 'CONTA_EXISTENTE');
  const inicioConfirmacao = abaProprietario.eventos.length; await clicarTexto(abaProprietario, 'Confirmar', '[role=alertdialog]'); verificar((await esperarResposta(abaProprietario, inicioConfirmacao, '/api/v1/equipe/usuarios/confirmar-vinculo')).status === 201);
  await esperar(() => avaliar(abaProprietario, `!!document.querySelector(${JSON.stringify(raizMembro(outro.email))})`));
  await alterarSituacao(abaProprietario, outro.email, false);
  verificar(JSON.stringify({ usuario: await prisma.user.findUnique({ where: { id: outro.usuario.id } }), sessoes: await prisma.session.findMany({ where: { userId: outro.usuario.id }, orderBy: { id: 'asc' } }) }) === fotografiaOutro);
  verificar((await api(outro.token, '/api/v1/auth/me')).status === 200);
  verificar((await api(proprietario.token, `/api/v1/equipe/usuarios/${outro.vinculo.id}`)).status === 404);
  verificar((await api(proprietario.token, '/api/v1/equipe/usuarios', 'POST', { ...dadosCriacao('massassignment'), escritorioId: outro.vinculo.officeId })).status === 400); relatar();
  etapa = 'concorrencia_email_vinculo_e_alteracao';
  const concorrente = dadosCriacao('concorrente');
  let resultados = await Promise.all([1, 2].map(() => api(proprietario.token, '/api/v1/equipe/usuarios', 'POST', concorrente)));
  assert.deepEqual(resultados.map((r) => r.status).sort(), [201, 409]);
  const cruzado = dadosCriacao('cruzado'); resultados = await Promise.all([proprietario.token, outro.token].map((token) => api(token, '/api/v1/equipe/usuarios', 'POST', cruzado)));
  assert.deepEqual(resultados.map((r) => r.status).sort(), [201, 409]);
  const tokenDestino = resultados[0].status === 409 ? proprietario.token : outro.token;
  resultados = await Promise.all([1, 2].map(() => api(tokenDestino, '/api/v1/equipe/usuarios/confirmar-vinculo', 'POST', { email: cruzado.email, papel: 'ADVOGADO', permissoes: [], confirmacaoVinculo: true })));
  assert.deepEqual(resultados.map((r) => r.status).sort(), [201, 409]);
  const versao = (await prisma.membership.findUniqueOrThrow({ where: { id: vinculoAdvogado.id } })).version;
  resultados = await Promise.all([1, 2].map(() => api(proprietario.token, `/api/v1/equipe/usuarios/${vinculoAdvogado.id}`, 'PATCH', { papel: 'ESTAGIARIO', permissoes: [], versao })));
  assert.deepEqual(resultados.map((r) => r.status).sort(), [200, 409]); relatar();
  etapa = 'rollback_transacional_e_historico';
  let falhasDeHistorico = 0;
  const extensao = prisma.$extends({ query: { membershipHistory: { async create() { falhasDeHistorico++; throw new Error('Falha controlada de auditoria'); } } } });
  const tokens = new TokensAcessoJose(SEGREDO, 'verificacao-equipe', 'verificacao-equipe', ambiente.AUTH_ACCESS_TTL_SECONDS);
  const gestao = new GestaoEquipe(new RepositorioEquipePrisma(extensao), tokens, new ProtecaoDeSenhasArgon2());
  const rollback = dadosCriacao('rollback'); await assert.rejects(() => gestao.cadastrar(proprietario.token, rollback), /Falha controlada de auditoria/);
  verificar(await prisma.user.count({ where: { email: rollback.email } }) === 0);
  await esperar(() => avaliar(abaAdvogado, "location.pathname==='/login'"));
  await entrar(abaAdvogado, advogado.email, novaSenhaAdvogado);
  verificar(await prisma.session.count({ where: { userId: usuarioAdvogado.id, revokedAt: null } }) === 1);
  const antesRollback = await prisma.membership.findUniqueOrThrow({ where: { id: vinculoAdvogado.id } });
  const sessoesAntesRollback = JSON.stringify(await prisma.session.findMany({ where: { userId: usuarioAdvogado.id }, orderBy: { id: 'asc' } }));
  await assert.rejects(() => gestao.definirSituacao(proprietario.token, vinculoAdvogado.id, false, antesRollback.version), /Falha controlada de auditoria/);
  verificar(falhasDeHistorico === 2);
  assert.deepEqual(await prisma.membership.findUniqueOrThrow({ where: { id: vinculoAdvogado.id } }), antesRollback);
  verificar(JSON.stringify(await prisma.session.findMany({ where: { userId: usuarioAdvogado.id }, orderBy: { id: 'asc' } })) === sessoesAntesRollback);
  const historico = await prisma.membershipHistory.findMany({ where: { membershipId: vinculoAdvogado.id }, orderBy: { createdAt: 'asc' } });
  verificar(historico.length === 6 && historico.every((h) => h.actorId === proprietario.usuario.id));
  verificar(historico[0].previous === null && historico[0].current.papel === 'ADVOGADO');
  verificar(historico.some((h) => h.action === 'INATIVADO') && historico.some((h) => h.action === 'REATIVADO'));
  verificar(!/password|senha|hash/i.test(JSON.stringify(historico))); relatar({ historicoPersistente: true, rollbackIntegral: true });
  etapa = 'recuperacao_remove_primeiro_acesso';
  const usuarioSecretario = await prisma.user.findUniqueOrThrow({ where: { email: secretario.email } });
  const tokenRecuperacao = randomBytes(32).toString('base64url'), hashToken = createHash('sha256').update(tokenRecuperacao).digest('hex'); SEGREDOS.push(tokenRecuperacao);
  HASHES.add(CHAVES.gerarHashDaChave('reset-token', '127.0.0.1', hashToken));
  await prisma.passwordRecovery.create({ data: { id: randomUUID(), userId: usuarioSecretario.id, tokenHash: hashToken, createdAt: new Date(), expiresAt: new Date(Date.now() + 600000) } });
  const senhaRecuperada = senha(); verificar((await api('', '/api/v1/auth/redefinir-senha', 'POST', { token: tokenRecuperacao, novaSenha: senhaRecuperada, confirmacaoNovaSenha: senhaRecuperada })).status === 200);
  verificar(!(await prisma.user.findUniqueOrThrow({ where: { id: usuarioSecretario.id } })).mustChangePassword); relatar();
  etapa = 'segredos_e_compatibilidade';
  verificar(!SEGREDOS.some((segredo) => LOGS.join('').includes(segredo))); verificar((await fetch(`${urlFrontend}/favicon.svg`)).status === 200);
  verificar(CONEXOES.every((c) => !c.eventos.some((e) => e.method === 'Runtime.exceptionThrown'))); relatar({ nenhumErroJavascript: true });
} catch (erro) {
  process.exitCode = 1;
  console.error(JSON.stringify({ etapa, ok: false, local: erro instanceof Error ? erro.stack?.split('\n').filter((linha) => linha.includes('team-management.check.mjs:')).map((linha) => linha.trim()) : undefined }));
  for (const conexao of CONEXOES.filter((c) => c !== navegador)) {
    try { console.error(JSON.stringify({ pagina: await avaliar(conexao, '({caminho:location.pathname,titulo:document.querySelector("h1")?.textContent,alertas:[...document.querySelectorAll("[role=alert],[role=status]")].map(e=>e.textContent)})'), respostas: conexao.eventos.filter((e) => e.method === 'Network.responseReceived' && e.params.response.url.includes('/api/')).slice(-8).map((e) => ({ caminho: new URL(e.params.response.url).pathname, status: e.params.response.status })) })); } catch { /* Página já encerrada. */ }
  }
} finally {
  for (const filho of FILHOS) {
    try { if (filho.exitCode === null) { filho.send('stop'); await esperar(() => filho.exitCode !== null); } verificar(filho.exitCode === 0); }
    catch { filho.kill(); process.exitCode = 1; }
  }
  if (frontend) await frontend.close();
  if (chrome) {
    try { await navegador?.comando('Browser.close'); } catch { /* Chrome pode fechar antes da resposta. */ }
    for (const conexao of CONEXOES) conexao.socket.close();
    try { await esperar(() => chrome.exitCode !== null, 10000); } catch { chrome.kill(); process.exitCode = 1; }
  }
  if (prisma) {
    try {
      const usuarios = await prisma.user.findMany({ where: { email: { in: [...EMAILS] } }, select: { id: true } }); const ids = usuarios.map((u) => u.id);
      const escritorios = await prisma.office.findMany({ where: { name: { startsWith: `Equipe ${EXECUCAO} ` } }, select: { id: true } }); const idsEscritorios = escritorios.map((e) => e.id);
      await prisma.$transaction(async (transacao) => {
        await transacao.membershipHistory.deleteMany({ where: { membership: { officeId: { in: idsEscritorios } } } });
        for (const modelo of ['recoveryEmailJob', 'passwordRecovery', 'session', 'membership']) await transacao[modelo].deleteMany({ where: { userId: { in: ids } } });
        await transacao.user.deleteMany({ where: { id: { in: ids } } }); await transacao.office.deleteMany({ where: { id: { in: idsEscritorios } } });
        await transacao.rateLimitBucket.deleteMany({ where: { keyHash: { in: [...HASHES] } } });
      });
      verificar(await prisma.user.count({ where: { email: { in: [...EMAILS] } } }) === 0);
      verificar(await prisma.rateLimitBucket.count({ where: { keyHash: { in: [...HASHES] } } }) === 0);
      if (anteriores) verificar(await fotografarDados() === anteriores);
      etapa = 'limpeza'; relatar({ registrosTemporariosRestantes: 0, dadosAnterioresPreservados: true });
    } catch { console.error(JSON.stringify({ etapa: 'limpeza', ok: false })); process.exitCode = 1; }
    await prisma.$disconnect();
  }
  if (perfil) {
    const absoluto = realpathSync(perfil), raiz = realpathSync(tmpdir()); verificar(absoluto.toLowerCase().startsWith((raiz + sep).toLowerCase()) && absoluto.split(sep).at(-1).startsWith('neodireito-equipe-'));
    rmSync(absoluto, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  }
  etapa = 'processos_encerrados'; relatar({ somenteProcessosDestaVerificacao: true });
}
