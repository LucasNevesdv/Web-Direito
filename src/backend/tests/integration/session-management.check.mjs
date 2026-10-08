// Verificação explícita de RF-012/013/014 com Chrome e PostgreSQL reais.
// Os dados usam marcador único; o finally limpa somente esta execução.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as criarServidorTcp } from 'node:net';
import { setTimeout as aguardar } from 'node:timers/promises';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { carregarAmbiente } from '../../dist/environment.js';
import { criarClientePrisma } from '../../dist/database.js';
import { PERMISSOES_EQUIPE } from '../../dist/application/team/team-policy.js';
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
async function esperar(consultar, prazo = 20000) {
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
  return JSON.stringify([await prisma.officeSelection.findMany({orderBy:{tokenHash:'asc'}}),await Promise.all(['office', 'user', 'membership', 'session', 'passwordRecovery', 'recoveryEmailJob', 'membershipHistory']
    .map((modelo) => prisma[modelo].findMany({ orderBy: { id: 'asc' } })))]);
}
async function iniciarBackend(porta, portaFrontend) {
  const filho = spawn(process.execPath, ['--input-type=module', '-e', "process.on('message',m=>{if(m==='stop'){process.emit('SIGTERM');process.disconnect();}});await import('./dist/server.js');process.send(process.exitCode===1?'failed':'ready');"], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, PORT: String(porta), HOST: '127.0.0.1', NODE_ENV: 'development',
      URL_FRONTEND: `http://127.0.0.1:${portaFrontend}`, AUTH_FRONTEND_ORIGIN: `http://127.0.0.1:${portaFrontend}`,
      AUTH_JWT_SECRET: SEGREDO, AUTH_JWT_ISSUER: 'verificacao-equipe', AUTH_JWT_AUDIENCE: 'verificacao-equipe', RATE_LIMIT_REFRESH_MAX: '200',
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
  if (corpo.tokenAcesso) SEGREDOS.push(corpo.tokenAcesso); if (corpo.autorizacaoSelecao) SEGREDOS.push(corpo.autorizacaoSelecao);
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

// CENARIOS
async function api(token, caminho, metodo = 'GET', corpo, selecao = false) {
  const resposta = await fetch(`${endereco}${caminho}`, { method: metodo, headers: { Authorization: `${selecao ? 'Selecao' : 'Bearer'} ${token}`, Origin: urlFrontend, ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
  return { status: resposta.status, corpo: resposta.status === 204 ? null : await resposta.json(), resposta };
}
async function loginComSelecao(aba, pessoa) {
  await abrir(aba, `${urlFrontend}/login`, '#login-email'); const inicio = aba.eventos.length;
  verificar(await enviarFormulario(aba, '/api/v1/auth/login', { '#login-email': pessoa.email, '#login-password': pessoa.senha }) === 200);
  const resultado = await esperarResposta(aba, inicio, '/api/v1/auth/login');
  verificar(resultado.corpo.selecaoNecessaria && resultado.corpo.escritorios.length === 2 && !resultado.corpo.tokenAcesso);
  await esperar(() => avaliar(aba, "location.pathname==='/selecionar-escritorio'&&document.querySelectorAll('[data-escritorio]').length===2"));
  verificar(!(await aba.comando('Network.getCookies', { urls: [urlFrontend + '/api/v1/auth/refresh'] })).cookies.some(c => c.name === 'refresh_token'));
  return resultado.corpo.autorizacaoSelecao;
}
async function escolher(aba, idEscritorio, troca = false) {
  const inicio = aba.eventos.length;
  await clicar(aba, `[data-escritorio="${idEscritorio}"]`);
  const resultado = await esperarResposta(aba, inicio, `/api/v1/auth/${troca ? 'trocar' : 'selecionar'}-escritorio`);
  verificar(resultado.status === 200 && resultado.corpo.escritorio.id === idEscritorio);
  await esperar(() => avaliar(aba, "location.pathname==='/app'")); return resultado.corpo.tokenAcesso;
}
async function novaSelecao(pessoa) {
  const r = await api('', '/api/v1/auth/login', 'POST', {email:pessoa.email,senha:pessoa.senha});
  verificar(r.status === 200 && r.corpo.selecaoNecessaria); SEGREDOS.push(r.corpo.autorizacaoSelecao); return r.corpo.autorizacaoSelecao;
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

// EXECUCAO
  etapa = 'cadastros_e_vinculo_em_dois_escritorios';
  const abaInicial = await novaAba(), primeiro = await cadastrarEscritorio(abaInicial, 'primeiro');
  const abaProprietarioSegundo = await novaAba(await novoContexto()), segundo = await cadastrarEscritorio(abaProprietarioSegundo, 'segundo');
  const idPrimeiro = primeiro.vinculo.officeId, idSegundo = segundo.vinculo.officeId;
  const vinculo = await api(segundo.token, '/api/v1/equipe/usuarios/confirmar-vinculo', 'POST', { email: primeiro.email, papel:'ADMINISTRADOR', permissoes:[...PERMISSOES_EQUIPE], confirmacaoVinculo:true });
  verificar(vinculo.status === 201); relatar();
  etapa = 'login_e_selecao_no_frontend_sem_cookie_previo';
  const contexto = await novoContexto(), aba = await novaAba(contexto);
  const autorizacao = await loginComSelecao(aba, primeiro);
  verificar((await api(autorizacao, '/api/v1/auth/me')).status === 401);
  const tokenPrimeiro = await escolher(aba, idPrimeiro);
  verificar((await api(autorizacao, '/api/v1/auth/selecionar-escritorio', 'POST', {idEscritorio:idPrimeiro}, true)).status === 410);
  const idSessaoPrimeiro = JSON.parse(Buffer.from(tokenPrimeiro.split('.')[1], 'base64url')).sessionId;
  const registro = await prisma.session.findUniqueOrThrow({where:{id:idSessaoPrimeiro}});
  verificar(registro.browser === 'Chrome' && registro.maskedIp === '127.0.*.*' && registro.activeOfficeId === idPrimeiro); relatar();
  etapa = 'tres_abas_polling_coordenado_trinta_segundos';
  const abas = [aba,await novaAba(contexto),await novaAba(contexto)];
  for (const outra of abas.slice(1)) { await abrir(outra, `${urlFrontend}/app`, 'h1'); await esperar(()=>avaliar(outra,"document.body.innerText.includes('Sessão autenticada')")); }
  // CDP mantém as páginas visíveis para comprovar que a exclusão vem do Web Lock.
  for (const outra of abas) await avaliar(outra,"Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));");
  await aguardar(1500);
  const inicios = abas.map(a=>a.eventos.length);
  await aguardar(33000);
  const requisicoes = abas.flatMap((a,i)=>a.eventos.slice(inicios[i]).filter(e=>e.method==='Network.requestWillBeSent'&&new URL(e.params.request.url).pathname==='/api/v1/auth/me'));
  verificar(requisicoes.length === 1);
  verificar(!abas.some((a,i)=>a.eventos.slice(inicios[i]).some(e=>e.method==='Network.requestWillBeSent'&&e.params.request.url.endsWith('/refresh'))));
  relatar({abas:3,consultasPeriodicas:requisicoes.length,refreshDesnecessario:false});
  etapa = 'troca_com_resposta_atrasada_e_limpeza_de_contexto';
  await avaliar(abas[1], `(()=>{const original=window.fetch;window.fetch=async(...args)=>{const r=await original(...args);if(String(args[0]).startsWith('/api/v1/equipe/usuarios'))return new Promise(resolve=>{window.liberarRespostaAntiga=()=>resolve(r)});return r};history.pushState({},'', '/equipe');window.dispatchEvent(new PopStateEvent('popstate'));})()`);
  await esperar(()=>avaliar(abas[1],"typeof window.liberarRespostaAntiga==='function'"));
  await avaliar(aba,"history.pushState({},'', '/selecionar-escritorio');window.dispatchEvent(new PopStateEvent('popstate'));");
  await esperar(()=>avaliar(aba,"document.querySelectorAll('[data-escritorio]').length===2"));
  const tokenSegundo = await escolher(aba,idSegundo,true);
  for (const outra of abas) await esperar(()=>avaliar(outra,`location.pathname==='/app'&&document.body.innerText.includes(${JSON.stringify(`Equipe ${EXECUCAO} segundo`)})`));
  await avaliar(abas[1],"window.liberarRespostaAntiga();"); await aguardar(300);
  for (const outra of abas) verificar(!await avaliar(outra,`document.body.innerText.includes(${JSON.stringify(`Equipe ${EXECUCAO} primeiro`)})`));
  verificar((await api(tokenPrimeiro,'/api/v1/auth/me')).status===401);
  verificar(!!(await prisma.session.findUniqueOrThrow({where:{id:idSessaoPrimeiro}})).revokedAt);relatar({respostaAntigaDescartada:true,trocaTresAbas:true});
  etapa = 'isolamento_lista_ids_historico_mutacoes_permissoes';
  const lista = await api(tokenSegundo,'/api/v1/equipe/usuarios');verificar(lista.status===200&&lista.corpo.usuarios.every(u=>u.id!==primeiro.vinculo.id));
  for(const sufixo of ['', '/historico'])verificar((await api(tokenSegundo,`/api/v1/equipe/usuarios/${primeiro.vinculo.id}${sufixo}`)).status===404);
  verificar((await api(tokenSegundo,`/api/v1/equipe/usuarios/${primeiro.vinculo.id}`,'PATCH',{papel:'ADVOGADO',permissoes:[],versao:0})).status===404);
  verificar((await api(tokenSegundo,`/api/v1/equipe/usuarios/${primeiro.vinculo.id}/inativar`,'POST',{versao:0})).status===404);
  verificar((await api(tokenSegundo,`/api/v1/equipe/usuarios/${vinculo.corpo.id}/inativar`,'POST',{versao:0,escritorioId:idPrimeiro})).status===400);
  const outraSessao=JSON.parse(Buffer.from(segundo.token.split('.')[1],'base64url')).sessionId;
  verificar((await api(tokenSegundo,`/api/v1/auth/sessoes/${outraSessao}`,'DELETE')).status===404);relatar();
  etapa = 'sessao_remota_encerrada_pelo_frontend';
  const remota=await novaAba(await novoContexto());await loginComSelecao(remota,primeiro);const tokenRemoto=await escolher(remota,idPrimeiro);
  const idRemoto=JSON.parse(Buffer.from(tokenRemoto.split('.')[1],'base64url')).sessionId;
  await avaliar(aba,"history.pushState({},'', '/seguranca/sessoes');window.dispatchEvent(new PopStateEvent('popstate'));");
  await esperar(()=>avaliar(aba,`!!document.querySelector('[data-sessao="${idRemoto}"]')`));
  await clicar(aba,`[data-sessao="${idRemoto}"] button`);await clicarTexto(aba,'Confirmar','[role=alertdialog]');
  await esperar(async()=>!!(await prisma.session.findUniqueOrThrow({where:{id:idRemoto}})).revokedAt);
  verificar((await api(tokenRemoto,'/api/v1/auth/me')).status===401);
  verificar((await api(tokenSegundo,`/api/v1/auth/sessoes/${idRemoto}`,'DELETE')).status===204);
  const sessoes=await api(tokenSegundo,'/api/v1/auth/sessoes');verificar(sessoes.status===200&&sessoes.corpo.some(s=>s.atual)&&sessoes.corpo.some(s=>s.escritorio.id===idPrimeiro));
  verificar(!/password|hash|token/i.test(JSON.stringify(sessoes.corpo)));relatar();
  etapa='encerrar_outras_preserva_atual';
  await esperar(()=>avaliar(aba,'!document.querySelector("[role=alertdialog]")'));
  await clicarTexto(aba,'Encerrar todas as outras');await clicarTexto(aba,'Confirmar','[role=alertdialog]');
  await esperar(async()=>await prisma.session.count({where:{userId:primeiro.usuario.id,revokedAt:null}})===1);
  verificar((await api(tokenSegundo,'/api/v1/auth/me')).status===200);relatar();
  etapa='inativacao_isolada_e_logout_das_abas';
  verificar((await api(segundo.token,`/api/v1/equipe/usuarios/${vinculo.corpo.id}/inativar`,'POST',{versao:0})).status===200);
  verificar((await api(tokenSegundo,'/api/v1/auth/me')).status===401);
  // Foco deve consultar imediatamente, sem aguardar os trinta segundos.
  await avaliar(abas[2],"window.dispatchEvent(new Event('focus'))");
  for(const outra of abas)await esperar(()=>avaliar(outra,"location.pathname==='/login'"));
  const loginUnico=await api('','/api/v1/auth/login','POST',{email:primeiro.email,senha:primeiro.senha});verificar(loginUnico.status===200&&loginUnico.corpo.escritorio.id===idPrimeiro);
  verificar((await api(segundo.token,`/api/v1/equipe/usuarios/${vinculo.corpo.id}/ativar`,'POST',{versao:1})).status===200);relatar();
  etapa='selecao_expirada_consumida_concorrente_e_novo_login';
  const expiravel=await novaSelecao(primeiro);
  const hashExpiravel=(await import('../../dist/infrastructure/security/crypto-office-selection.js')).TokensSelecaoCriptograficos;
  const gerador=new hashExpiravel();
  await prisma.officeSelection.update({where:{tokenHash:gerador.calcularHash(expiravel)},data:{createdAt:new Date(Date.now()-600000),expiresAt:new Date(Date.now()-300000)}});
  verificar((await api(expiravel,'/api/v1/auth/selecionar-escritorio','POST',{idEscritorio:idPrimeiro},true)).status===410);
  const antigo=await novaSelecao(primeiro),concorrente=await novaSelecao(primeiro);
  verificar((await api(antigo,'/api/v1/auth/selecionar-escritorio','POST',{idEscritorio:idPrimeiro},true)).status===410);
  const disputas=await Promise.all([idPrimeiro,idSegundo].map(id=>api(concorrente,'/api/v1/auth/selecionar-escritorio','POST',{idEscritorio:id},true)));
  verificar(disputas.filter(r=>r.status===200).length===1&&disputas.filter(r=>r.status===410).length===1);
  const cancelavel=await novaSelecao(primeiro);verificar((await api(cancelavel,'/api/v1/auth/logout','POST',undefined,true)).status===204);
  verificar((await api(cancelavel,'/api/v1/auth/selecionar-escritorio','POST',{idEscritorio:idPrimeiro},true)).status===410);relatar();
  etapa='segredos_favicon_e_dados_anteriores';
  verificar(!SEGREDOS.some(s=>LOGS.join('').includes(s)));verificar((await fetch(`${urlFrontend}/favicon.svg`)).status===200);
  verificar(CONEXOES.every(c=>!c.eventos.some(e=>e.method==='Runtime.exceptionThrown')));
  for(const outra of abas)verificar(await avaliar(outra,'localStorage.length+sessionStorage.length===0'));relatar();
} catch (erro) {
  process.exitCode = 1;
  console.error(JSON.stringify({ etapa, ok: false, local: erro instanceof Error ? erro.stack?.split('\n').filter((linha) => linha.includes('session-management.check.mjs:')).map((linha) => linha.trim()) : undefined }));
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
        for (const modelo of ['recoveryEmailJob', 'passwordRecovery', 'officeSelection', 'session', 'membership']) await transacao[modelo].deleteMany({ where: { userId: { in: ids } } });
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
