import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SIMULACOES = vi.hoisted(() => {
  class ErroAmbiente extends Error {
    constructor(variaveis: string[]) {
      super(`Invalid environment configuration: ${variaveis.join(', ')}`);
      this.name = 'ErroAmbiente';
    }
  }

  const ambiente = {
    DATABASE_URL: 'postgresql://example:private-password@localhost/example',
    HOST: '127.0.0.2',
    PORT: 4321,
    NODE_ENV: 'test',
  };
  const aplicacao = {
    listen: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const prisma = { $disconnect: vi.fn(async () => {}) };
  const verificador = { verificarConexaoComBanco: vi.fn(async () => {}) };
  const repositorio = {};
  const protecaoDeSenhas = {};
  const cadastro = { cadastrarEscritorioComProprietario: vi.fn() };
  const autenticacao = {};

  return {
    ErroAmbiente,
    ambiente,
    aplicacao,
    prisma,
    verificador,
    repositorio,
    protecaoDeSenhas,
    cadastro,
    autenticacao,
    limitador: {},
    limpeza: { parar: vi.fn(async () => {}) },
    comporServicosDeAutenticacao: vi.fn(async () => autenticacao),
    RepositorioCadastroEscritorioPrisma: vi.fn(function () { return repositorio; }),
    ProtecaoDeSenhasArgon2: vi.fn(function () { return protecaoDeSenhas; }),
    CadastroDeEscritorioComProprietario: vi.fn(function () { return cadastro; }),
    carregarAmbiente: vi.fn(() => ambiente),
    criarClientePrisma: vi.fn(() => prisma),
    criarVerificadorSaudePrisma: vi.fn(() => verificador),
    criarAplicacao: vi.fn(() => aplicacao),
  };
});

vi.mock('../src/app.js', () => ({ criarAplicacao: SIMULACOES.criarAplicacao }));
vi.mock('../src/authentication.js', () => ({ comporServicosDeAutenticacao: SIMULACOES.comporServicosDeAutenticacao }));
vi.mock('../src/rate-limiting.js', () => ({ comporLimitacaoDeRequisicoes: () => ({ limitador: SIMULACOES.limitador, iniciarLimpeza: () => SIMULACOES.limpeza }) }));
vi.mock('../src/database.js', () => ({
  criarClientePrisma: SIMULACOES.criarClientePrisma,
  criarVerificadorSaudePrisma: SIMULACOES.criarVerificadorSaudePrisma,
}));
vi.mock('../src/environment.js', () => ({
  ErroAmbiente: SIMULACOES.ErroAmbiente,
  carregarAmbiente: SIMULACOES.carregarAmbiente,
}));
vi.mock('../src/application/onboarding/register-office-with-owner.js', () => ({
  CadastroDeEscritorioComProprietario: SIMULACOES.CadastroDeEscritorioComProprietario,
}));
vi.mock('../src/infrastructure/prisma/prisma-office-registration-repository.js', () => ({
  RepositorioCadastroEscritorioPrisma: SIMULACOES.RepositorioCadastroEscritorioPrisma,
}));
vi.mock('../src/infrastructure/security/argon2-password-hasher.js', () => ({
  ProtecaoDeSenhasArgon2: SIMULACOES.ProtecaoDeSenhasArgon2,
}));

const TRATADORES_SINAIS = new Map<string, () => void>();
let codigoSaidaAnterior: typeof process.exitCode;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  SIMULACOES.aplicacao.listen.mockReset().mockResolvedValue(undefined);
  SIMULACOES.aplicacao.close.mockReset().mockResolvedValue(undefined);
  SIMULACOES.prisma.$disconnect.mockReset().mockResolvedValue(undefined);
  SIMULACOES.carregarAmbiente.mockReset().mockReturnValue(SIMULACOES.ambiente);
  codigoSaidaAnterior = process.exitCode;
  process.exitCode = undefined;
  TRATADORES_SINAIS.clear();

  const registradorOriginal = process.on.bind(process);
  vi.spyOn(process, 'on').mockImplementation((evento, observador) => {
    if (evento === 'SIGINT' || evento === 'SIGTERM') {
      TRATADORES_SINAIS.set(evento, () => observador());
      return process;
    }
    return registradorOriginal(evento, observador);
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit must not be called before cleanup');
  });
});

afterEach(() => {
  process.exitCode = codigoSaidaAnterior;
  vi.restoreAllMocks();
});

function dispararSinal(sinal: 'SIGINT' | 'SIGTERM'): void {
  const tratador = TRATADORES_SINAIS.get(sinal);
  expect(tratador).toBeTypeOf('function');
  tratador?.();
}

