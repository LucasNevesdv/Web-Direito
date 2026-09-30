import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarAplicacao } from '../src/app.js';
import { criarCenarioSenhas } from './support/password-fixture.js';
import { criarCenarioLimitador } from './support/rate-limiter-fixture.js';
import type { ServicosRotasAutenticacao } from '../src/presentation/authentication-routes.js';
import { ErroTokenAcessoInvalido } from '../src/application/authentication/authentication-errors.js';
const APLICACOES: ReturnType<typeof criarAplicacao>[] = [];
afterEach(async () => { await Promise.all(APLICACOES.splice(0).map((a) => a.close())); });
function preparar() {
  const c = criarCenarioSenhas();
  const limites = criarCenarioLimitador({ 'recovery-ip': { limite: 5 }, 'recovery-email': { limite: 3 },
    'reset-ip': { limite: 5 }, 'reset-token': { limite: 3 }, 'password-change-ip': { limite: 5 }, 'password-change-user': { limite: 3 } });
  const autenticacao = { consultaIdentidade: c.consultaIdentidade, origemFrontend: 'http://localhost:5173', deveUsarCookieSeguro: false } as unknown as ServicosRotasAutenticacao;
  const aplicacao = criarAplicacao({ verificarConexaoComBanco: async () => {} }, undefined, autenticacao, { limitador: limites.limitador }, c);
  APLICACOES.push(aplicacao);
  const enviar = (rota: string, payload: object, ip = '127.0.0.1', autenticado = false) => aplicacao.inject({ method: 'POST', url: `/api/v1/auth/${rota}`, remoteAddress: ip,
    headers: { origin: 'http://localhost:5173', ...(autenticado ? { authorization: 'Bearer acesso' } : {}) }, payload });
  return { ...c, ...limites, aplicacao, enviar };
}
describe('HTTP de senhas', () => {
  it('retorna 202 idêntico para existente, inexistente, malformado e inativo sem aguardar envio', async () => {
    const c = preparar(); const respostas = [];
    for (const email of [c.usuario.email, 'ausente@example.test', 'invalido']) respostas.push(await c.enviar('recuperar-senha', { email }));
    c.usuario.estaAtivo = false; respostas.push(await c.enviar('recuperar-senha', { email: c.usuario.email }));
    expect(respostas.map((r) => r.statusCode)).toEqual([202, 202, 202, 202]);
    expect(new Set(respostas.map((r) => r.body)).size).toBe(1);
    expect(c.trabalhos.size).toBe(1); expect(c.envioEmail.enviarEmail).not.toHaveBeenCalled();
    expect(respostas[0].headers['cache-control']).toBe('no-store');
  });
  it('limita email entre IPs distintos e não guarda e-mail puro', async () => {
    const c = preparar();
    for (let indice = 1; indice <= 3; indice++) expect((await c.enviar('recuperar-senha', { email: ' PESSOA@EXAMPLE.TEST ' }, `127.0.0.${indice}`)).statusCode).toBe(202);
    expect((await c.enviar('recuperar-senha', { email: c.usuario.email }, '127.0.0.4')).statusCode).toBe(429);
    expect([...c.contadores.keys()].join()).not.toContain(c.usuario.email);
  });
  it('limita IP independentemente do e-mail e preserva health', async () => {
    const c = preparar();
    for (let indice = 0; indice < 5; indice++) expect((await c.enviar('recuperar-senha', { email: `pessoa${indice}@example.test` })).statusCode).toBe(202);
    const bloqueada = await c.enviar('recuperar-senha', { email: 'outro@example.test' });
    expect(bloqueada.statusCode).toBe(429); expect(bloqueada.headers['retry-after']).toBeDefined();
    expect((await c.aplicacao.inject('/health')).statusCode).toBe(200);
  });
  it('redefine sem devolver segredos e remove o refresh cookie', async () => {
    const c = preparar(); await c.enviar('recuperar-senha', { email: c.usuario.email }); await c.executarTarefas();
    const resposta = await c.enviar('redefinir-senha', { token: c.obterToken(), novaSenha: 'senha diferente de teste', confirmacaoNovaSenha: 'senha diferente de teste' });
    expect(resposta.statusCode).toBe(200); expect(Object.keys(resposta.json())).toEqual(['mensagem']);
    expect(resposta.headers['set-cookie']).toContain('refresh_token=;'); expect(resposta.body).not.toContain(c.obterToken());
  });
  it('bloqueia tentativas de token entre IPs distintos', async () => {
    const c = preparar();
    for (let indice = 1; indice <= 3; indice++) expect((await c.enviar('redefinir-senha', { token: 'a'.repeat(43), novaSenha: 'senha diferente de teste', confirmacaoNovaSenha: 'senha diferente de teste' }, `127.0.0.${indice}`)).statusCode).toBe(400);
    expect((await c.enviar('redefinir-senha', { token: 'a'.repeat(43), novaSenha: 'senha diferente de teste', confirmacaoNovaSenha: 'senha diferente de teste' }, '127.0.0.4')).statusCode).toBe(429);
  });
  it('exige autenticação e sessão ativa', async () => {
    const c = preparar(); expect((await c.enviar('alterar-senha', {})).statusCode).toBe(401);
    c.consultaIdentidade.consultarIdentidadeAutenticada.mockRejectedValue(new ErroTokenAcessoInvalido());
    expect((await c.enviar('alterar-senha', {}, '127.0.0.1', true)).statusCode).toBe(401);
  });
  it('limita usuário autenticado entre IPs e permite alterar com senha atual', async () => {
    const c = preparar(); const dados = { senhaAtual: 'incorreta', novaSenha: 'senha diferente de teste', confirmacaoNovaSenha: 'senha diferente de teste' };
    for (let indice = 1; indice <= 3; indice++) expect((await c.enviar('alterar-senha', dados, `127.0.0.${indice}`, true)).statusCode).toBe(400);
    expect((await c.enviar('alterar-senha', dados, '127.0.0.4', true)).statusCode).toBe(429);
    const outro = preparar(); expect((await outro.enviar('alterar-senha', { ...dados, senhaAtual: 'senha antiga de teste' }, '127.0.0.1', true)).statusCode).toBe(200);
  });
  it('rejeita origem externa e sanitiza erros de infraestrutura', async () => {
    const c = preparar(); expect((await c.aplicacao.inject({ method: 'POST', url: '/api/v1/auth/recuperar-senha', payload: { email: c.usuario.email } })).statusCode).toBe(403);
    vi.spyOn(c.limitador, 'registrarTentativaDeRequisicao').mockRejectedValue(new Error('segredo interno'));
    const resposta = await c.enviar('recuperar-senha', { email: c.usuario.email });
    expect(resposta.statusCode).toBe(503); expect(resposta.body).not.toContain('segredo interno');
  });
});
