import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarClientePrisma, criarVerificadorSaudePrisma } from '../src/database.js';

const SIMULACOES = vi.hoisted(() => ({
  cliente: vi.fn(),
  transacao: vi.fn(),
  executarSql: vi.fn(),
  consultaSql: vi.fn(),
}));

vi.mock('@prisma/client', () => ({ PrismaClient: SIMULACOES.cliente }));

beforeEach(() => {
  vi.resetAllMocks();
  SIMULACOES.cliente.mockReturnValue({ $transaction: SIMULACOES.transacao });
  SIMULACOES.executarSql.mockResolvedValue(0);
  SIMULACOES.consultaSql.mockResolvedValue([{ '?column?': 1 }]);
  SIMULACOES.transacao.mockImplementation(
    async (retorno: (transacao: object) => Promise<void>) => retorno({
      $executeRaw: SIMULACOES.executarSql,
      $queryRaw: SIMULACOES.consultaSql,
    }),
  );
});

describe("infraestrutura Prisma", () => {
  it("impõe espera finita de conexão sem alterar outras opções da URL", () => {
    criarClientePrisma(
      'postgresql://user:example@localhost/db?connect_timeout=0&pool_timeout=0&socket_timeout=0&schema=custom&connection_limit=2&options=-c%20search_path%3Dpublic',
    );

    const opcoes = SIMULACOES.cliente.mock.calls[0][0];
    const url = new URL(opcoes.datasources.db.url);
    expect(url.searchParams.get('connect_timeout')).toBe('5');
    expect(url.searchParams.get('pool_timeout')).toBe('5');
    expect(url.searchParams.get('socket_timeout')).toBe('10');
    expect(url.searchParams.get('schema')).toBe('custom');
    expect(url.searchParams.get('connection_limit')).toBe('2');
    expect(url.searchParams.get('options')).toBe('-c search_path=public');
  });

  it("define limite de consulta PostgreSQL antes da consulta na mesma transação", async () => {
    const verificador = criarVerificadorSaudePrisma(
      criarClientePrisma('postgresql://localhost/db'),
    );

    await verificador.verificarConexaoComBanco();

    expect(SIMULACOES.transacao).toHaveBeenCalledWith(
      expect.any(Function), { maxWait: 5000, timeout: 10000 },
    );
    expect(SIMULACOES.executarSql.mock.calls[0][0].join('')).toBe(
      "SET LOCAL statement_timeout = '5s'",
    );
    expect(SIMULACOES.consultaSql.mock.calls[0][0].join('')).toBe('SELECT 1');
    expect(SIMULACOES.executarSql.mock.invocationCallOrder[0]).toBeLessThan(
      SIMULACOES.consultaSql.mock.invocationCallOrder[0],
    );
  });

  it("não executa consulta quando a definição do limite falha", async () => {
    const falha = new Error('timeout setup failed');
    SIMULACOES.executarSql.mockRejectedValue(falha);
    const verificador = criarVerificadorSaudePrisma(
      criarClientePrisma('postgresql://localhost/db'),
    );

    await expect(verificador.verificarConexaoComBanco()).rejects.toBe(falha);
    expect(SIMULACOES.consultaSql).not.toHaveBeenCalled();
  });

  it("propaga consulta rejeitada até a fronteira da aplicação", async () => {
    const falha = new Error('query cancelled');
    SIMULACOES.consultaSql.mockRejectedValue(falha);
    const verificador = criarVerificadorSaudePrisma(
      criarClientePrisma('postgresql://localhost/db'),
    );

    await expect(verificador.verificarConexaoComBanco()).rejects.toBe(falha);
  });
});
