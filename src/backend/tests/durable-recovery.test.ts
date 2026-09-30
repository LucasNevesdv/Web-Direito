import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarCenarioSenhas } from './support/password-fixture.js';
import { ErroEnvioEmail } from '../src/application/passwords/recovery-email-jobs.js';
import { EnvioRecuperacaoDeSenha } from '../src/application/passwords/deliver-password-recovery.js';
import { ProcessamentoRecuperacaoDeSenha } from '../src/infrastructure/security/password-recovery-worker.js';
import { EnvioEmailResend } from '../src/infrastructure/email/resend-email.js';
import { criarAplicacao } from '../src/app.js';
import { criarCenarioLimitador } from './support/rate-limiter-fixture.js';
import type { ServicosRotasAutenticacao } from '../src/presentation/authentication-routes.js';
import { validarAmbiente } from '../src/environment.js';
import { createServer, type Socket } from 'node:net';
import { EnvioEmailSmtp } from '../src/infrastructure/email/smtp-email.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('recuperação durável', () => {
  it('não responde 202 antes do commit da solicitação', async () => {
    const c = criarCenarioSenhas(); let confirmar!: () => void;
    vi.mocked(c.repositorioTrabalhos.registrarSolicitacao).mockImplementation(async () => new Promise<void>((resolver) => { confirmar = resolver; }));
    const app = criarAplicacao({ verificarConexaoComBanco: async () => {} }, undefined,
      { origemFrontend: 'http://localhost:5173' } as ServicosRotasAutenticacao, { limitador: criarCenarioLimitador().limitador }, c);
    let respondeu = false;
    try {
      const resposta = app.inject({ method: 'POST', url: '/api/v1/auth/recuperar-senha', headers: { origin: 'http://localhost:5173' }, payload: { email: c.usuario.email } }).then((r) => { respondeu = true; return r; });
      await vi.waitFor(() => expect(confirmar).toBeTypeOf('function')); expect(respondeu).toBe(false);
      confirmar(); expect((await resposta).statusCode).toBe(202); expect(c.envioEmail.enviarEmail).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it('falha de persistência produz 503 seguro em vez de confirmação falsa', async () => {
    const c = criarCenarioSenhas(); vi.mocked(c.repositorioTrabalhos.registrarSolicitacao).mockRejectedValue(new Error('credencial privada'));
    const app = criarAplicacao({ verificarConexaoComBanco: async () => {} }, undefined,
      { origemFrontend: 'http://localhost:5173' } as ServicosRotasAutenticacao, { limitador: criarCenarioLimitador().limitador }, c);
    try {
      const resposta = await app.inject({ method: 'POST', url: '/api/v1/auth/recuperar-senha', headers: { origin: 'http://localhost:5173' }, payload: { email: c.usuario.email } });
      expect(resposta.statusCode).toBe(503); expect(resposta.body).not.toContain('credencial privada');
    } finally { await app.close(); }
  });
  it('novo processador recupera trabalho registrado sem token ou mensagem na fila', async () => {
    const c = criarCenarioSenhas(); await c.solicitacao.solicitarRecuperacao(c.usuario.email);
    expect(c.trabalhos.size).toBe(1); expect(c.recuperacoes.size).toBe(0); expect(c.mensagens).toHaveLength(0);
    const outro = new EnvioRecuperacaoDeSenha(c.repositorioTrabalhos, c.tokens, c.envioEmail, 'https://app.example.test',
      { maximoTentativas: 5, atrasoInicialSegundos: 30, atrasoMaximoSegundos: 3600 }, () => {});
    await outro.enviarRecuperacao((await c.repositorioTrabalhos.reservarTrabalho(60))!, new AbortController().signal);
    expect(c.mensagens).toHaveLength(1); expect(JSON.stringify([...c.trabalhos.values()])).not.toContain(c.obterToken());
  });
  it('reserva concorrente produz somente um envio', async () => {
    const c = criarCenarioSenhas(); await c.solicitacao.solicitarRecuperacao(c.usuario.email);
    const reservas = await Promise.all([c.repositorioTrabalhos.reservarTrabalho(60), c.repositorioTrabalhos.reservarTrabalho(60)]);
    expect(reservas.filter(Boolean)).toHaveLength(1);
    await c.envio.enviarRecuperacao(reservas.find(Boolean)!, new AbortController().signal); expect(c.envioEmail.enviarEmail).toHaveBeenCalledOnce();
  });
  it('expiração permite retomada e rejeita resultado da reserva antiga', async () => {
    let agora = Date.now(); const c = criarCenarioSenhas(() => agora); await c.solicitacao.solicitarRecuperacao(c.usuario.email);
    const primeira = (await c.repositorioTrabalhos.reservarTrabalho(60))!;
    const anterior = c.tokens.gerarToken(); await c.repositorioTrabalhos.prepararTentativa(primeira, anterior.hash);
    expect(await c.repositorioTrabalhos.reservarTrabalho(60)).toBeNull(); agora += 61000;
    const segunda = (await c.repositorioTrabalhos.reservarTrabalho(60))!; expect(segunda.idReserva).not.toBe(primeira.idReserva);
    await c.envio.enviarRecuperacao(segunda, new AbortController().signal);
    expect(await c.repositorioTrabalhos.concluirEnvio(primeira)).toBe(false);
    expect(await c.repositorioTrabalhos.registrarFalha(primeira, 'PROVEDOR_DEFINITIVO', true, 0)).toBe(false);
    expect(await c.repositorio.buscarRecuperacaoPorHash(anterior.hash)).toBeNull(); expect(c.obterToken()).not.toBe(anterior.token);
  });
  it('falha transitória invalida token e espera backoff antes de emitir novo token', async () => {
    let agora = Date.now(); const c = criarCenarioSenhas(() => agora); await c.solicitacao.solicitarRecuperacao(c.usuario.email);
    c.envioEmail.enviarEmail.mockRejectedValueOnce(new ErroEnvioEmail());
    await c.executarTarefas(); const anterior = [...c.recuperacoes.values()][0]; expect(anterior.estaUtilizavel(new Date(agora))).toBe(false);
    expect(await c.repositorioTrabalhos.reservarTrabalho(60)).toBeNull(); agora += 29999;
    expect(await c.repositorioTrabalhos.reservarTrabalho(60)).toBeNull(); agora++;
    await c.executarTarefas(); expect(c.mensagens).toHaveLength(1); expect([...c.trabalhos.values()][0].tentativas).toBe(2);
    expect([...c.recuperacoes.values()][0].obterEstadoDaRecuperacao().hashToken).not.toBe(anterior.obterEstadoDaRecuperacao().hashToken);
  });
  it('esgota cinco tentativas e deixa token inválido', async () => {
    let agora = Date.now(); const c = criarCenarioSenhas(() => agora); await c.solicitacao.solicitarRecuperacao(c.usuario.email);
    c.envioEmail.enviarEmail.mockRejectedValue(new ErroEnvioEmail());
    for (let indice = 0; indice < 5; indice++) { await c.executarTarefas(); agora += 4000000; }
    expect(c.envioEmail.enviarEmail).toHaveBeenCalledTimes(5);
    expect([...c.trabalhos.values()][0].situacao).toBe('FALHA_DEFINITIVA'); expect(await c.repositorioTrabalhos.reservarTrabalho(60)).toBeNull();
    expect([...c.recuperacoes.values()][0].estaUtilizavel(new Date(agora))).toBe(false);
  });
  it('não repete falha definitiva do provedor', async () => {
    const c = criarCenarioSenhas(); await c.solicitacao.solicitarRecuperacao(c.usuario.email);
    c.envioEmail.enviarEmail.mockRejectedValue(new ErroEnvioEmail(true)); await c.executarTarefas();
    expect([...c.trabalhos.values()][0].situacao).toBe('FALHA_DEFINITIVA'); expect(await c.repositorioTrabalhos.reservarTrabalho(60)).toBeNull();
  });
  it('limita atraso exponencial e não envia após esgotamento de reserva abandonada', async () => {
    const c = criarCenarioSenhas(); await c.solicitacao.solicitarRecuperacao(c.usuario.email);
    const reserva = (await c.repositorioTrabalhos.reservarTrabalho(60))!;
    const outro = new EnvioRecuperacaoDeSenha(c.repositorioTrabalhos, c.tokens, c.envioEmail, 'https://app.example.test',
      { maximoTentativas: 5, atrasoInicialSegundos: 30, atrasoMaximoSegundos: 40 }, () => {});
    c.envioEmail.enviarEmail.mockRejectedValue(new ErroEnvioEmail());
    await outro.enviarRecuperacao({ ...reserva, tentativas: 3 }, new AbortController().signal);
    expect(c.repositorioTrabalhos.registrarFalha).toHaveBeenCalledWith(expect.anything(), 'PROVEDOR_TRANSITORIO', false, 40);
    vi.mocked(c.envioEmail.enviarEmail).mockClear(); await outro.enviarRecuperacao({ ...reserva, tentativas: 6 }, new AbortController().signal);
    expect(c.envioEmail.enviarEmail).not.toHaveBeenCalled();
  });
  it('recuperação consumida cancela reenvio e não troca o hash', async () => {
    const c = criarCenarioSenhas(); await c.solicitacao.solicitarRecuperacao(c.usuario.email); await c.executarTarefas();
    const hash = [...c.recuperacoes.values()][0].obterEstadoDaRecuperacao().hashToken;
    await c.redefinicao.redefinirSenha({ token: c.obterToken(), novaSenha: 'nova senha muito segura', confirmacaoNovaSenha: 'nova senha muito segura' });
    const trabalho = [...c.trabalhos.values()][0]; trabalho.situacao = 'PENDENTE';
    await c.executarTarefas(); expect(c.mensagens).toHaveLength(1); expect([...c.recuperacoes.values()][0].obterEstadoDaRecuperacao().hashToken).toBe(hash);
  });
  it('parar compartilha Promise e impede novas reservas', async () => {
    const c = criarCenarioSenhas(), evento = vi.fn();
    const processamento = new ProcessamentoRecuperacaoDeSenha(c.repositorioTrabalhos, c.envio, c.repositorio,
      { intervaloMs: 1000, reservaSegundos: 60, prazoEncerramentoMs: 1000, retencaoDias: 7 }, evento);
    const encerramento = processamento.parar(); expect(processamento.parar()).toBe(encerramento); await encerramento;
    await processamento.processarDisponivel(); expect(c.repositorioTrabalhos.reservarTrabalho).not.toHaveBeenCalled();
  });
  it('shutdown tem limite e cancela envio em andamento sem expor erro', async () => {
    const c = criarCenarioSenhas(); await c.solicitacao.solicitarRecuperacao(c.usuario.email); const evento = vi.fn();
    let sinal!: AbortSignal;
    const envio = { enviarRecuperacao: vi.fn(async (_reserva, sinalRecebido: AbortSignal) => {
      sinal = sinalRecebido; await new Promise<void>((resolver) => sinal.addEventListener('abort', () => resolver(), { once: true }));
    }) };
    const processamento = new ProcessamentoRecuperacaoDeSenha(c.repositorioTrabalhos, envio, c.repositorio,
      { intervaloMs: 1000, reservaSegundos: 60, prazoEncerramentoMs: 10, retencaoDias: 7 }, evento);
    void processamento.processarDisponivel(); await vi.waitFor(() => expect(sinal).toBeDefined()); await processamento.parar();
    expect(sinal.aborted).toBe(true); expect(evento).toHaveBeenCalledWith('encerramento_limitado');
  });
  it.each([[400, true], [401, true], [429, false], [500, false]])('classifica Resend %s sem dados do provedor', async (status, definitiva) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('conteudo secreto', { status })));
    await expect(new EnvioEmailResend('re_teste', 'teste@example.test').enviarEmail({ destinatario: 'pessoa@example.test', assunto: 'Teste', html: '', texto: '' })).rejects.toMatchObject({ definitiva, message: 'Falha no envio de e-mail.' });
  });
  it('valida política configurável e rejeita limites incoerentes', () => {
    const ambiente = { DATABASE_URL: 'postgresql://localhost/teste', AUTH_JWT_SECRET: Buffer.alloc(48, 3).toString('base64url') };
    expect(validarAmbiente(ambiente)).toMatchObject({ EMAIL_FILA_MAX_TENTATIVAS: 5, EMAIL_FILA_LEASE_SEGUNDOS: 60 });
    for (const configuracao of [{ EMAIL_FILA_MAX_TENTATIVAS: 0 }, { EMAIL_FILA_LEASE_SEGUNDOS: 10 }, { EMAIL_FILA_ATRASO_INICIAL_SEGUNDOS: 60, EMAIL_FILA_ATRASO_MAXIMO_SEGUNDOS: 30 }]) {
      expect(() => validarAmbiente({ ...ambiente, ...configuracao })).toThrow();
    }
  });
  it('cancelamento do envio SMTP fecha a conexão real em andamento', async () => {
    const conexoes = new Set<Socket>(); let conectou!: () => void;
    const conectado = new Promise<void>((resolver) => { conectou = resolver; });
    const servidor = createServer((socket) => {
      conexoes.add(socket); socket.on('error', () => {}); socket.on('data', () => {});
      socket.once('close', () => conexoes.delete(socket)); conectou();
      // Servidor deliberadamente sem saudação para manter o envio em andamento.
    });
    await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    const endereco = servidor.address(); if (!endereco || typeof endereco === 'string') throw new Error('Porta indisponível');
    const controle = new AbortController();
    try {
      const envio = new EnvioEmailSmtp('teste@example.test', { host: '127.0.0.1', port: endereco.port, secure: false })
        .enviarEmail({ destinatario: 'pessoa@example.test', assunto: 'Teste', texto: 'Teste', html: 'Teste' }, controle.signal);
      const rejeicao = expect(envio).rejects.toMatchObject({ definitiva: false, message: 'Falha no envio de e-mail.' });
      await conectado; controle.abort(); await rejeicao;
      await vi.waitFor(() => expect(conexoes.size).toBe(0));
    } finally {
      controle.abort(); for (const socket of conexoes) socket.destroy();
      await new Promise<void>((resolver, rejeitar) => servidor.close((erro) => erro ? rejeitar(erro) : resolver()));
    }
  });
});
