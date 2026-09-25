import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarAplicacao } from '../src/app.js';
import { ErroEscritorioInativo, ErroUsuarioInativo, ErroCredenciaisInvalidas, ErroMultiplosEscritoriosAtivos } from '../src/application/authentication/authentication-errors.js';
import { criarCenarioAutenticacao, SENHA_TESTE, SEGREDO_TESTE } from './support/authentication-fixture.js';
import { criarCenarioLimitador } from './support/rate-limiter-fixture.js';

const APLICACOES: ReturnType<typeof criarAplicacao>[] = [];
afterEach(async () => { await Promise.all(APLICACOES.splice(0).map((aplicacao) => aplicacao.close())); });
async function prepararCenario(deveUsarCookieSeguro = false, limiteLogin = 30) {
  const cenario = await criarCenarioAutenticacao();
  const aplicacao = criarAplicacao({ verificarConexaoComBanco: async () => {} }, undefined, {
    autenticacao: cenario.autenticacaoUsuario, consultaIdentidade: cenario.consultaIdentidade, deveUsarCookieSeguro: deveUsarCookieSeguro,
    renovacao: cenario.renovacaoSessao, encerramento: cenario.encerramentoSessao, origemFrontend: 'http://localhost:5173',
    validadeRenovacaoSegundos: 604800,
  }, { limitador: criarCenarioLimitador({ 'login-ip': { limite: limiteLogin } }).limitador });
  APLICACOES.push(aplicacao);
  const enviarSolicitacaoDeLogin = (conteudo: Record<string, unknown> = { email: cenario.usuarioComVinculos.usuario.email, senha: SENHA_TESTE }) =>
    aplicacao.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'http://localhost:5173' }, payload: conteudo });
  return { ...cenario, aplicacao, enviarLogin: enviarSolicitacaoDeLogin };
}

