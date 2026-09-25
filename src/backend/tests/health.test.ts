import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarAplicacao } from '../src/app.js';
import type { VerificadorSaudeBanco } from '../src/database-health-checker.js';

const APLICACOES: ReturnType<typeof criarAplicacao>[] = [];

function criarAplicacaoTeste(verificador: VerificadorSaudeBanco) {
  const aplicacao = criarAplicacao(verificador);
  APLICACOES.push(aplicacao);
  return aplicacao;
}

afterEach(async () => {
  await Promise.all(APLICACOES.splice(0).map((aplicacao) => aplicacao.close()));
});

describe('GET /health', () => {
  it("retorna ok sem chamar verificador de banco indisponível", async () => {
    const verificarConexaoSimulada = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const aplicacao = criarAplicacaoTeste({ verificarConexaoComBanco: verificarConexaoSimulada });
    const resposta = await aplicacao.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ situacao: 'ok' });
    expect(verificarConexaoSimulada).not.toHaveBeenCalled();
  });
});

describe('GET /ready', () => {
  it("retorna prontidão após sucesso do verificador", async () => {
    const verificarConexaoSimulada = vi.fn().mockResolvedValue(undefined);
    const aplicacaoProntidao = criarAplicacaoTeste({ verificarConexaoComBanco: verificarConexaoSimulada });

    const resposta = await aplicacaoProntidao.inject({ method: 'GET', url: '/ready' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ situacao: 'ready' });
    expect(verificarConexaoSimulada).toHaveBeenCalledOnce();
  });

  it("retorna falha sanitizada e mantém a saúde disponível", async () => {
    const verificarConexaoSimulada = vi.fn().mockRejectedValue(
      new Error('database unavailable: postgresql://user:secret@internal/db'),
    );
    const aplicacaoProntidao = criarAplicacaoTeste({ verificarConexaoComBanco: verificarConexaoSimulada });

    const resposta = await aplicacaoProntidao.inject({ method: 'GET', url: '/ready' });

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json()).toEqual({ situacao: 'not_ready' });
    expect(resposta.body).not.toContain('database unavailable');
    expect(resposta.body).not.toContain('secret');
    expect(verificarConexaoSimulada).toHaveBeenCalledOnce();

    const saude = await aplicacaoProntidao.inject({ method: 'GET', url: '/health' });
    expect(saude.statusCode).toBe(200);
    expect(saude.json()).toEqual({ situacao: 'ok' });
    expect(verificarConexaoSimulada).toHaveBeenCalledOnce();
  });
});
