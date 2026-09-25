import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ErroAmbiente,
  carregarAmbiente,
  validarAmbiente,
} from '../src/environment.js';

const PADROES_AUTENTICACAO = {
  RATE_LIMIT_ONBOARDING_MAX: 10, RATE_LIMIT_ONBOARDING_WINDOW_SECONDS: 900,
  RATE_LIMIT_LOGIN_IP_MAX: 30, RATE_LIMIT_LOGIN_IDENTITY_MAX: 5, RATE_LIMIT_LOGIN_WINDOW_SECONDS: 900,
  RATE_LIMIT_REFRESH_MAX: 30, RATE_LIMIT_REFRESH_WINDOW_SECONDS: 60,
  RATE_LIMIT_CLEANUP_INTERVAL_MS: 60000, TRUST_PROXY: false,
  AUTH_FRONTEND_ORIGIN: 'http://localhost:5173',
  AUTH_JWT_SECRET: Buffer.alloc(48, 7).toString('base64url'),
  AUTH_JWT_ISSUER: 'neodireito', AUTH_JWT_AUDIENCE: 'neodireito-web',
  AUTH_ACCESS_TTL_SECONDS: 900, AUTH_REFRESH_TTL_SECONDS: 604800,
};
const AMBIENTE_VALIDO = {
  AUTH_JWT_SECRET: PADROES_AUTENTICACAO.AUTH_JWT_SECRET,
  DATABASE_URL: 'postgresql://usuario:senha@localhost:5432/webdireito',
  HOST: '127.0.0.1',
  PORT: '3000',
  NODE_ENV: 'test',
};

const DIRETORIOS_TEMPORARIOS: string[] = [];

afterEach(async () => {
  await Promise.all(
    DIRETORIOS_TEMPORARIOS.splice(0).map((diretorio) =>
      rm(diretorio, { recursive: true, force: true }),
    ),
  );
});