describe("contrato HTTP de autenticação", () => {
  it.each([false, true])("define cookies protegidos (produção=%s) e retorna identidade autenticada por Bearer", async (seguro) => {
    const cenario = await prepararCenario(seguro);
    const enviarSolicitacaoDeLogin = await cenario.enviarLogin();
    expect(enviarSolicitacaoDeLogin.statusCode).toBe(200);
    const cookie = String(enviarSolicitacaoDeLogin.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie.includes('Secure')).toBe(seguro);
    const renovacaoOriginal = enviarSolicitacaoDeLogin.cookies.find(({ name: nome }) => nome === 'refresh_token')!.value;
    expect(enviarSolicitacaoDeLogin.body.includes(renovacaoOriginal)).toBe(false);
    expect(enviarSolicitacaoDeLogin.body.includes('senha')).toBe(false);
    expect(enviarSolicitacaoDeLogin.body.includes('Hash')).toBe(false);
    expect(enviarSolicitacaoDeLogin.headers['cache-control']).toBe('no-store');
    const resultado = enviarSolicitacaoDeLogin.json();
    const identidade = await cenario.aplicacao.inject({ url: '/api/v1/auth/me', headers: { authorization: `Bearer ${resultado.tokenAcesso}` } });
    expect(identidade.statusCode).toBe(200);
    expect(Object.keys(identidade.json()).sort()).toEqual(['escritorio', 'usuario']);
    expect(identidade.json().escritorio.papel).toBe('PROPRIETARIO');
    expect(identidade.body.includes(resultado.tokenAcesso)).toBe(false);
    expect(identidade.body.includes(renovacaoOriginal)).toBe(false);
    expect(identidade.headers['cache-control']).toBe('no-store');
  });

  it("usa a mesma resposta externa para senha errada, e-mail desconhecido e contas inativas", async () => {
    const cenario = await prepararCenario();
    const incorreto = await cenario.enviarLogin({ email: cenario.usuarioComVinculos.usuario.email, senha: 'wrong' });
    const desconhecido = await cenario.enviarLogin({ email: 'unknown@example.test', senha: 'wrong' });
    expect(incorreto.statusCode).toBe(401);
    expect(desconhecido.statusCode).toBe(401);
    expect(desconhecido.body).toBe(incorreto.body);
    for (const erro of [new ErroUsuarioInativo(), new ErroEscritorioInativo(), new ErroCredenciaisInvalidas()]) {
      vi.spyOn(cenario.autenticacaoUsuario, "autenticarUsuario").mockRejectedValueOnce(erro);
      const inativo = await cenario.enviarLogin();
      expect(inativo.statusCode).toBe(401);
      expect(inativo.body).toBe(incorreto.body);
      expect(inativo.headers['set-cookie']).toBeUndefined();
    }
  });

  it("retorna 409 quando é necessário selecionar escritório", async () => {
    const cenario = await prepararCenario();
    vi.spyOn(cenario.autenticacaoUsuario, "autenticarUsuario").mockRejectedValueOnce(new ErroMultiplosEscritoriosAtivos());
    const resposta = await cenario.enviarLogin();
    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe('SELECAO_ESCRITORIO_NECESSARIA');
    expect(resposta.headers['set-cookie']).toBeUndefined();
  });

  it.each([{}, { email: 'invalid', senha: 'x' }, { email: 'test@example.test' },
    { email: 'test@example.test', senha: 'x', papel: 'PROPRIETARIO' },
    { email: 'test@example.test', senha: 'x'.repeat(129) },
  ])("rejeita entrada inválida sem chamar a autenticação", async (conteudo) => {
    const cenario = await prepararCenario();
    const autenticarUsuarioSimulado = vi.spyOn(cenario.autenticacaoUsuario, "autenticarUsuario");
    const resposta = await cenario.enviarLogin(conteudo);
    expect(resposta.statusCode).toBe(400);
    expect(autenticarUsuarioSimulado).not.toHaveBeenCalled();
  });

  it("sanitiza JSON malformado e erros inesperados", async () => {
    const cenario = await prepararCenario();
    const malformado = await cenario.aplicacao.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' }, payload: '{"password":"private-fixture"' });
    expect(malformado.statusCode).toBe(400);
    expect(malformado.body).not.toContain('private-fixture');
    vi.spyOn(cenario.autenticacaoUsuario, "autenticarUsuario").mockRejectedValueOnce(new Error('database-internal-detail'));
    const resposta = await cenario.enviarLogin();
    expect(resposta.statusCode).toBe(500);
    expect(resposta.body).not.toContain('database-internal-detail');
    expect(resposta.body).not.toContain('stack');
  });

  it.each([undefined, 'Basic invalid', 'Bearer invalid', 'Bearer eyJhbGciOiJub25lIn0.e30.'])("nega tokens Bearer ausentes ou inválidos", async (autorizacao) => {
    const cenario = await prepararCenario();
    const resposta = await cenario.aplicacao.inject({ url: '/api/v1/auth/me', headers: autorizacao ? { authorization: autorizacao } : {} });
    expect(resposta.statusCode).toBe(401);
  });

  it("nega token expirado com assinatura correta", async () => {
    const cenario = await prepararCenario();
    const agora = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ idSessao: randomUUID(), idEscritorioAtivo: randomUUID(), papel: 'PROPRIETARIO' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(cenario.usuarioComVinculos.usuario.id)
      .setIssuer('test-issuer').setAudience('test-audience').setIssuedAt(agora - 901).setExpirationTime(agora - 1)
      .sign(Buffer.from(SEGREDO_TESTE, 'base64url'));
    const resposta = await cenario.aplicacao.inject({ url: '/api/v1/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(resposta.statusCode).toBe(401);
    expect(cenario.repositorio.buscarSessaoComUsuarioPorId).not.toHaveBeenCalled();
  });

  it("limita tentativas repetidas por IP antes do cálculo de senha e preserva rotas de saúde", async () => {
    const cenario = await prepararCenario(false, 2);
    await cenario.enviarLogin({ email: 'unknown@example.test', senha: 'incorrect' });
    await cenario.enviarLogin({ email: 'unknown@example.test', senha: 'incorrect' });
    const bloqueados = await cenario.enviarLogin();
    expect(bloqueados.statusCode).toBe(429);
    expect(bloqueados.headers['retry-after']).toBeDefined();
    expect(cenario.protecaoDeSenhas.compararSenhaComHash).toHaveBeenCalledTimes(2);
    expect((await cenario.aplicacao.inject('/health')).statusCode).toBe(200);
    expect((await cenario.aplicacao.inject('/ready')).statusCode).toBe(200);
    const falsificacao = await cenario.aplicacao.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'http://localhost:5173', 'x-forwarded-for': '203.0.113.42' }, payload: { email: 'unknown@example.test', senha: 'wrong' } });
    expect(falsificacao.statusCode).toBe(429);
  });
});