describe("inicialização do backend", () => {
  it("compõe cadastro, hash e prontidão e escuta no host e porta validados", async () => {
    await import('../src/server.js');

    expect(SIMULACOES.carregarAmbiente).toHaveBeenCalledOnce();
    expect(SIMULACOES.criarClientePrisma).toHaveBeenCalledWith(
      SIMULACOES.ambiente.DATABASE_URL,
    );
    expect(SIMULACOES.criarVerificadorSaudePrisma).toHaveBeenCalledWith(SIMULACOES.prisma);
    expect(SIMULACOES.RepositorioCadastroEscritorioPrisma).toHaveBeenCalledWith(SIMULACOES.prisma);
    expect(SIMULACOES.ProtecaoDeSenhasArgon2).toHaveBeenCalledOnce();
    expect(SIMULACOES.CadastroDeEscritorioComProprietario).toHaveBeenCalledWith(
      SIMULACOES.repositorio, SIMULACOES.protecaoDeSenhas,
    );
    expect(SIMULACOES.comporServicosDeAutenticacao).toHaveBeenCalledWith(SIMULACOES.prisma, SIMULACOES.ambiente, SIMULACOES.protecaoDeSenhas);
    expect(SIMULACOES.criarAplicacao).toHaveBeenCalledWith(SIMULACOES.verificador, SIMULACOES.cadastro, SIMULACOES.autenticacao, { limitador: SIMULACOES.limitador, trustProxy: undefined });
    expect(SIMULACOES.aplicacao.listen).toHaveBeenCalledWith({
      host: SIMULACOES.ambiente.HOST,
      port: SIMULACOES.ambiente.PORT,
    });
    expect([...TRATADORES_SINAIS.keys()]).toEqual(['SIGINT', 'SIGTERM']);
    expect(SIMULACOES.aplicacao.close).not.toHaveBeenCalled();
    expect(SIMULACOES.prisma.$disconnect).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("limpa recursos após falha ao escutar sem registrar erro bruto ou credenciais", async () => {
    SIMULACOES.aplicacao.listen.mockRejectedValueOnce(
      new Error(`Cannot listen: ${SIMULACOES.ambiente.DATABASE_URL}`),
    );

    await import('../src/server.js');

    expect(SIMULACOES.aplicacao.close).toHaveBeenCalledOnce();
    expect(SIMULACOES.prisma.$disconnect).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
    expect(vi.mocked(console.error).mock.calls).toEqual([
      ['Backend startup failed.'],
    ]);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("tenta desconectar e sanitiza falhas de limpeza após erro de inicialização", async () => {
    const erroPrivado = new Error(SIMULACOES.ambiente.DATABASE_URL);
    SIMULACOES.aplicacao.listen.mockRejectedValueOnce(erroPrivado);
    SIMULACOES.aplicacao.close.mockRejectedValueOnce(erroPrivado);
    SIMULACOES.prisma.$disconnect.mockRejectedValueOnce(erroPrivado);

    await import('../src/server.js');

    expect(SIMULACOES.aplicacao.close).toHaveBeenCalledOnce();
    expect(SIMULACOES.prisma.$disconnect).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
    expect(vi.mocked(console.error).mock.calls).toEqual([
      ['Backend startup failed.'],
      ['Backend cleanup failed.'],
    ]);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it.each(['SIGINT', 'SIGTERM'] as const)(
    "trata rejeição de limpeza em %s e compartilha a limpeza entre sinais repetidos",
    async (sinal) => {
      SIMULACOES.aplicacao.close.mockRejectedValueOnce(
        new Error(SIMULACOES.ambiente.DATABASE_URL),
      );
      await import('../src/server.js');

      dispararSinal(sinal);
      dispararSinal(sinal);

      await vi.waitFor(() => {
        expect(process.exitCode).toBe(1);
        expect(console.error).toHaveBeenCalledTimes(2);
      });
      expect(SIMULACOES.aplicacao.close).toHaveBeenCalledOnce();
      expect(SIMULACOES.prisma.$disconnect).toHaveBeenCalledOnce();
      expect(vi.mocked(console.error).mock.calls).toEqual([
        ['Backend shutdown failed.'],
        ['Backend shutdown failed.'],
      ]);
      expect(process.exit).not.toHaveBeenCalled();
    },
  );

  it("compartilha limpeza bem-sucedida entre SIGINT e SIGTERM", async () => {
    await import('../src/server.js');

    dispararSinal('SIGINT');
    dispararSinal('SIGTERM');

    await vi.waitFor(() => {
      expect(SIMULACOES.prisma.$disconnect).toHaveBeenCalledOnce();
    });
    expect(SIMULACOES.aplicacao.close).toHaveBeenCalledOnce();
    expect(process.exitCode).toBeUndefined();
    expect(SIMULACOES.limpeza.parar).toHaveBeenCalledOnce();
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("informa configuração inválida antes de criar recursos da aplicação ou do banco", async () => {
    SIMULACOES.carregarAmbiente.mockImplementationOnce(() => {
      throw new SIMULACOES.ErroAmbiente(['DATABASE_URL', 'PORT']);
    });

    await import('../src/server.js');

    expect(SIMULACOES.criarClientePrisma).not.toHaveBeenCalled();
    expect(SIMULACOES.criarVerificadorSaudePrisma).not.toHaveBeenCalled();
    expect(SIMULACOES.criarAplicacao).not.toHaveBeenCalled();
    expect(SIMULACOES.RepositorioCadastroEscritorioPrisma).not.toHaveBeenCalled();
    expect(SIMULACOES.ProtecaoDeSenhasArgon2).not.toHaveBeenCalled();
    expect(SIMULACOES.CadastroDeEscritorioComProprietario).not.toHaveBeenCalled();
    expect(SIMULACOES.aplicacao.listen).not.toHaveBeenCalled();
    expect(SIMULACOES.aplicacao.close).not.toHaveBeenCalled();
    expect(SIMULACOES.prisma.$disconnect).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(vi.mocked(console.error).mock.calls).toEqual([
      ['Invalid environment configuration: DATABASE_URL, PORT'],
    ]);
    expect(process.exit).not.toHaveBeenCalled();
  });
});
