import { describe, expect, it, vi } from 'vitest';
import { criarEncerramento } from '../src/shutdown.js';

describe("encerramento", () => {
  it("compartilha uma Promise e executa a limpeza uma vez em chamadas concorrentes", async () => {
    let finalizarFechamento!: () => void;
    const esperaFechamento = new Promise<void>((resolver) => {
      finalizarFechamento = resolver;
    });
    const close = vi.fn(() => esperaFechamento);
    const desconectar = vi.fn(async () => {});
    const encerrar = criarEncerramento({ close }, { $disconnect: desconectar });

    const primeiro = encerrar();
    const segundo = encerrar();
    expect(segundo).toBe(primeiro);
    await Promise.resolve();
    expect(close).toHaveBeenCalledTimes(1);
    expect(desconectar).not.toHaveBeenCalled();

    finalizarFechamento();
    await Promise.all([primeiro, segundo]);

    expect(encerrar()).toBe(primeiro);
    expect(close).toHaveBeenCalledTimes(1);
    expect(desconectar).toHaveBeenCalledTimes(1);
  });

  it("tenta desconectar após falha ao fechar a aplicação e compartilha a rejeição", async () => {
    const erroFechamento = new Error('Closing failed');
    const close = vi.fn(async () => {
      throw erroFechamento;
    });
    const desconectar = vi.fn(async () => {});
    const encerrar = criarEncerramento({ close }, { $disconnect: desconectar });

    const primeiro = encerrar();
    expect(encerrar()).toBe(primeiro);
    await expect(primeiro).rejects.toBe(erroFechamento);

    expect(encerrar()).toBe(primeiro);
    expect(close).toHaveBeenCalledTimes(1);
    expect(desconectar).toHaveBeenCalledTimes(1);
  });

  it("propaga falha de desconexão após fechar a aplicação", async () => {
    const erroDesconexao = new Error('Disconnection failed');
    const close = vi.fn(async () => {});
    const desconectar = vi.fn(async () => {
      throw erroDesconexao;
    });
    const encerrar = criarEncerramento({ close }, { $disconnect: desconectar });

    await expect(encerrar()).rejects.toBe(erroDesconexao);
    expect(close).toHaveBeenCalledTimes(1);
    expect(desconectar).toHaveBeenCalledTimes(1);
  });

  it("informa ambas as falhas após tentar as duas operações de limpeza", async () => {
    const erroFechamento = new Error('Closing failed');
    const erroDesconexao = new Error('Disconnection failed');
    const close = vi.fn(async () => {
      throw erroFechamento;
    });
    const desconectar = vi.fn(async () => {
      throw erroDesconexao;
    });
    const encerrar = criarEncerramento({ close }, { $disconnect: desconectar });

    await expect(encerrar()).rejects.toMatchObject({
      name: 'AggregateError',
      message: 'Resource cleanup failed',
      errors: [erroFechamento, erroDesconexao],
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(desconectar).toHaveBeenCalledTimes(1);
  });
});
