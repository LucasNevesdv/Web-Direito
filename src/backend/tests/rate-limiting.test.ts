import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarAplicacao } from '../src/app.js';
import { LimitadorRequisicoesCompartilhado } from '../src/application/security/rate-limiter.js';
import { ChavesLimiteRequisicoesHmac } from '../src/infrastructure/security/hmac-rate-limit-keys.js';
import { iniciarLimpezaLimites } from '../src/infrastructure/security/rate-limit-cleanup.js';
import { validarAmbiente } from '../src/environment.js';
import { criarEncerramento } from '../src/shutdown.js';
import { criarCenarioAutenticacao } from './support/authentication-fixture.js';
import { criarCenarioLimitador } from './support/rate-limiter-fixture.js';

const APLICACOES: ReturnType<typeof criarAplicacao>[] = [];
afterEach(async () => { await Promise.all(APLICACOES.splice(0).map((aplicacao) => aplicacao.close())); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("limitação compartilhada de requisições", () => {
  it("consome janela fixa, bloqueia com segundos restantes e libera a próxima janela", async () => {
    let agora = 1100;
    const cenario = criarCenarioLimitador({ 'onboarding-ip': { limite: 2, janelaSegundos: 10 } }, () => agora);
    expect(await cenario.limitador.registrarTentativaDeRequisicao('onboarding-ip', '127.0.0.1')).toEqual({ podeProsseguir: true, tentarAposSegundos: 9 });
    expect((await cenario.limitador.registrarTentativaDeRequisicao('onboarding-ip', '127.0.0.1')).podeProsseguir).toBe(true);
    expect((await cenario.limitador.registrarTentativaDeRequisicao('onboarding-ip', '127.0.0.1')).podeProsseguir).toBe(false);
    agora = 10000;
    expect(await cenario.limitador.registrarTentativaDeRequisicao('onboarding-ip', '127.0.0.1')).toEqual({ podeProsseguir: true, tentarAposSegundos: 10 });
    expect(await cenario.armazenamento.removerLimitesExpirados()).toBe(1);
  });

  it("compartilha o armazenamento entre instâncias concorrentes do limitador", async () => {
    const cenario = criarCenarioLimitador({ 'refresh-ip': { limite: 7 } });
    const outro = new LimitadorRequisicoesCompartilhado(cenario.armazenamento, cenario.chaves, cenario.politicas);
    const resultados = await Promise.all(Array.from({ length: 30 }, (_, indice) => (indice % 2 ? cenario.limitador : outro).registrarTentativaDeRequisicao('refresh-ip', '127.0.0.1')));
    expect(resultados.filter((resultado) => resultado.podeProsseguir)).toHaveLength(7);
  });

  it("normaliza e-mail e IPs equivalentes, separa escopos e armazena somente hashes com chave", () => {
    const cenario = criarCenarioLimitador(), diferente = new ChavesLimiteRequisicoesHmac(Buffer.alloc(48, 9).toString('base64url'));
    const chave = cenario.chaves.gerarHashDaChave('login-identity', '127.0.0.1', 'Owner@Example.Test');
    expect(chave).toMatch(/^[a-f0-9]{64}$/);
    expect(cenario.chaves.gerarHashDaChave('login-identity', '::ffff:127.0.0.1', ' owner@example.test ')).toBe(chave);
    expect(cenario.chaves.gerarHashDaChave('login-identity', '2001:0db8::1', 'owner@example.test')).toBe(cenario.chaves.gerarHashDaChave('login-identity', '2001:db8:0:0:0:0:0:1', 'owner@example.test'));
    expect(cenario.chaves.gerarHashDaChave('login-ip', '127.0.0.1', 'owner@example.test')).not.toBe(chave);
    expect(diferente.gerarHashDaChave('login-identity', '127.0.0.1', 'owner@example.test')).not.toBe(chave);
    expect(() => cenario.chaves.gerarHashDaChave('login-ip', 'spoofed')).toThrow();
  });

  it("aplica 429 no cadastro e ignora IPs encaminhados sem confiança, mantendo /health independente", async () => {
    const cadastrarEscritorioSimulado = vi.fn();
    const aplicacao = criarAplicacao({ verificarConexaoComBanco: async () => {} }, { cadastrarEscritorioComProprietario: cadastrarEscritorioSimulado }, undefined,
      { limitador: criarCenarioLimitador({ 'onboarding-ip': { limite: 1, janelaSegundos: 60 } }).limitador });
    APLICACOES.push(aplicacao);
    expect((await aplicacao.inject({ method: 'POST', url: '/api/v1/onboarding', payload: {} })).statusCode).toBe(400);
    const bloqueados = await aplicacao.inject({ method: 'POST', url: '/api/v1/onboarding', headers: { 'x-forwarded-for': '192.0.2.1' }, payload: {} });
    expect(bloqueados.statusCode).toBe(429); expect(Number(bloqueados.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(bloqueados.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(cadastrarEscritorioSimulado).not.toHaveBeenCalled();
    expect((await aplicacao.inject('/health')).statusCode).toBe(200);
    expect((await aplicacao.inject('/ready')).statusCode).toBe(200);
  });

  it("aplica limites independentes de login por IP e identidade normalizada e de renovação por IP", async () => {
    const cenario = await criarCenarioAutenticacao();
    const aplicacao = criarAplicacao({ verificarConexaoComBanco: async () => {} }, undefined, {
      autenticacao: cenario.autenticacaoUsuario, consultaIdentidade: cenario.consultaIdentidade, renovacao: cenario.renovacaoSessao, encerramento: cenario.encerramentoSessao,
      deveUsarCookieSeguro: false, origemFrontend: 'http://localhost:5173', validadeRenovacaoSegundos: 604800,
    }, { limitador: criarCenarioLimitador({ 'login-ip': { limite: 3 }, 'login-identity': { limite: 1 }, 'refresh-ip': { limite: 1 } }).limitador });
    APLICACOES.push(aplicacao);
    const enviarSolicitacaoDeLogin = (email: string) => aplicacao.inject({ method: 'POST', url: '/api/v1/auth/login',
      headers: { origin: 'http://localhost:5173' }, payload: { email, senha: 'incorrect-test-password' } });
    expect((await enviarSolicitacaoDeLogin('unknown@example.test')).statusCode).toBe(401);
    expect((await enviarSolicitacaoDeLogin(' UNKNOWN@example.test ')).statusCode).toBe(429);
    expect((await enviarSolicitacaoDeLogin('another@example.test')).statusCode).toBe(401);
    expect((await enviarSolicitacaoDeLogin('third@example.test')).statusCode).toBe(429);
    const enviarSolicitacaoDeRenovacao = () => aplicacao.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { origin: 'http://localhost:5173' } });
    expect((await enviarSolicitacaoDeRenovacao()).statusCode).toBe(401); expect((await enviarSolicitacaoDeRenovacao()).statusCode).toBe(429);
  });

  it("bloqueia com 503 sanitizado e Retry-After quando o armazenamento está indisponível ou ausente", async () => {
    for (const seguranca of [undefined, { limitador: { registrarTentativaDeRequisicao: vi.fn().mockRejectedValue(new Error('private database details')) } }]) {
      const cadastrarEscritorioSimulado = vi.fn();
      const aplicacao = criarAplicacao({ verificarConexaoComBanco: async () => {} }, { cadastrarEscritorioComProprietario: cadastrarEscritorioSimulado }, undefined, seguranca); APLICACOES.push(aplicacao);
      const resultado = await aplicacao.inject({ method: 'POST', url: '/api/v1/onboarding', payload: {} });
      expect(resultado.statusCode).toBe(503); expect(resultado.headers['retry-after']).toBe('5');
      expect(resultado.body).not.toContain('private'); expect(cadastrarEscritorioSimulado).not.toHaveBeenCalled();
    }
  });

  it("não sobrepõe limpezas, trata falhas e aguarda a execução atual ao encerrar", async () => {
    vi.useFakeTimers();
    let concluir!: (quantidade: number) => void;
    const removerExpirados = vi.fn<() => Promise<number>>().mockReturnValueOnce(new Promise((resolver) => { concluir = resolver; })).mockRejectedValue(new Error('private'));
    const relatar = vi.fn(), trabalhador = iniciarLimpezaLimites({ removerLimitesExpirados: removerExpirados }, 1000, relatar);
    await vi.advanceTimersByTimeAsync(3000); expect(removerExpirados).toHaveBeenCalledOnce();
    concluir(1); await vi.advanceTimersByTimeAsync(1000); expect(relatar).toHaveBeenCalledOnce();
    await trabalhador.parar(); await vi.advanceTimersByTimeAsync(5000); expect(removerExpirados).toHaveBeenCalledTimes(2);
  });

  it("interrompe a limpeza periódica antes dos recursos, mesmo com falha, uma vez por encerramento", async () => {
    const chamadas: string[] = [];
    const encerrar = criarEncerramento({ close: async () => { chamadas.push('close'); } },
      { $disconnect: async () => { chamadas.push('disconnect'); } },
      { parar: async () => { chamadas.push('stop'); throw new Error('Stop failed'); } });
    const primeiro = encerrar(); expect(encerrar()).toBe(primeiro);
    await expect(primeiro).rejects.toThrow('Stop failed'); expect(chamadas).toEqual(['stop', 'close', 'disconnect']);
  });
});

describe("configuração do limite de requisições", () => {
  const ambiente = { DATABASE_URL: 'postgresql://localhost/example', AUTH_JWT_SECRET: Buffer.alloc(48, 9).toString('base64url') };
  it.each([
    ['RATE_LIMIT_ONBOARDING_MAX', '0'], ['RATE_LIMIT_LOGIN_IP_MAX', '-1'], ['RATE_LIMIT_LOGIN_IDENTITY_MAX', '1.5'],
    ['RATE_LIMIT_LOGIN_WINDOW_SECONDS', 'NaN'], ['RATE_LIMIT_REFRESH_MAX', '10001'], ['RATE_LIMIT_REFRESH_WINDOW_SECONDS', '86401'],
    ['RATE_LIMIT_ONBOARDING_WINDOW_SECONDS', '0'], ['RATE_LIMIT_CLEANUP_INTERVAL_MS', '999'], ['RATE_LIMIT_HMAC_SECRET', 'short'],
    ['TRUST_PROXY', 'true'], ['TRUST_PROXY', '*'], ['TRUST_PROXY', '0.0.0.0/0'], ['TRUST_PROXY', '::/0'], ['TRUST_PROXY', '127.0.0.1,'],
  ])("rejeita %s inválido (caso %#) sem expor valores", (variavel, valor) => {
    expect(() => validarAmbiente({ ...ambiente, [variavel]: valor })).toThrow(`Invalid environment configuration: ${variavel}`);
  });
  it("não confia em proxy por padrão e aceita somente IPs e CIDRs explícitos", () => {
    expect(validarAmbiente(ambiente).TRUST_PROXY).toBe(false);
    expect(validarAmbiente({ ...ambiente, TRUST_PROXY: '127.0.0.1, 192.0.2.0/24, ::1' }).TRUST_PROXY).toEqual(['127.0.0.1', '192.0.2.0/24', '::1']);
    expect(validarAmbiente({ ...ambiente, NODE_ENV: 'production', AUTH_FRONTEND_ORIGIN: 'https://app.example.test', URL_FRONTEND: 'https://app.example.test', EMAIL_REMETENTE: 'Web Direito <contato@example.test>' }).RATE_LIMIT_LOGIN_IP_MAX).toBe(10);
  });
});