describe("configuração de ambiente", () => {
  it.each(['https://app.example.test/', 'https://app.example.test/path', 'https://user:secret@app.example.test', 'null', 'ftp://example.test'])("rejeita configuração de frontend que não representa origem (caso %#)", (origem) => {
    expect(() => validarAmbiente({ ...AMBIENTE_VALIDO, AUTH_FRONTEND_ORIGIN: origem })).toThrow('AUTH_FRONTEND_ORIGIN');
  });
  it("exige origem HTTPS explícita do frontend em produção", () => {
    expect(() => validarAmbiente({ ...AMBIENTE_VALIDO, NODE_ENV: 'production' })).toThrow('AUTH_FRONTEND_ORIGIN');
    expect(validarAmbiente({ ...AMBIENTE_VALIDO, NODE_ENV: 'production', AUTH_FRONTEND_ORIGIN: 'https://app.example.test' }).AUTH_FRONTEND_ORIGIN).toBe('https://app.example.test');
  });
  it("rejeita DATABASE_URL ausente sem revelar valores", () => {
    expect(() =>
      validarAmbiente({ AUTH_JWT_SECRET: PADROES_AUTENTICACAO.AUTH_JWT_SECRET, PORT: '3000', NODE_ENV: 'test' }),
    ).toThrowError('Invalid environment configuration: DATABASE_URL');
  });

  it("rejeita PORT inválida", () => {
    expect(() =>
      validarAmbiente({ ...AMBIENTE_VALIDO, PORT: '70000' }),
    ).toThrowError('Invalid environment configuration: PORT');
  });

  it("rejeita NODE_ENV inválido", () => {
    expect(() =>
      validarAmbiente({ ...AMBIENTE_VALIDO, NODE_ENV: 'staging' }),
    ).toThrowError('Invalid environment configuration: NODE_ENV');
  });

  it.each([
    'not-a-url',
    'https://localhost/webdireito',
    'postgresql:///webdireito',
    'postgresql://localhost',
    'postgresql://localhost/',
    'postgresql://localhost/%20',
    'postgresql://localhost/database/extra',
  ])("rejeita DATABASE_URL inválida: %s", (urlBancoDados) => {
    expect(() =>
      validarAmbiente({ ...AMBIENTE_VALIDO, DATABASE_URL: urlBancoDados }),
    ).toThrowError('Invalid environment configuration: DATABASE_URL');
  });

  it.each(['postgres', 'postgresql'])(
    "aceita o protocolo de URL %s",
    (protocolo) => {
      const urlBancoDados = `${protocolo}://localhost/webdireito`;
      expect(
        validarAmbiente({ ...AMBIENTE_VALIDO, DATABASE_URL: urlBancoDados })
          .DATABASE_URL,
      ).toBe(urlBancoDados);
    },
  );

  it.each(['localhost', 'app.example.test', '127.0.0.1', '0.0.0.0', '::1'])(
    "aceita HOST %s",
    (host) => {
      expect(validarAmbiente({ ...AMBIENTE_VALIDO, HOST: host }).HOST).toBe(host);
    },
  );

  it.each([
    '',
    ' localhost ',
    'https://localhost',
    'localhost:3000',
    'invalid host',
    '-invalid.example',
    '999.999.999.999',
  ])("rejeita HOST inválido: %s", (host) => {
    expect(() =>
      validarAmbiente({ ...AMBIENTE_VALIDO, HOST: host }),
    ).toThrowError('Invalid environment configuration: HOST');
  });

  it("aceita configuração isolada válida", () => {
    expect(validarAmbiente(AMBIENTE_VALIDO)).toEqual({
      ...PADROES_AUTENTICACAO,
      DATABASE_URL: AMBIENTE_VALIDO.DATABASE_URL,
      HOST: AMBIENTE_VALIDO.HOST,
      PORT: 3000,
      NODE_ENV: 'test',
    });
  });

  it("usa padrões para variáveis opcionais", () => {
    expect(
      validarAmbiente({ DATABASE_URL: AMBIENTE_VALIDO.DATABASE_URL, AUTH_JWT_SECRET: PADROES_AUTENTICACAO.AUTH_JWT_SECRET }),
    ).toEqual({
      ...PADROES_AUTENTICACAO,
      DATABASE_URL: AMBIENTE_VALIDO.DATABASE_URL,
      HOST: '127.0.0.1',
      PORT: 3000,
      NODE_ENV: 'development',
    });
  });

  it("informa somente nomes das variáveis na configuração malformada", () => {
    expect(() =>
      validarAmbiente({ AUTH_JWT_SECRET: PADROES_AUTENTICACAO.AUTH_JWT_SECRET, DATABASE_URL: 'super-secret', PORT: 'invalid' }),
    ).toThrowError(new ErroAmbiente(['DATABASE_URL', 'PORT']));
  });

  it("carrega arquivo temporário com precedência das variáveis do ambiente", async () => {
    const diretorio = await mkdtemp(join(tmpdir(), 'neodireito-environment-'));
    DIRETORIOS_TEMPORARIOS.push(diretorio);
    const caminhoAmbiente = join(diretorio, '.env');
    await writeFile(
      caminhoAmbiente,
      [
        'DATABASE_URL=postgresql://file-user:file-password@localhost/file_database',
        'HOST=localhost',
        'PORT=4000',
        'NODE_ENV=development',
        `AUTH_JWT_SECRET=${Buffer.alloc(48, 1).toString('base64url')}`,
      ].join('\n'),
    );
    const ambiente = {
      AUTH_JWT_SECRET: PADROES_AUTENTICACAO.AUTH_JWT_SECRET,
      DATABASE_URL: AMBIENTE_VALIDO.DATABASE_URL,
      PORT: '5000',
      NODE_ENV: 'test',
    };

    expect(carregarAmbiente(ambiente, caminhoAmbiente)).toEqual({
      ...PADROES_AUTENTICACAO,
      DATABASE_URL: AMBIENTE_VALIDO.DATABASE_URL,
      HOST: 'localhost',
      PORT: 5000,
      NODE_ENV: 'test',
    });
    expect(ambiente).toEqual({
      AUTH_JWT_SECRET: PADROES_AUTENTICACAO.AUTH_JWT_SECRET,
      DATABASE_URL: AMBIENTE_VALIDO.DATABASE_URL,
      PORT: '5000',
      NODE_ENV: 'test',
    });
  });

  it.each([undefined, '', 'short', 'not base64url!'.repeat(5)])("rejeita segredo JWT ausente ou inválido sem valor alternativo", (segredo) => {
    expect(() => validarAmbiente({ ...AMBIENTE_VALIDO, NODE_ENV: 'production', AUTH_JWT_SECRET: segredo }))
      .toThrowError('Invalid environment configuration: AUTH_JWT_SECRET');
  });

  it.each([
    ['AUTH_ACCESS_TTL_SECONDS', '0'], ['AUTH_ACCESS_TTL_SECONDS', '901'],
    ['AUTH_REFRESH_TTL_SECONDS', '604801'], ['AUTH_REFRESH_TTL_SECONDS', 'invalid'],
    ['AUTH_JWT_ISSUER', ''], ['AUTH_JWT_AUDIENCE', ''],
  ])("rejeita %s inválido", (campo, valor) => {
    expect(() => validarAmbiente({ ...AMBIENTE_VALIDO, [campo]: valor })).toThrowError(`Invalid environment configuration: ${campo}`);
  });
});
