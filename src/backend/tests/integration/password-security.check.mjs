// Verificação explícita: Chrome, SMTP, duas instâncias HTTP e PostgreSQL reais.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as criarServidorTcp } from 'node:net';
import { setTimeout as aguardar } from 'node:timers/promises';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { carregarAmbiente } from '../../dist/environment.js';
import { criarClientePrisma } from '../../dist/database.js';
import { RepositorioTrabalhosRecuperacaoPrisma } from '../../dist/infrastructure/prisma/prisma-recovery-email-jobs.js';
import { RepositorioSenhasPrisma } from '../../dist/infrastructure/prisma/prisma-password-repository.js';
import { RecuperacaoDeSenha } from '../../dist/domain/password-recovery/password-recovery.js';
import { TokensRecuperacaoCriptograficos } from '../../dist/infrastructure/security/crypto-password-recovery.js';
import { ChavesLimiteRequisicoesHmac } from '../../dist/infrastructure/security/hmac-rate-limit-keys.js';
import { ProtecaoDeSenhasArgon2 } from '../../dist/infrastructure/security/argon2-password-hasher.js';
import { RepositorioAutenticacaoPrisma } from '../../dist/infrastructure/prisma/prisma-authentication-repository.js';
import { Sessao } from '../../dist/domain/sessions/session.js';

