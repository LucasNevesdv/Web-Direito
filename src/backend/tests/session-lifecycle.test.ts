import { createHash, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarAplicacao } from '../src/app.js';
import { RenovacaoDeSessao } from '../src/application/authentication/refresh-session.js';
import { ErroTokenAcessoInvalido } from '../src/application/authentication/authentication-errors.js';
import { Sessao } from '../src/domain/sessions/session.js';
import { Usuario } from '../src/domain/users/user.js';
import { criarCenarioAutenticacao, SENHA_TESTE } from './support/authentication-fixture.js';
import { criarCenarioLimitador } from './support/rate-limiter-fixture.js';

const ORIGEM = 'https://app.example.test';
const APLICACOES: ReturnType<typeof criarAplicacao>[] = [];
afterEach(async () => { await Promise.all(APLICACOES.splice(0).map((aplicacao) => aplicacao.close())); });
async function prepararCenario(cookieSeguro = false, limiteRenovacao = 30) {
  const cenario = await criarCenarioAutenticacao();
  const entrar = await cenario.autenticacaoUsuario.autenticarUsuario({ email: cenario.usuarioComVinculos.usuario.email, senha: SENHA_TESTE });
  const sessao = [...cenario.sessoes.values()][0];
  const aplicacao = criarAplicacao({ verificarConexaoComBanco: async () => {} }, undefined, {
    autenticacao: cenario.autenticacaoUsuario, consultaIdentidade: cenario.consultaIdentidade, renovacao: cenario.renovacaoSessao, encerramento: cenario.encerramentoSessao,
    deveUsarCookieSeguro: cookieSeguro, origemFrontend: ORIGEM, validadeRenovacaoSegundos: 604800,
  }, { limitador: criarCenarioLimitador({ 'refresh-ip': { limite: limiteRenovacao, janelaSegundos: 60 } }).limitador });
  APLICACOES.push(aplicacao);
  const enviarPost = (rota: string, token: string | undefined = entrar.tokenRenovacao) => aplicacao.inject({
    method: 'POST', url: `/api/v1/auth/${rota}`, headers: { origin: ORIGEM, ...(token ? { cookie: `refresh_token=${token}` } : {}) },
  });
  return { ...cenario, aplicacao, resultado: entrar, sessao, enviarPost };
}

