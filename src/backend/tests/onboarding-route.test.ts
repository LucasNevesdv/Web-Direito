import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarAplicacao } from '../src/app.js';
import { criarCenarioLimitador } from './support/rate-limiter-fixture.js';
import { ErroEmailJaCadastrado } from '../src/application/onboarding/email-already-registered-error.js';
import { ErroCadastroInvalido } from '../src/application/onboarding/invalid-registration-error.js';
import type { CadastroDeEscritorioComProprietario } from '../src/application/onboarding/register-office-with-owner.js';

const APLICACOES: ReturnType<typeof criarAplicacao>[] = [];
const ENTRADA = {
  nomeEscritorio: 'Escritório de teste',
  nomeAdministrador: 'Responsável de teste',
  email: 'owner@example.test',
  senha: 'test-only-password',
};
const RESULTADO_PUBLICO = {
  escritorio: {
    id: '650a7eb3-55ed-4b2c-9232-6ef73164bc10',
    nome: ENTRADA.nomeEscritorio,
    situacao: 'ATIVO' as const,
    criadoEm: new Date('2026-01-01T00:00:00.000Z'),
    atualizadoEm: new Date('2026-01-01T00:00:00.000Z'),
  },
  usuario: {
    id: '99796506-2a94-45a7-b15a-93d9c5990c97',
    nome: ENTRADA.nomeAdministrador,
    email: ENTRADA.email,
  },
  papel: 'PROPRIETARIO' as const,
};

function criarAplicacaoTeste() {
  const cadastrarEscritorioSimulado = vi.fn<CadastroDeEscritorioComProprietario['cadastrarEscritorioComProprietario']>()
    .mockResolvedValue(RESULTADO_PUBLICO);
  const verificarConexaoSimulada = vi.fn().mockResolvedValue(undefined);
  const aplicacao = criarAplicacao({ verificarConexaoComBanco: verificarConexaoSimulada }, { cadastrarEscritorioComProprietario: cadastrarEscritorioSimulado }, undefined, { limitador: criarCenarioLimitador().limitador });
  APLICACOES.push(aplicacao);
  return { aplicacao, cadastrarEscritorioSimulado, verificarConexaoSimulada };
}

afterEach(async () => {
  await Promise.all(APLICACOES.splice(0).map((aplicacao) => aplicacao.close()));
  vi.restoreAllMocks();
});