const EXECUCAO = randomUUID(), EMAIL = `rf007-${EXECUCAO}@example.invalid`, ESCRITORIO = `RF007 ${EXECUCAO}`;
const SENHAS = [randomUUID(), randomUUID(), randomUUID()];
const SEGREDO_LIMITADOR = randomBytes(48).toString('base64url');
const CHAVES = new ChavesLimiteRequisicoesHmac(SEGREDO_LIMITADOR), HASHES = new Set();
const ENCERRADOS_ABRUPTAMENTE = new Set();
let falhasSmtp = 0, tentativasSmtp = 0;
const FILHOS = [], CONEXOES = [], LOGS = [], MENSAGENS = [], SEGREDOS = [...SENHAS];
let prisma, smtp, frontend, chrome, perfil, etapa = 'inicializacao', idUsuario, idEscritorio, anteriores;
const relatar = (dados = {}) => console.log(JSON.stringify({ etapa, ok: true, ...dados }));
function verificar(condicao) { assert.equal(Boolean(condicao), true); }
async function esperar(consultar, prazo = 20000) {
  const ate = Date.now() + prazo;
  while (Date.now() < ate) { const resultado = await consultar(); if (resultado) return resultado; await aguardar(80); }
  throw new Error('Prazo da verificação excedido');
}
async function portaLivre() {
  const servidor = criarServidorTcp(); await new Promise((resolver, rejeitar) => { servidor.on('error', rejeitar); servidor.listen(0, '127.0.0.1', resolver); });
  const porta = servidor.address().port; await new Promise((resolver) => servidor.close(resolver)); return porta;
}
async function conectar(url) {
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
  CONEXOES.push(conexao); for (const metodo of ['Page.enable', 'Runtime.enable', 'Network.enable']) await conexao.comando(metodo); return conexao;
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
async function iniciarBackend(porta, portaFrontend, portaSmtp, intervalo = 100) {
  const filho = spawn(process.execPath, ['--input-type=module', '-e', "process.on('message',m=>{if(m==='stop'){process.emit('SIGTERM');process.disconnect();}});await import('./dist/server.js');process.send(process.exitCode===1?'failed':'ready');"], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, PORT: String(porta), HOST: '127.0.0.1', TRUST_PROXY: '127.0.0.1/32', NODE_ENV: 'development',
      PROVEDOR_EMAIL: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(portaSmtp), SMTP_SEGURO: 'false',
      URL_FRONTEND: `http://127.0.0.1:${portaFrontend}`, AUTH_FRONTEND_ORIGIN: `http://127.0.0.1:${portaFrontend}`,
      EMAIL_FILA_INTERVALO_MS: String(intervalo), EMAIL_FILA_ATRASO_INICIAL_SEGUNDOS: '3',
      RATE_LIMIT_HMAC_SECRET: SEGREDO_LIMITADOR, RATE_LIMIT_CLEANUP_INTERVAL_MS: '3600000',
      RATE_LIMIT_LOGIN_IDENTITY_MAX: '30', RECUPERACAO_JANELA_IP_SEGUNDOS: '86400', RECUPERACAO_JANELA_EMAIL_SEGUNDOS: '86400',
      REDEFINICAO_JANELA_SEGUNDOS: '86400', ALTERACAO_SENHA_JANELA_SEGUNDOS: '86400' },
  });
  FILHOS.push(filho); filho.stdout.on('data', (d) => LOGS.push(String(d))); filho.stderr.on('data', (d) => LOGS.push(String(d)));
  await new Promise((resolver, rejeitar) => { const prazo = setTimeout(() => rejeitar(new Error('Backend indisponível')), 15000);
    filho.once('message', (mensagem) => { clearTimeout(prazo); mensagem === 'ready' ? resolver() : rejeitar(new Error('Backend indisponível')); });
    filho.once('exit', () => { clearTimeout(prazo); rejeitar(new Error('Backend encerrado')); }); });
  return `http://127.0.0.1:${porta}`;
}
function registrarChave(escopo, ip, identificador) { HASHES.add(CHAVES.gerarHashDaChave(escopo, ip, identificador)); }
async function fotografarDados() {
  return JSON.stringify(await Promise.all(['office', 'user', 'membership', 'session', 'passwordRecovery', 'recoveryEmailJob'].map((modelo) => prisma[modelo].findMany({ orderBy: { id: 'asc' } }))));
}
try {
  prisma = criarClientePrisma(carregarAmbiente().DATABASE_URL); await prisma.$queryRaw`SELECT 1`;
  anteriores = await fotografarDados();
  // O worker real não pode capturar trabalhos anteriores à verificação.
  verificar(await prisma.recoveryEmailJob.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }) === 0);
  smtp = new SMTPServer({ authOptional: true, disabledCommands: ['AUTH', 'STARTTLS'], logger: false,
    onData(fluxo, _sessao, concluir) { simpleParser(fluxo).then((mensagem) => { tentativasSmtp++;
      const tokenCapturado = mensagem.text?.match(/#token=([\w-]+)/)?.[1]; if (tokenCapturado) SEGREDOS.push(tokenCapturado);
      if (falhasSmtp > 0) { falhasSmtp--; const erro = new Error('Falha transitória de teste'); erro.responseCode = 451; concluir(erro); }
      else { MENSAGENS.push(mensagem); concluir(); } }, () => concluir(new Error('Captura indisponível'))); } });
  await new Promise((resolver, rejeitar) => { smtp.on('error', rejeitar); smtp.listen(0, '127.0.0.1', resolver); });
  const portaFrontend = await portaLivre(), portaSmtp = smtp.server.address().port;
  const portasBackend = [await portaLivre(), await portaLivre()];
  const enderecos = [await iniciarBackend(portasBackend[0], portaFrontend, portaSmtp, 3600000), await iniciarBackend(portasBackend[1], portaFrontend, portaSmtp, 3600000)];
  for (const endereco of enderecos) { verificar((await fetch(`${endereco}/health`)).status === 200); verificar((await fetch(`${endereco}/ready`)).status === 200); }
  const urlFrontend = `http://127.0.0.1:${portaFrontend}`;
  process.chdir(fileURLToPath(new URL('../../../frontend/', import.meta.url)));
  frontend = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: portaFrontend, strictPort: true, proxy: { '/api': { target: enderecos[0], changeOrigin: true } } } }); await frontend.listen();
  perfil = mkdtempSync(join(tmpdir(), 'neodireito-senhas-')); mkdirSync(join(perfil, 'Default'));
  writeFileSync(join(perfil, 'Default', 'Preferences'), JSON.stringify({ credentials_enable_service: false, profile: { password_manager_enabled: false } }));
  chrome = spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--no-first-run', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--window-size=1280,1000', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await esperar(() => existsSync(join(perfil, 'DevToolsActivePort')));
  const portaChrome = Number(readFileSync(join(perfil, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
  const alvos = await fetch(`http://127.0.0.1:${portaChrome}/json/list`).then((r) => r.json()); const aba = await conectar(alvos.find((a) => a.type === 'page').webSocketDebuggerUrl);
  for (const escopo of ['onboarding-ip', 'login-ip', 'login-identity', 'refresh-ip', 'recovery-ip', 'recovery-email', 'reset-ip', 'password-change-ip']) registrarChave(escopo, '127.0.0.1', EMAIL);
  etapa = 'cadastro_e_login_pelo_chrome';
  await abrir(aba, `${urlFrontend}/register`, '#register-nomeEscritorio');
  verificar(await enviarFormulario(aba, '/api/v1/onboarding', { '#register-nomeEscritorio': ESCRITORIO, '#register-nomeAdministrador': 'Pessoa temporária', '#register-email': EMAIL.toUpperCase(), '#register-senha': SENHAS[0], '#register-confirmacaoSenha': SENHAS[0] }) === 201);
  const usuario = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } }); idUsuario = usuario.id;
  const vinculo = await prisma.membership.findFirstOrThrow({ where: { userId: idUsuario } }); idEscritorio = vinculo.officeId;
  registrarChave('password-change-user', '127.0.0.1', idUsuario);
  verificar(vinculo.role === 'OWNER'); verificar(usuario.passwordHash.startsWith('$argon2id$'));
  async function entrar(senha, esperado = 200) {
    await abrir(aba, `${urlFrontend}/login`, '#login-email');
    verificar(await enviarFormulario(aba, '/api/v1/auth/login', { '#login-email': EMAIL, '#login-password': senha }) === esperado);
    if (esperado === 200) await esperar(() => avaliar(aba, "location.pathname==='/app'&&document.body.innerText.includes('Sessão autenticada')"));
  }
  await entrar(SENHAS[0]); relatar();
  const sessoesAnteriores = await prisma.session.findMany({ where: { userId: idUsuario } }); verificar(sessoesAnteriores.length > 0);
  etapa = 'solicitacao_smtp_real';
  await abrir(aba, `${urlFrontend}/recuperar-senha`, '#senha-email');
  verificar(await enviarFormulario(aba, '/api/v1/auth/recuperar-senha', { '#senha-email': EMAIL.toUpperCase() }) === 202);
  await esperar(() => avaliar(aba, "document.body.innerText.includes('Se houver uma conta elegível')"));
  etapa = 'reinicio_com_trabalho_duravel';
  const pendente = await prisma.recoveryEmailJob.findFirstOrThrow({ where: { userId: idUsuario } });
  verificar(pendente.status === 'PENDING' && pendente.attempts === 0 && pendente.recoveryId === null);
  verificar(MENSAGENS.length === 0 && await prisma.passwordRecovery.count({ where: { userId: idUsuario } }) === 0);
  const original = FILHOS[0]; ENCERRADOS_ABRUPTAMENTE.add(original); original.kill('SIGKILL');
  await esperar(() => original.exitCode !== null || original.signalCode !== null);
  FILHOS[1].send('stop'); await esperar(() => FILHOS[1].exitCode !== null); verificar(FILHOS[1].exitCode === 0);
  await iniciarBackend(portasBackend[0], portaFrontend, portaSmtp);
  await iniciarBackend(portasBackend[1], portaFrontend, portaSmtp);
  await esperar(() => MENSAGENS.length === 1);
  await esperar(async () => (await prisma.recoveryEmailJob.findUniqueOrThrow({ where: { id: pendente.id } })).status === 'SENT');
  verificar((await prisma.recoveryEmailJob.findUniqueOrThrow({ where: { id: pendente.id } })).attempts === 1);
  relatar({ pendenteAntesDoReinicio: true, novaInstanciaEnviou: true, tentativas: 1 });
  verificar(MENSAGENS[0].to.value[0].address === EMAIL); verificar(MENSAGENS[0].html.includes('30 minutos'));
  const link = MENSAGENS[0].text.match(/http[^\s]+#token=[\w-]+/)[0], token = new URLSearchParams(new URL(link).hash.slice(1)).get('token'); SEGREDOS.push(token);
  registrarChave('reset-token', '127.0.0.1', createHash('sha256').update(token).digest('hex'));
  const armazenados = await prisma.passwordRecovery.findMany({ where: { userId: idUsuario } });
  verificar(armazenados.length === 1 && armazenados[0].tokenHash === createHash('sha256').update(token).digest('hex'));
  verificar(!JSON.stringify(armazenados).includes(token)); relatar({ mensagemCapturada: true, somenteHashNoBanco: true });
  etapa = 'redefinicao_pelo_chrome';
  await abrir(aba, link, '#senha-novaSenha'); verificar(await avaliar(aba, 'location.hash === "" && location.search === ""'));
  verificar(await enviarFormulario(aba, '/api/v1/auth/redefinir-senha', { '#senha-novaSenha': SENHAS[1], '#senha-confirmacaoNovaSenha': SENHAS[1] }) === 200);
  await esperar(() => avaliar(aba, "location.pathname==='/login'&&document.body.innerText.includes('Senha alterada')"));
  verificar(await prisma.session.count({ where: { userId: idUsuario, revokedAt: null } }) === 0);
  await entrar(SENHAS[0], 401); await entrar(SENHAS[1]); relatar({ senhaAntigaRejeitada: true, novaSenhaAceita: true, sessoesRevogadas: sessoesAnteriores.length });
  etapa = 'reutilizacao_e_expiracao';
  await abrir(aba, link, '#senha-novaSenha');
  verificar(await enviarFormulario(aba, '/api/v1/auth/redefinir-senha', { '#senha-novaSenha': SENHAS[2], '#senha-confirmacaoNovaSenha': SENHAS[2] }) === 400);
  await esperar(() => avaliar(aba, "document.body.innerText.includes('Link inválido, utilizado ou expirado')"));
  await abrir(aba, `${urlFrontend}/recuperar-senha`, '#senha-email');
  verificar(await enviarFormulario(aba, '/api/v1/auth/recuperar-senha', { '#senha-email': EMAIL }) === 202); await esperar(() => MENSAGENS.length === 2);
  const linkExpirado = MENSAGENS[1].text.match(/http[^\s]+#token=[\w-]+/)[0];
  const tokenExpirado = new URLSearchParams(new URL(linkExpirado).hash.slice(1)).get('token'); SEGREDOS.push(tokenExpirado);
  const hashExpirado = createHash('sha256').update(tokenExpirado).digest('hex'); registrarChave('reset-token', '127.0.0.1', hashExpirado);
  await prisma.passwordRecovery.update({ where: { tokenHash: hashExpirado }, data: { createdAt: new Date(Date.now() - 3600000), expiresAt: new Date(Date.now() - 1000) } });
  await abrir(aba, linkExpirado, '#senha-novaSenha');
  verificar(await enviarFormulario(aba, '/api/v1/auth/redefinir-senha', { '#senha-novaSenha': SENHAS[2], '#senha-confirmacaoNovaSenha': SENHAS[2] }) === 400); relatar();
  etapa = 'falha_smtp_retentativa_duas_instancias';
  falhasSmtp = 1; const tentativasAntes = tentativasSmtp;
  await abrir(aba, `${urlFrontend}/recuperar-senha`, '#senha-email');
  verificar(await enviarFormulario(aba, '/api/v1/auth/recuperar-senha', { '#senha-email': EMAIL }) === 202);
  const falhou = await esperar(() => prisma.recoveryEmailJob.findFirst({ where: { userId: idUsuario, status: 'PENDING', errorCode: 'PROVEDOR_TRANSITORIO' } }));
  verificar(falhou.attempts === 1 && falhou.nextAttemptAt.getTime() > Date.now());
  const tentativaAnterior = await prisma.passwordRecovery.findUniqueOrThrow({ where: { id: falhou.recoveryId } });
  verificar(tentativaAnterior.invalidatedAt !== null);
  verificar((await fetch(`${enderecos[0]}/ready`)).status === 200);
  await aguardar(800); verificar(tentativasSmtp === tentativasAntes + 1);
  await esperar(() => MENSAGENS.length === 3);
  await esperar(async () => (await prisma.recoveryEmailJob.findUniqueOrThrow({ where: { id: falhou.id } })).status === 'SENT');
  const sucesso = await prisma.recoveryEmailJob.findUniqueOrThrow({ where: { id: falhou.id } });
  const recuperada = await prisma.passwordRecovery.findUniqueOrThrow({ where: { id: sucesso.recoveryId } });
  verificar(sucesso.attempts === 2 && tentativasSmtp === tentativasAntes + 2 && recuperada.tokenHash !== tentativaAnterior.tokenHash);
  verificar(await prisma.passwordRecovery.count({ where: { tokenHash: tentativaAnterior.tokenHash } }) === 0);
  const tokenRetentativa = new URLSearchParams(new URL(MENSAGENS[2].text.match(/http[^\s]+#token=[\w-]+/)[0]).hash.slice(1)).get('token'); SEGREDOS.push(tokenRetentativa);
  verificar(recuperada.tokenHash === createHash('sha256').update(tokenRetentativa).digest('hex'));
  verificar(!(await fotografarDados()).includes(tokenRetentativa));
  await aguardar(500); verificar(MENSAGENS.length === 3);
  relatar({ falha451: true, atrasoRespeitado: true, duasInstancias: true, umaEntregaPorTentativa: true, hashSubstituido: true, readiness: 200 });
  etapa = 'alteracao_autenticada_duas_abas';
  await abrir(aba, `${urlFrontend}/seguranca`, '#senha-senhaAtual');
  const novoAlvo = await fetch(`http://127.0.0.1:${portaChrome}/json/new?${encodeURIComponent(`${urlFrontend}/app`)}`, { method: 'PUT' }).then((r) => r.json());
  const segundaAba = await conectar(novoAlvo.webSocketDebuggerUrl);
  await esperar(() => avaliar(segundaAba, "document.body.innerText.includes('Sessão autenticada')"));
  verificar(await enviarFormulario(aba, '/api/v1/auth/alterar-senha', { '#senha-senhaAtual': SENHAS[1], '#senha-novaSenha': SENHAS[2], '#senha-confirmacaoNovaSenha': SENHAS[2] }) === 200);
  for (const atual of [aba, segundaAba]) await esperar(() => avaliar(atual, "location.pathname==='/login'&&!!document.querySelector('#login-email')&&!document.body.innerText.includes('Sessão autenticada')"));
  verificar(await prisma.session.count({ where: { userId: idUsuario, revokedAt: null } }) === 0);
  const cookies = await aba.comando('Network.getAllCookies'); verificar(!cookies.cookies.some((c) => c.name === 'refresh_token'));
  for (const atual of [aba, segundaAba]) verificar(await avaliar(atual, '(async()=>localStorage.length===0&&sessionStorage.length===0&&(await indexedDB.databases()).length===0&&document.cookie==="")()'));
  relatar({ logoutEmDuasAbas: true, refreshCookieRemovido: true, armazenamentoVazio: true });
  await segundaAba.comando('Page.close'); segundaAba.socket.close();
  await entrar(SENHAS[1], 401); await entrar(SENHAS[2]);
  etapa = 'limites_compartilhados_duas_instancias';
  async function requisitar(indice, rota, corpo, ip, acesso) {
    return fetch(`${enderecos[indice % 2]}/api/v1/auth/${rota}`, { method: 'POST', headers: { origin: urlFrontend, 'content-type': 'application/json', 'x-forwarded-for': ip, ...(acesso ? { authorization: `Bearer ${acesso}` } : {}) }, body: JSON.stringify(corpo) });
  }
  const emailLimite = `limite-${EXECUCAO}@example.invalid`;
  const resultadosEmail = [];
  for (let indice = 1; indice <= 4; indice++) {
    const ip = `192.0.2.${indice}`; registrarChave('recovery-ip', ip, emailLimite); registrarChave('recovery-email', ip, emailLimite);
    resultadosEmail.push((await requisitar(indice, 'recuperar-senha', { email: emailLimite }, ip)).status);
  }
  verificar(JSON.stringify(resultadosEmail) === '[202,202,202,429]');
  const resultadosIp = [];
  for (let indice = 0; indice < 6; indice++) {
    const email = `limite-${indice}-${EXECUCAO}@example.invalid`; registrarChave('recovery-ip', '192.0.2.20', email); registrarChave('recovery-email', '192.0.2.20', email);
    resultadosIp.push((await requisitar(indice, 'recuperar-senha', { email }, '192.0.2.20')).status);
  }
  verificar(JSON.stringify(resultadosIp) === '[202,202,202,202,202,429]');
  const tokenInexistente = randomBytes(32).toString('base64url'), hashInexistente = createHash('sha256').update(tokenInexistente).digest('hex');
  const resultadosToken = [];
  for (let indice = 1; indice <= 6; indice++) {
    const ip = `192.0.2.${30 + indice}`; registrarChave('reset-ip', ip); registrarChave('reset-token', ip, hashInexistente);
    resultadosToken.push((await requisitar(indice, 'redefinir-senha', { token: tokenInexistente, novaSenha: SENHAS[0], confirmacaoNovaSenha: SENHAS[0] }, ip)).status);
  }
  verificar(JSON.stringify(resultadosToken) === '[400,400,400,400,400,429]');
  const eventoLogin = aba.eventos.filter((e) => e.method === 'Network.responseReceived' && new URL(e.params.response.url).pathname === '/api/v1/auth/login' && e.params.response.status === 200).at(-1);
  const corpoLogin = await aba.comando('Network.getResponseBody', { requestId: eventoLogin.params.requestId }); const acesso = JSON.parse(corpoLogin.body).tokenAcesso; SEGREDOS.push(acesso);
  const resultadosUsuario = [];
  // Uma tentativa já ocorreu pelo frontend; restam quatro antes do bloqueio.
  for (let indice = 1; indice <= 5; indice++) {
    const ip = `192.0.2.${50 + indice}`; registrarChave('password-change-ip', ip); registrarChave('password-change-user', ip, idUsuario);
    resultadosUsuario.push((await requisitar(indice, 'alterar-senha', { senhaAtual: 'errada', novaSenha: SENHAS[0], confirmacaoNovaSenha: SENHAS[0] }, ip, acesso)).status);
  }
  verificar(JSON.stringify(resultadosUsuario) === '[400,400,400,400,429]'); relatar({ email: resultadosEmail, ip: resultadosIp, token: resultadosToken, usuario: resultadosUsuario });
  for (const filho of FILHOS) {
    if (filho.exitCode === null && filho.signalCode === null) { filho.send('stop'); await esperar(() => filho.exitCode !== null); verificar(filho.exitCode === 0); }
  }
  etapa = 'reserva_lease_e_rollback_postgresql';
  const trabalhos = new RepositorioTrabalhosRecuperacaoPrisma(prisma);
  const outraInstancia = new RepositorioTrabalhosRecuperacaoPrisma(prisma);
  await trabalhos.registrarSolicitacao(EMAIL);
  const reservas = await Promise.all([trabalhos.reservarTrabalho(60), outraInstancia.reservarTrabalho(60)]);
  verificar(reservas.filter(Boolean).length === 1); const primeira = reservas.find(Boolean);
  const hashInicial = createHash('sha256').update(randomBytes(32)).digest('hex');
  verificar(await trabalhos.prepararTentativa(primeira, hashInicial));
  await prisma.recoveryEmailJob.update({ where: { id: primeira.id }, data: { lockedAt: new Date(Date.now() - 120000), lockedUntil: new Date(Date.now() - 60000) } });
  const retomada = await outraInstancia.reservarTrabalho(60); verificar(retomada.id === primeira.id && retomada.idReserva !== primeira.idReserva);
  const antesDoRollback = await fotografarDados();
  const falhaFila = prisma.$extends({ query: { recoveryEmailJob: { async update() { throw new Error('Falha local simulada'); } } } });
  await assert.rejects(() => new RepositorioTrabalhosRecuperacaoPrisma(falhaFila).prepararTentativa(retomada, createHash('sha256').update(randomBytes(32)).digest('hex')));
  verificar(await fotografarDados() === antesDoRollback);
  verificar(await outraInstancia.prepararTentativa(retomada, createHash('sha256').update(randomBytes(32)).digest('hex')));
  verificar(await prisma.passwordRecovery.count({ where: { tokenHash: hashInicial } }) === 0);
  verificar(await trabalhos.concluirEnvio(primeira) === false);
  verificar(await trabalhos.registrarFalha(primeira, 'PROVEDOR_DEFINITIVO', true, 0) === false);
  verificar(await outraInstancia.concluirEnvio(retomada));
  relatar({ reservaExclusiva: true, leaseExpiradoRecuperado: true, resultadoAntigoRejeitado: true, rollbackIntegral: true });
  etapa = 'atomicidade_e_rollback_postgresql';
  const repositorio = new RepositorioSenhasPrisma(prisma), tokens = new TokensRecuperacaoCriptograficos();
  const usuarioAtual = await repositorio.buscarUsuarioPorId(idUsuario), novoHashSenha = await new ProtecaoDeSenhasArgon2().gerarHashDaSenha(randomUUID());
  const recuperacoes = [0, 1].map(() => RecuperacaoDeSenha.criar(idUsuario, tokens.gerarToken().hash));
  verificar((await Promise.all(recuperacoes.map((r) => repositorio.criarRecuperacao(r, usuarioAtual.hashSenha)))).every(Boolean));
  verificar(await prisma.passwordRecovery.count({ where: { userId: idUsuario, usedAt: null, invalidatedAt: null } }) === 1);
  const utilizavel = await prisma.passwordRecovery.findFirstOrThrow({ where: { userId: idUsuario, usedAt: null, invalidatedAt: null } });
  const antes = await fotografarDados();
  // Falha após writes reais usando cliente estendido; a transação real deve desfazer todos.
  const prismaComFalha = prisma.$extends({ query: { session: { async updateMany() { throw new Error('Falha simulada após alteração de senha'); } } } });
  await assert.rejects(() => new RepositorioSenhasPrisma(prismaComFalha).redefinirSenha({ idUsuario, idRecuperacao: utilizavel.id, hashSenhaAnterior: usuarioAtual.hashSenha, novoHashSenha, agora: new Date() }));
  verificar(await fotografarDados() === antes);
  const dados = { idUsuario, idRecuperacao: utilizavel.id, hashSenhaAnterior: usuarioAtual.hashSenha, novoHashSenha, agora: new Date() };
  const resultados = await Promise.all([repositorio.redefinirSenha(dados), repositorio.redefinirSenha(dados)]);
  verificar(resultados.filter(Boolean).length === 1); verificar(await prisma.session.count({ where: { userId: idUsuario, revokedAt: null } }) === 0);
  // Simula retomada de um registro antigo já consumido, sem ressuscitar seu token.
  await prisma.recoveryEmailJob.update({ where: { id: retomada.id }, data: { status: 'PENDING', recoveryId: utilizavel.id, nextAttemptAt: new Date(), leaseId: null, lockedAt: null, lockedUntil: null } });
  const consumida = await trabalhos.reservarTrabalho(60);
  verificar(await trabalhos.prepararTentativa(consumida, createHash('sha256').update(randomBytes(32)).digest('hex')) === null);
  verificar((await prisma.passwordRecovery.findUniqueOrThrow({ where: { id: utilizavel.id } })).tokenHash === utilizavel.tokenHash);
  verificar((await prisma.recoveryEmailJob.findUniqueOrThrow({ where: { id: retomada.id } })).status === 'FAILED');
  await assert.rejects(() => new RepositorioAutenticacaoPrisma(prisma).salvarSessao(Sessao.criar({ idUsuario, idEscritorioAtivo: idEscritorio, hashTokenRenovacao: tokens.gerarToken().hash, expiraEm: new Date(Date.now() + 60000) }), usuarioAtual.hashSenha));
  relatar({ rollbackIntegral: true, redefinicoesConcorrentesAceitas: 1, loginComHashAntigoBloqueado: true });
  etapa = 'limpeza_expirados_em_tabela_temporaria';
  await prisma.$transaction(async (transacao) => {
    // Tabela da própria conexão: a rotina real não toca recuperações do produto.
    await transacao.$executeRaw`CREATE TEMP TABLE password_recoveries (id uuid PRIMARY KEY, expires_at timestamptz NOT NULL) ON COMMIT DROP`;
    await transacao.$executeRaw`INSERT INTO password_recoveries SELECT gen_random_uuid(), clock_timestamp() - interval '1 minute' FROM generate_series(1, 501)`;
    await transacao.$executeRaw`INSERT INTO password_recoveries VALUES (gen_random_uuid(), clock_timestamp() + interval '1 hour')`;
    const limpeza = new RepositorioSenhasPrisma(transacao);
    verificar(await limpeza.removerRecuperacoesExpiradas() === 500);
    verificar(await limpeza.removerRecuperacoesExpiradas() === 1);
    verificar(await limpeza.removerRecuperacoesExpiradas() === 0);
    const restantes = await transacao.$queryRaw`SELECT count(*)::int AS quantidade FROM password_recoveries`;
    verificar(restantes[0].quantidade === 1);
  });
  relatar({ limitePorLote: 500, registroValidoPreservado: true });
  etapa = 'limpeza_trabalhos_em_lotes';
  await prisma.$transaction(async (transacao) => {
    await transacao.$executeRaw`CREATE TEMP TABLE recovery_email_jobs (id uuid PRIMARY KEY, status text NOT NULL, updated_at timestamptz NOT NULL) ON COMMIT DROP`;
    await transacao.$executeRaw`INSERT INTO recovery_email_jobs SELECT gen_random_uuid(), 'SENT', clock_timestamp() - interval '8 days' FROM generate_series(1, 501)`;
    await transacao.$executeRaw`INSERT INTO recovery_email_jobs VALUES (gen_random_uuid(), 'SENT', clock_timestamp()), (gen_random_uuid(), 'PENDING', clock_timestamp() - interval '8 days')`;
    const limpeza = new RepositorioTrabalhosRecuperacaoPrisma(transacao);
    verificar(await limpeza.removerTrabalhosAntigos(7) === 500);
    verificar(await limpeza.removerTrabalhosAntigos(7) === 1);
    verificar(await limpeza.removerTrabalhosAntigos(7) === 0);
    verificar((await transacao.$queryRaw`SELECT count(*)::int AS quantidade FROM recovery_email_jobs`)[0].quantidade === 2);
  });
  relatar({ limitePorLote: 500, recentesEPendentesPreservados: true });
  etapa = 'segredos_e_erros_do_navegador';
  verificar(!aba.eventos.some((e) => e.method === 'Runtime.exceptionThrown'));
  const estadoPersistido = await fotografarDados();
  for (const segredo of SEGREDOS) { verificar(!LOGS.join('').includes(segredo)); verificar(!estadoPersistido.includes(segredo)); }
  verificar((await fetch(`${urlFrontend}/favicon.svg`)).status === 200);
  verificar(!aba.eventos.filter((e) => e.method === 'Network.requestWillBeSent').some((e) => e.params.request.url.includes('#token=') || e.params.request.url.includes('?token=')));
  relatar({ logsSemSegredos: true, favicon: 200 });
} catch {
  console.error(JSON.stringify({ etapa, ok: false })); process.exitCode = 1;
  const aba = CONEXOES[0];
  if (aba?.socket.readyState === WebSocket.OPEN) {
    try {
      const diagnostico = await avaliar(aba, `({caminho:location.pathname, formularioSenha:!!document.querySelector('#senha-novaSenha'),
        formularioLogin:!!document.querySelector('#login-email'), sucesso:document.body.innerText.includes('Senha alterada'),
        falha:document.body.innerText.includes('Não foi possível concluir'), ocupado:document.querySelector('form')?.getAttribute('aria-busy')})`);
      const respostas = aba.eventos.filter((e) => e.method === 'Network.responseReceived' && new URL(e.params.response.url).pathname.startsWith('/api/'))
        .map((e) => ({ caminho: new URL(e.params.response.url).pathname, situacao: e.params.response.status }));
      console.error(JSON.stringify({ etapa: 'diagnostico_sem_segredos', diagnostico, respostas }));
    } catch { /* Não imprimir erros brutos do navegador. */ }
  }
}
finally {
  // Para os produtores antes de remover dados, evitando emissão após a limpeza.
  for (const filho of FILHOS) {
    if (ENCERRADOS_ABRUPTAMENTE.has(filho)) continue;
    try { if (filho.exitCode === null) { filho.send('stop'); await esperar(() => filho.exitCode !== null, 20000); } verificar(filho.exitCode === 0); }
    catch { filho.kill(); process.exitCode = 1; }
  }
  if (frontend) await frontend.close();
  if (chrome) {
    try { const ativa = CONEXOES.find((c) => c.socket.readyState === WebSocket.OPEN); if (ativa) await ativa.comando('Browser.close'); } catch { /* Chrome pode fechar antes da resposta. */ }
    for (const conexao of CONEXOES) conexao.socket.close();
    try { await esperar(() => chrome.exitCode !== null, 10000); } catch { chrome.kill(); process.exitCode = 1; }
  }
  if (smtp) await new Promise((resolver) => smtp.close(resolver)); MENSAGENS.length = 0;
  if (prisma) {
    try {
      const usuario = await prisma.user.findUnique({ where: { email: EMAIL } });
      const escritorio = await prisma.office.findFirst({ where: { name: ESCRITORIO } });
      await prisma.$transaction(async (transacao) => {
        if (usuario) {
          await transacao.recoveryEmailJob.deleteMany({ where: { userId: usuario.id } });
          await transacao.passwordRecovery.deleteMany({ where: { userId: usuario.id } });
          await transacao.session.deleteMany({ where: { userId: usuario.id } });
          await transacao.membership.deleteMany({ where: { userId: usuario.id } });
          await transacao.user.delete({ where: { id: usuario.id } });
        }
        if (escritorio) await transacao.office.delete({ where: { id: escritorio.id } });
        await transacao.rateLimitBucket.deleteMany({ where: { keyHash: { in: [...HASHES] } } });
      });
      verificar(await prisma.user.count({ where: { email: EMAIL } }) === 0);
      verificar(await prisma.rateLimitBucket.count({ where: { keyHash: { in: [...HASHES] } } }) === 0);
      if (anteriores) verificar(await fotografarDados() === anteriores);
      etapa = 'limpeza'; relatar({ registrosTemporariosRestantes: 0, mensagensRestantes: MENSAGENS.length, dadosAnterioresPreservados: true });
    } catch { console.error(JSON.stringify({ etapa: 'limpeza', ok: false })); process.exitCode = 1; }
    await prisma.$disconnect();
  }
  if (perfil) {
    const absoluto = realpathSync(perfil), raiz = realpathSync(tmpdir());
    verificar(absoluto.toLowerCase().startsWith((raiz + sep).toLowerCase()) && absoluto.split(sep).at(-1).startsWith('neodireito-senhas-'));
    rmSync(absoluto, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  }
  etapa = 'processos_encerrados'; relatar({ somenteProcessosDestaVerificacao: true });
}
