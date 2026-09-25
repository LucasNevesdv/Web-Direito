// Opt-in verification: two real Node processes and the configured PostgreSQL.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { carregarAmbiente } from '../../dist/environment.js';
import { criarClientePrisma } from '../../dist/database.js';
import { ChavesLimiteRequisicoesHmac } from '../../dist/infrastructure/security/hmac-rate-limit-keys.js';
import { ArmazenamentoLimiteRequisicoesPrisma } from '../../dist/infrastructure/prisma/prisma-rate-limit-store.js';

const FILHOS = [], LOGS = [], HASHES = new Set();
const SEGREDO = randomBytes(48).toString('base64url'), CHAVES = new ChavesLimiteRequisicoesHmac(SEGREDO);
const EMAIL = `rate-verification-${randomUUID()}@example.invalid`;
let prisma, segundoPrisma, etapa = 'startup';
function relatarEtapaDaVerificacao(valores = {}) { console.log(JSON.stringify({ etapa, ok: true, ...valores })); }
function relatarFalha() { console.error(JSON.stringify({ etapa, ok: false })); process.exitCode = 1; }
function gerarHashERegistrarParaLimpeza(escopo, endereco = '127.0.0.1', valor = EMAIL) { const hash = CHAVES.gerarHashDaChave(escopo, endereco, valor); HASHES.add(hash); return hash; }
async function obterPortaDisponivel() {
  const servidor = createServer();
  await new Promise((resolver, rejeitar) => { servidor.once('error', rejeitar); servidor.listen(0, '127.0.0.1', resolver); });
  const porta = servidor.address().port; await new Promise((resolver) => servidor.close(resolver)); return porta;
}
async function iniciarBackendDeVerificacao(porta) {
  const inicializacao = "process.on('message',message=>{if(message==='stop'){process.emit('SIGTERM');process.disconnect();}});await import('./dist/server.js');process.send(process.exitCode===1?'failed':'ready');";
  const filho = spawn(process.execPath, ['--input-type=module', '-e', inicializacao], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(porta), TRUST_PROXY: '', RATE_LIMIT_HMAC_SECRET: SEGREDO,
      AUTH_FRONTEND_ORIGIN: 'http://localhost:5173', RATE_LIMIT_ONBOARDING_MAX: '3', RATE_LIMIT_ONBOARDING_WINDOW_SECONDS: '86400',
      RATE_LIMIT_LOGIN_IP_MAX: '4', RATE_LIMIT_LOGIN_IDENTITY_MAX: '2', RATE_LIMIT_LOGIN_WINDOW_SECONDS: '86400',
      RATE_LIMIT_REFRESH_MAX: '3', RATE_LIMIT_REFRESH_WINDOW_SECONDS: '86400', RATE_LIMIT_CLEANUP_INTERVAL_MS: '3600000' },
  });
  FILHOS.push(filho);
  filho.stdout.on('data', (trecho) => LOGS.push(String(trecho))); filho.stderr.on('data', (trecho) => LOGS.push(String(trecho)));
  await new Promise((resolver, rejeitar) => {
    const temporizador = setTimeout(() => rejeitar(new Error('Startup deadline')), 15000);
    filho.once('message', (mensagem) => { clearTimeout(temporizador); mensagem === 'ready' ? resolver() : rejeitar(new Error('Startup failed')); });
    filho.once('exit', () => { clearTimeout(temporizador); rejeitar(new Error('Backend exited')); });
  });
  const enderecoBase = `http://127.0.0.1:${porta}`;
  assert.equal((await fetch(`${enderecoBase}/health`)).status, 200); assert.equal((await fetch(`${enderecoBase}/ready`)).status, 200);
  return enderecoBase;
}
async function enviarRequisicaoDeTeste(enderecoBase, caminho, conteudo) {
  const resposta = await fetch(`${enderecoBase}/api/v1/${caminho}`, { method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { origin: 'http://localhost:5173', 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${Math.floor(Math.random() * 200 + 1)}` },
    body: JSON.stringify(conteudo ?? {}) });
  if (resposta.status === 429) { assert.ok(Number(resposta.headers.get('retry-after')) >= 1); assert.ok(Number(resposta.headers.get('retry-after')) <= 86400); }
  const corpo = await resposta.text(); assert.equal(corpo.includes(EMAIL), false);
  return resposta.status;
}

try {
  const ambiente = carregarAmbiente();
  prisma = criarClientePrisma(ambiente.DATABASE_URL); segundoPrisma = criarClientePrisma(ambiente.DATABASE_URL);
  await prisma.$queryRaw`SELECT 1`;
  for (const escopo of ['onboarding-ip', 'login-ip', 'login-identity', 'refresh-ip']) gerarHashERegistrarParaLimpeza(escopo);
  gerarHashERegistrarParaLimpeza('login-identity', '127.0.0.1', `other-${EMAIL}`);
  gerarHashERegistrarParaLimpeza('login-identity', '127.0.0.1', `third-${EMAIL}`);
  assert.equal(await prisma.rateLimitBucket.count({ where: { keyHash: { in: [...HASHES] } } }), 0);
  const enderecosBase = [await iniciarBackendDeVerificacao(await obterPortaDisponivel()), await iniciarBackendDeVerificacao(await obterPortaDisponivel())];
  assert.notEqual(FILHOS[0].pid, FILHOS[1].pid);
  etapa = 'two_process_onboarding_refresh';
  for (const [caminho, situacaoPermitida] of [['onboarding', 400], ['auth/refresh', 401]]) {
    const situacoes = [];
    for (let indice = 0; indice < 5; ++indice) situacoes.push(await enviarRequisicaoDeTeste(enderecosBase[indice % 2], caminho));
    assert.deepEqual(situacoes, [situacaoPermitida, situacaoPermitida, situacaoPermitida, 429, 429]);
  }
  relatarEtapaDaVerificacao({ processos: 2, limiteCompartilhado: 3, cadastroInicial: [400, 400, 400, 429, 429], renovar: [401, 401, 401, 429, 429], tentarApos: true, encaminhamentoFalsoIgnorado: true });

  etapa = 'two_process_login';
  const tentativas = [EMAIL, ` ${EMAIL.toUpperCase()} `, EMAIL, `other-${EMAIL}`, `third-${EMAIL}`];
  const situacoes = [];
  for (const [indice, valor] of tentativas.entries()) situacoes.push(await enviarRequisicaoDeTeste(enderecosBase[indice % 2], 'auth/login', { email: valor, senha: 'temporary-wrong-password' }));
  assert.deepEqual(situacoes, [401, 401, 429, 401, 429]);
  relatarEtapaDaVerificacao({ situacoes, limiteIdentidadeNormalizada: 2, limiteIp: 4, tentarApos: true });

  etapa = 'real_atomic_concurrency';
  const armazenamentos = [new ArmazenamentoLimiteRequisicoesPrisma(prisma), new ArmazenamentoLimiteRequisicoesPrisma(segundoPrisma)];
  const chave = gerarHashERegistrarParaLimpeza('refresh-ip', '192.0.2.200');
  const resultados = await Promise.all(Array.from({ length: 40 }, (_, indice) => armazenamentos[indice % 2].incrementarContadorDaJanela('refresh-ip', chave, { limite: 7, janelaSegundos: 86400 })));
  assert.equal(resultados.filter((resultado) => resultado.podeProsseguir).length, 7);
  assert.equal((await prisma.rateLimitBucket.findFirstOrThrow({ where: { keyHash: chave } })).count, 8);
  relatarEtapaDaVerificacao({ clientesIndependentes: 2, tentativasConcorrentes: 40, aceitos: 7, bloqueados: 33, contadorLimitado: true });

  etapa = 'real_next_window';
  const chaveJanela = gerarHashERegistrarParaLimpeza('refresh-ip', '192.0.2.201');
  // Start near the beginning of a database-clock second to avoid crossing the boundary between the first two calls.
  let fracao;
  do { [{ fracao }] = await prisma.$queryRaw`SELECT (extract(epoch FROM clock_timestamp()) % 1)::float AS fracao`; if (fracao > 0.25) await delay(20); } while (fracao > 0.25);
  assert.equal((await armazenamentos[0].incrementarContadorDaJanela('refresh-ip', chaveJanela, { limite: 1, janelaSegundos: 1 })).podeProsseguir, true);
  assert.equal((await armazenamentos[1].incrementarContadorDaJanela('refresh-ip', chaveJanela, { limite: 1, janelaSegundos: 1 })).podeProsseguir, false);
  await delay(1100);
  assert.equal((await armazenamentos[1].incrementarContadorDaJanela('refresh-ip', chaveJanela, { limite: 1, janelaSegundos: 1 })).podeProsseguir, true);
  relatarEtapaDaVerificacao({ proximaJanelaPermitida: true });

  etapa = 'real_cleanup_sql';
  // A session-local table exercises the exact cleanup SQL without deleting any existing application's buckets.
  await prisma.$transaction(async (transacao) => {
    await transacao.$executeRaw`CREATE TEMP TABLE rate_limit_buckets (LIKE public.rate_limit_buckets INCLUDING ALL) ON COMMIT DROP`;
    await transacao.$executeRaw`INSERT INTO rate_limit_buckets(scope,key_hash,window_start,count,expires_at) VALUES
      ('refresh-ip', ${chaveJanela}, now() - interval '2 minutes', 1, now() - interval '1 minute'),
      ('refresh-ip', ${chaveJanela}, now(), 1, now() + interval '1 minute')`;
    assert.equal(await new ArmazenamentoLimiteRequisicoesPrisma(transacao).removerLimitesExpirados(), 1);
    const [{ restantes }] = await transacao.$queryRaw`SELECT count(*)::int AS restantes FROM rate_limit_buckets`;
    assert.equal(restantes, 1);
  });
  relatarEtapaDaVerificacao({ expiradosRemovidos: 1, vigentePreservado: 1, contadoresExistentesPreservados: true });

  etapa = 'database_key_privacy';
  const linhas = await prisma.rateLimitBucket.findMany({ where: { keyHash: { in: [...HASHES] } } });
  assert.ok(linhas.length >= 5);
  assert.ok(linhas.every((linha) => /^[a-f0-9]{64}$/.test(linha.keyHash)));
  assert.equal(JSON.stringify(linhas).includes(EMAIL), false); assert.equal(JSON.stringify(linhas).includes('127.0.0.1'), false);
  assert.equal(LOGS.join('').includes(EMAIL), false); assert.equal(LOGS.join('').includes(SEGREDO), false);
  const colunas = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='rate_limit_buckets' ORDER BY column_name`;
  assert.deepEqual(colunas.map((linha) => linha.column_name), ['count', 'expires_at', 'key_hash', 'scope', 'window_start']);
  relatarEtapaDaVerificacao({ camposPersistidos: 5, somenteChavesHmac: true, dadosPessoaisLegiveis: false });
} catch { relatarFalha(); }
finally {
  // Stop only children started by this verification, before deleting their isolated buckets.
  etapa = 'process_cleanup';
  for (const filho of FILHOS) if (filho.exitCode === null) {
    try {
      filho.send('stop');
      const prazo = Date.now() + 10000;
      while (filho.exitCode === null && Date.now() < prazo) await delay(50);
      assert.equal(filho.exitCode, 0);
    } catch { filho.kill(); relatarFalha(); }
  }
  relatarEtapaDaVerificacao({ processosIniciados: FILHOS.length, encerrado: FILHOS.every((filho) => filho.exitCode !== null) });
  etapa = 'temporary_bucket_cleanup';
  if (prisma) {
    try {
      const removidos = await prisma.rateLimitBucket.deleteMany({ where: { keyHash: { in: [...HASHES] } } });
      const restantes = await prisma.rateLimitBucket.count({ where: { keyHash: { in: [...HASHES] } } });
      assert.equal(restantes, 0); relatarEtapaDaVerificacao({ removidos: removidos.count, restantes });
    } catch { relatarFalha(); }
  }
  await Promise.all([prisma, segundoPrisma].filter(Boolean).map(async (cliente) => { try { await cliente.$disconnect(); } catch { relatarFalha(); } }));
}