describe('POST /api/v1/onboarding', () => {
  it("retorna somente escritório, usuário e papel PROPRIETARIO públicos com HTTP 201", async () => {
    const { aplicacao, cadastrarEscritorioSimulado, verificarConexaoSimulada } = criarAplicacaoTeste();
    const resultadoComCamposPrivados = {
      ...RESULTADO_PUBLICO,
      senha: ENTRADA.senha,
      token: 'should-not-be-returned',
      usuario: { ...RESULTADO_PUBLICO.usuario, hashSenha: 'private-hash' },
    };
    cadastrarEscritorioSimulado.mockResolvedValueOnce(resultadoComCamposPrivados);

    const resposta = await aplicacao.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: ENTRADA,
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toEqual({
      ...RESULTADO_PUBLICO,
      escritorio: {
        ...RESULTADO_PUBLICO.escritorio,
        criadoEm: RESULTADO_PUBLICO.escritorio.criadoEm.toISOString(),
        atualizadoEm: RESULTADO_PUBLICO.escritorio.atualizadoEm.toISOString(),
      },
    });
    expect(cadastrarEscritorioSimulado).toHaveBeenCalledOnce();
    expect(cadastrarEscritorioSimulado).toHaveBeenCalledWith(ENTRADA);
    expect(verificarConexaoSimulada).not.toHaveBeenCalled();
    expect(resposta.headers['set-cookie']).toBeUndefined();
    for (const valorPrivado of [ENTRADA.senha, 'hashSenha', 'private-hash', 'token']) {
      expect(resposta.body).not.toContain(valorPrivado);
    }
  });

  it("normaliza nomes e e-mail sem remover espaços da senha", async () => {
    const { aplicacao, cadastrarEscritorioSimulado } = criarAplicacaoTeste();
    const senha = ` ${ENTRADA.senha} `;

    const resposta = await aplicacao.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: {
        nomeEscritorio: `  ${ENTRADA.nomeEscritorio}  `,
        nomeAdministrador: `  ${ENTRADA.nomeAdministrador}  `,
        email: '  OWNER@EXAMPLE.TEST  ',
        senha,
      },
    });

    expect(resposta.statusCode).toBe(201);
    expect(cadastrarEscritorioSimulado).toHaveBeenCalledOnce();
    expect(cadastrarEscritorioSimulado).toHaveBeenCalledWith({ ...ENTRADA, senha });
  });

  it.each([
    ['nomeEscritorio', ''],
    ['nomeEscritorio', 'x'],
    ['nomeEscritorio', 'x'.repeat(121)],
    ['nomeAdministrador', '  '],
    ['nomeAdministrador', 'x'],
    ['nomeAdministrador', 'x'.repeat(121)],
    ['email', 'invalid-email'],
    ['senha', 'x'.repeat(11)],
    ['senha', 'x'.repeat(129)],
    ['senha', { private: 'nested-private-value' }],
  ])("rejeita %s inválido com mensagem segura por campo e HTTP 400", async (campo, valor) => {
    const { aplicacao, cadastrarEscritorioSimulado } = criarAplicacaoTeste();

    const resposta = await aplicacao.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: { ...ENTRADA, [campo]: valor },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({
      erro: 'ERRO_VALIDACAO', campos: { [campo]: expect.any(String) },
    });
    expect(resposta.body).not.toContain(ENTRADA.senha);
    expect(resposta.body).not.toContain('nested-private-value');
    expect(cadastrarEscritorioSimulado).not.toHaveBeenCalled();
  });

  it("rejeita campos obrigatórios ausentes sem executar o cadastro", async () => {
    const { aplicacao, cadastrarEscritorioSimulado } = criarAplicacaoTeste();
    const resposta = await aplicacao.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: {},
    });

    expect(resposta.statusCode).toBe(400);
    expect(Object.keys(resposta.json().campos)).toEqual([
      'nomeEscritorio', 'nomeAdministrador', 'email', 'senha',
    ]);
    expect(cadastrarEscritorioSimulado).not.toHaveBeenCalled();
  });

  it.each(['id', 'idEscritorio', 'idUsuario', 'papel', 'situacao', 'criadoEm', 'atualizadoEm', 'confirmacaoSenha'])(
    "rejeita %s fornecido pelo cliente", async (campo) => {
      const { aplicacao, cadastrarEscritorioSimulado } = criarAplicacaoTeste();
      const resposta = await aplicacao.inject({
        method: 'POST', url: '/api/v1/onboarding',
        payload: { ...ENTRADA, [campo]: 'private-client-value' },
      });

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toEqual({
        erro: 'ERRO_VALIDACAO', mensagem: 'Confira os dados do cadastro.',
      });
      expect(resposta.body).not.toContain('private-client-value');
      expect(cadastrarEscritorioSimulado).not.toHaveBeenCalled();
    },
  );

  it("converte falha de validação da aplicação em resposta HTTP 400 segura", async () => {
    const { aplicacao, cadastrarEscritorioSimulado } = criarAplicacaoTeste();
    cadastrarEscritorioSimulado.mockRejectedValueOnce(new ErroCadastroInvalido('nomeAdministrador'));

    const resposta = await aplicacao.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: ENTRADA,
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({
      erro: 'ERRO_VALIDACAO', campos: { nomeAdministrador: expect.any(String) },
    });
  });

  it("retorna HTTP 409 para conflito conhecido sem expor o e-mail", async () => {
    const { aplicacao, cadastrarEscritorioSimulado } = criarAplicacaoTeste();
    cadastrarEscritorioSimulado.mockRejectedValueOnce(new ErroEmailJaCadastrado());

    const resposta = await aplicacao.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: ENTRADA,
    });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toEqual({
      erro: 'EMAIL_JA_CADASTRADO', mensagem: 'Este e-mail já está cadastrado.',
    });
    expect(resposta.body).not.toContain(ENTRADA.email);
    expect(resposta.body).not.toContain(ENTRADA.senha);
  });

  it("sanitiza falhas inesperadas sem registrar dados da requisição ou erros do banco", async () => {
    const { aplicacao, cadastrarEscritorioSimulado } = criarAplicacaoTeste();
    const logErros = vi.spyOn(console, "error").mockImplementation(() => {});
    const logInformacoes = vi.spyOn(console, 'log').mockImplementation(() => {});
    const erroInterno = new Error('private database connection and hash details');
    cadastrarEscritorioSimulado.mockRejectedValueOnce(erroInterno);

    const resposta = await aplicacao.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: ENTRADA,
    });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json()).toEqual({
      erro: 'ERRO_INTERNO',
      mensagem: 'Não foi possível concluir o cadastro. Tente novamente.',
    });
    for (const valor of [ENTRADA.senha, erroInterno.message, 'stack', 'hashSenha']) {
      expect(resposta.body).not.toContain(valor);
    }
    expect(logErros).not.toHaveBeenCalled();
    expect(logInformacoes).not.toHaveBeenCalled();
  });

  it.each([
    ['application/json', '{"password":"private-invalid-json"'],
    ['application/json', JSON.stringify({ ...ENTRADA, senha: 'private-oversized-value'.repeat(1000) })],
    ['application/octet-stream', 'private-unsupported-body'],
  ])("sanitiza erros de interpretação de %s", async (tipoConteudo, conteudo) => {
    const { aplicacao, cadastrarEscritorioSimulado } = criarAplicacaoTeste();
    const resposta = await aplicacao.inject({
      method: 'POST', url: '/api/v1/onboarding',
      headers: { 'content-type': tipoConteudo }, payload: conteudo,
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toEqual({
      erro: 'ERRO_VALIDACAO', mensagem: 'Confira os dados do cadastro.',
    });
    expect(resposta.body).not.toContain('private-');
    expect(cadastrarEscritorioSimulado).not.toHaveBeenCalled();
  });

  it("preserva saúde e prontidão independentemente do cadastro", async () => {
    const { aplicacao, cadastrarEscritorioSimulado, verificarConexaoSimulada } = criarAplicacaoTeste();
    cadastrarEscritorioSimulado.mockRejectedValue(new Error('registration unavailable'));

    const saude = await aplicacao.inject({ method: 'GET', url: '/health' });
    expect(saude.statusCode).toBe(200);
    expect(saude.json()).toEqual({ situacao: 'ok' });
    expect(verificarConexaoSimulada).not.toHaveBeenCalled();

    const prontidao = await aplicacao.inject({ method: 'GET', url: '/ready' });
    expect(prontidao.statusCode).toBe(200);
    expect(prontidao.json()).toEqual({ situacao: 'ready' });

    verificarConexaoSimulada.mockRejectedValueOnce(new Error('private database failure'));
    const indisponivel = await aplicacao.inject({ method: 'GET', url: '/ready' });
    expect(indisponivel.statusCode).toBe(503);
    expect(indisponivel.json()).toEqual({ situacao: 'not_ready' });
    expect(cadastrarEscritorioSimulado).not.toHaveBeenCalled();
  });
});