describe("renovação e encerramento da sessão", () => {
  it.each([false, true])("rotaciona o hash, assina claims, preserva a expiração e protege o cookie (secure=%s)", async (seguro) => {
    const cenario = await prepararCenario(seguro);
    const resposta = await cenario.enviarPost('refresh');
    expect(resposta.statusCode).toBe(200);
    const token = resposta.cookies[0].value;
    expect(token === cenario.resultado.tokenRenovacao).toBe(false);
    const armazenado = cenario.sessoes.get(cenario.sessao.id)!.obterEstadoAtualDaSessao();
    expect(armazenado.hashTokenRenovacao === createHash('sha256').update(token).digest('hex')).toBe(true);
    expect(armazenado.hashTokenRenovacao === cenario.sessao.obterEstadoAtualDaSessao().hashTokenRenovacao).toBe(false);
    expect(armazenado.ultimoUsoEm).toBeInstanceOf(Date);
    expect(armazenado.atualizadoEm).toEqual(armazenado.ultimoUsoEm);
    expect(armazenado.expiraEm).toEqual(cenario.sessao.expiraEm);
    expect(Object.keys(resposta.json()).sort()).toEqual(['escritorio', 'expiraEmSegundos', 'tokenAcesso', 'usuario']);
    for (const segredo of [token, armazenado.hashTokenRenovacao, cenario.usuarioComVinculos.usuario.hashSenha]) expect(resposta.body.includes(segredo)).toBe(false);
    expect(await cenario.tokensAcesso.validarTokenDeAcesso(resposta.json().tokenAcesso)).toEqual({ idUsuario: armazenado.idUsuario, idSessao: armazenado.id, idEscritorioAtivo: armazenado.idEscritorioAtivo, papel: 'PROPRIETARIO' });
    const cookie = String(resposta.headers['set-cookie']);
    for (const atributo of ['HttpOnly', 'SameSite=Lax', 'Path=/api/v1/auth']) expect(cookie).toContain(atributo);
    expect(cookie.includes('Secure')).toBe(seguro);
    expect(resposta.headers['cache-control']).toBe('no-store');
    expect((await cenario.enviarPost('refresh', token)).statusCode).toBe(200);
  });

  it.each(['missing-cookie', 'malformed', 'legacy', 'oversized', 'missing-session', 'expired', 'revoked', 'inactive-user', 'inactive-office', 'missing-membership', 'wrong-office', 'wrong-user', 'wrong-hash'] as const)("rejeita %s com a mesma resposta 401 sanitizada e limpa o cookie", async (condicao) => {
    const cenario = await prepararCenario();
    let token = cenario.resultado.tokenRenovacao;
    const estado = cenario.sessao.obterEstadoAtualDaSessao();
    if (condicao === 'missing-cookie') token = '';
    if (condicao === 'malformed') token = 'internal-secret-invalid';
    if (condicao === 'legacy') token = 'a'.repeat(43);
    if (condicao === 'oversized') token = 'x'.repeat(5000);
    if (condicao === 'missing-session') cenario.sessoes.clear();
    if (condicao === 'expired') cenario.sessoes.set(estado.id, Sessao.restaurar({ ...estado, criadoEm: new Date(0), expiraEm: new Date(1) }));
    if (condicao === 'revoked') await cenario.repositorio.revogarSessao(estado.id, new Date());
    if (condicao === 'inactive-user') {
      const usuario = cenario.usuarioComVinculos.usuario;
      cenario.usuarioComVinculos.usuario = Usuario.restaurar({ id: usuario.id, nome: usuario.nome, email: usuario.email, hashSenha: usuario.hashSenha, situacao: 'INATIVO', criadoEm: usuario.criadoEm, atualizadoEm: usuario.atualizadoEm });
    }
    if (condicao === 'inactive-office') cenario.usuarioComVinculos.vinculos[0].escritorio.situacao = 'INATIVO';
    if (condicao === 'missing-membership') cenario.usuarioComVinculos.vinculos = [];
    if (condicao === 'wrong-office') cenario.sessoes.set(estado.id, Sessao.restaurar({ ...estado, idEscritorioAtivo: randomUUID() }));
    if (condicao === 'wrong-user') cenario.sessoes.set(estado.id, Sessao.restaurar({ ...estado, idUsuario: randomUUID() }));
    if (condicao === 'wrong-hash') token = cenario.tokensRenovacao.gerarTokenDeRenovacao(estado.id).token;
    const resposta = await cenario.enviarPost('refresh', token);
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: 'NAO_AUTORIZADO', mensagem: 'Entre novamente para continuar.' });
    expect(String(resposta.headers['set-cookie'])).toContain('refresh_token=;');
    expect(cenario.repositorio.substituirHashDeRenovacao).not.toHaveBeenCalled();
    if (condicao === 'wrong-hash') expect(cenario.sessoes.get(estado.id)!.obterEstadoAtualDaSessao().revogadaEm).toBeInstanceOf(Date);
  });

  it("revoga toda a sessão após reutilização e rejeita token substituto e /me", async () => {
    const cenario = await prepararCenario();
    const rotacionado = await cenario.enviarPost('refresh');
    expect((await cenario.enviarPost('refresh')).statusCode).toBe(401);
    expect(cenario.sessoes.get(cenario.sessao.id)!.obterEstadoAtualDaSessao().revogadaEm).toBeInstanceOf(Date);
    expect((await cenario.enviarPost('refresh', rotacionado.cookies[0].value)).statusCode).toBe(401);
    await expect(cenario.consultaIdentidade.consultarIdentidadeAutenticada(rotacionado.json().tokenAcesso)).rejects.toBeInstanceOf(ErroTokenAcessoInvalido);
  });

  it("permite somente um consumo concorrente e revoga a sessão após consumo duplicado", async () => {
    const cenario = await prepararCenario();
    const respostas = await Promise.all([cenario.enviarPost('refresh'), cenario.enviarPost('refresh')]);
    expect(respostas.map((respostaHttp) => respostaHttp.statusCode).sort()).toEqual([200, 401]);
    expect(cenario.sessoes.get(cenario.sessao.id)!.obterEstadoAtualDaSessao().revogadaEm).toBeInstanceOf(Date);
  });

  it("não estende o prazo absoluto perto da expiração", async () => {
    const cenario = await prepararCenario();
    const agora = new Date(cenario.sessao.expiraEm.getTime() - 1);
    const renovar = new RenovacaoDeSessao(cenario.repositorio, cenario.tokensRenovacao, cenario.tokensAcesso, 900, () => agora);
    const resultado = await renovar.renovarSessao(cenario.resultado.tokenRenovacao);
    expect(resultado.renovacaoExpiraEm).toEqual(cenario.sessao.expiraEm);
    const expirado = new RenovacaoDeSessao(cenario.repositorio, cenario.tokensRenovacao, cenario.tokensAcesso, 900, () => cenario.sessao.expiraEm);
    await expect(expirado.renovarSessao(resultado.tokenRenovacao)).rejects.toBeInstanceOf(ErroTokenAcessoInvalido);
  });

  it.each([false, true])("revoga a sessão persistentemente e limpa o cookie com os mesmos atributos (secure=%s)", async (seguro) => {
    const cenario = await prepararCenario(seguro);
    const resposta = await cenario.enviarPost('logout');
    expect(resposta.statusCode).toBe(204); expect(resposta.body).toBe('');
    const revogadaEm = cenario.sessoes.get(cenario.sessao.id)!.obterEstadoAtualDaSessao().revogadaEm;
    expect(revogadaEm).toBeInstanceOf(Date);
    expect((await cenario.enviarPost('logout')).statusCode).toBe(204);
    expect(cenario.sessoes.get(cenario.sessao.id)!.obterEstadoAtualDaSessao().revogadaEm).toEqual(revogadaEm);
    const cookie = String(resposta.headers['set-cookie']);
    for (const atributo of ['refresh_token=;', 'Expires=Thu, 01 Jan 1970', 'HttpOnly', 'Path=/api/v1/auth', 'SameSite=Lax']) expect(cookie).toContain(atributo);
    expect(cookie.includes('Secure')).toBe(seguro);
    expect((await cenario.enviarPost('refresh')).statusCode).toBe(401);
  });

  it.each(['', 'malformed', 'x'.repeat(5000), 'expired', 'unknown'])("mantém a saída idempotente para sessões inválidas ou ausentes (caso %#)", async (entrada) => {
    const cenario = await prepararCenario();
    let token = entrada;
    if (entrada === 'expired') {
      cenario.sessoes.set(cenario.sessao.id, Sessao.restaurar({ ...cenario.sessao.obterEstadoAtualDaSessao(), criadoEm: new Date(0), expiraEm: new Date(1) }));
      token = cenario.resultado.tokenRenovacao;
    }
    if (entrada === 'unknown') token = cenario.tokensRenovacao.gerarTokenDeRenovacao().token;
    const resposta = await cenario.enviarPost('logout', token);
    expect(resposta.statusCode).toBe(204);
    expect(String(resposta.headers['set-cookie'])).toContain('refresh_token=;');
  });

  it.each(['login', 'refresh', 'logout'])("rejeita Origin ausente ou externo em %s sem mutação", async (rota) => {
    const cenario = await prepararCenario();
    for (const candidato of [undefined, 'null', 'https://evil.example.test', `${ORIGEM}.evil.test`]) {
      const resposta = await cenario.aplicacao.inject({ method: 'POST', url: `/api/v1/auth/${rota}`, headers: { ...(candidato ? { origin: candidato } : {}), cookie: `refresh_token=${cenario.resultado.tokenRenovacao}` } });
      expect(resposta.statusCode).toBe(403);
      expect(resposta.headers['set-cookie']).toBeUndefined();
      expect(resposta.headers['access-control-allow-origin']).toBeUndefined();
    }
    expect(cenario.repositorio.substituirHashDeRenovacao).not.toHaveBeenCalled();
    expect(cenario.repositorio.revogarSessao).not.toHaveBeenCalled();
  });

  it("aceita renovação somente por POST e cookie, sem corpo ou consulta", async () => {
    const cenario = await prepararCenario();
    for (const rota of ['refresh', 'logout']) expect((await cenario.aplicacao.inject(`/api/v1/auth/${rota}`)).statusCode).toBe(404);
    expect((await cenario.aplicacao.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { origin: ORIGEM }, payload: { tokenRenovacao: cenario.resultado.tokenRenovacao } })).statusCode).toBe(401);
    expect((await cenario.aplicacao.inject({ method: 'POST', url: '/api/v1/auth/refresh?token=invalid', headers: { origin: ORIGEM } })).statusCode).toBe(401);
  });

  it("limita renovação por IP e sanitiza falhas internas", async () => {
    const cenario = await prepararCenario(false, 2);
    vi.mocked(cenario.repositorio.buscarSessaoComUsuarioPorId).mockRejectedValueOnce(new Error('private-database-and-token-detail'));
    const falha = await cenario.enviarPost('refresh');
    expect(falha.statusCode).toBe(500);
    expect(falha.body).not.toContain('private-database');
    await cenario.enviarPost('refresh', 'malformed');
    expect((await cenario.enviarPost('refresh')).statusCode).toBe(429);
    expect((await cenario.aplicacao.inject('/health')).statusCode).toBe(200);
  });

  it("não consome a renovação quando a assinatura falha", async () => {
    const cenario = await prepararCenario();
    vi.spyOn(cenario.tokensAcesso, "criarTokenDeAcesso").mockRejectedValueOnce(new Error('private-signing-detail'));
    const resposta = await cenario.enviarPost('refresh');
    expect(resposta.statusCode).toBe(500);expect(resposta.body).not.toContain('private-signing-detail');
    expect(cenario.repositorio.substituirHashDeRenovacao).not.toHaveBeenCalled();
    expect(cenario.sessoes.get(cenario.sessao.id)!.obterEstadoAtualDaSessao().hashTokenRenovacao).toBe(cenario.sessao.obterEstadoAtualDaSessao().hashTokenRenovacao);
  });

  it("informa falha de revogação persistente e ainda limpa o cookie", async () => {
    const cenario = await prepararCenario();
    vi.mocked(cenario.repositorio.revogarSessao).mockRejectedValueOnce(new Error('private-database-detail'));
    const resposta = await cenario.enviarPost('logout');
    expect(resposta.statusCode).toBe(500);expect(resposta.body).not.toContain('private-database-detail');
    expect(String(resposta.headers['set-cookie'])).toContain('refresh_token=;');
    expect(cenario.sessoes.get(cenario.sessao.id)!.obterEstadoAtualDaSessao().revogadaEm).toBeNull();
  });

  it("limita Max-Age ao tempo restante da sessão", async () => {
    const cenario = await prepararCenario();
    const expiraEm = new Date(Date.now() + 60000);
    cenario.sessoes.set(cenario.sessao.id, Sessao.restaurar({ ...cenario.sessao.obterEstadoAtualDaSessao(), expiraEm }));
    const resposta = await cenario.enviarPost('refresh');
    expect(resposta.statusCode).toBe(200);
    const maxAge = Number(String(resposta.headers['set-cookie']).match(/Max-Age=(\d+)/)![1]);
    expect(maxAge).toBeGreaterThan(0);expect(maxAge).toBeLessThanOrEqual(60);
    expect(cenario.sessoes.get(cenario.sessao.id)!.expiraEm).toEqual(expiraEm);
  });

  it("revoga sessão identificável mesmo quando outros cookies ultrapassam o limite", async () => {
    const cenario = await prepararCenario();
    const resposta = await cenario.aplicacao.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin: ORIGEM, cookie: `refresh_token=${cenario.resultado.tokenRenovacao}; unrelated=${'x'.repeat(4100)}` } });
    expect(resposta.statusCode).toBe(204);
    expect(cenario.sessoes.get(cenario.sessao.id)!.obterEstadoAtualDaSessao().revogadaEm).toBeInstanceOf(Date);
  });
});
