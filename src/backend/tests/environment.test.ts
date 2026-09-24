import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EnvironmentError,
  loadEnvironment,
  parseEnvironment,
} from '../src/environment.js';

const authDefaults = {
  RATE_LIMIT_ONBOARDING_MAX: 10, RATE_LIMIT_ONBOARDING_WINDOW_SECONDS: 900,
  RATE_LIMIT_LOGIN_IP_MAX: 30, RATE_LIMIT_LOGIN_IDENTITY_MAX: 5, RATE_LIMIT_LOGIN_WINDOW_SECONDS: 900,
  RATE_LIMIT_REFRESH_MAX: 30, RATE_LIMIT_REFRESH_WINDOW_SECONDS: 60,
  RATE_LIMIT_CLEANUP_INTERVAL_MS: 60000, TRUST_PROXY: false,
  AUTH_FRONTEND_ORIGIN: 'http://localhost:5173',
  AUTH_JWT_SECRET: Buffer.alloc(48, 7).toString('base64url'),
  AUTH_JWT_ISSUER: 'neodireito', AUTH_JWT_AUDIENCE: 'neodireito-web',
  AUTH_ACCESS_TTL_SECONDS: 900, AUTH_REFRESH_TTL_SECONDS: 604800,
};
const validEnvironment = {
  AUTH_JWT_SECRET: authDefaults.AUTH_JWT_SECRET,
  DATABASE_URL: 'postgresql://usuario:senha@localhost:5432/webdireito',
  HOST: '127.0.0.1',
  PORT: '3000',
  NODE_ENV: 'test',
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('environment configuration', () => {
  it.each(['https://app.example.test/', 'https://app.example.test/path', 'https://user:secret@app.example.test', 'null', 'ftp://example.test'])('rejects non-origin frontend configuration (case %#)', (origin) => {
    expect(() => parseEnvironment({ ...validEnvironment, AUTH_FRONTEND_ORIGIN: origin })).toThrow('AUTH_FRONTEND_ORIGIN');
  });
  it('requires an explicit HTTPS frontend origin in production', () => {
    expect(() => parseEnvironment({ ...validEnvironment, NODE_ENV: 'production' })).toThrow('AUTH_FRONTEND_ORIGIN');
    expect(parseEnvironment({ ...validEnvironment, NODE_ENV: 'production', AUTH_FRONTEND_ORIGIN: 'https://app.example.test' }).AUTH_FRONTEND_ORIGIN).toBe('https://app.example.test');
  });
  it('rejects a missing DATABASE_URL without revealing values', () => {
    expect(() =>
      parseEnvironment({ AUTH_JWT_SECRET: authDefaults.AUTH_JWT_SECRET, PORT: '3000', NODE_ENV: 'test' }),
    ).toThrowError('Invalid environment configuration: DATABASE_URL');
  });

  it('rejects an invalid PORT', () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, PORT: '70000' }),
    ).toThrowError('Invalid environment configuration: PORT');
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, NODE_ENV: 'staging' }),
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
  ])('rejects an invalid DATABASE_URL: %s', (databaseUrl) => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, DATABASE_URL: databaseUrl }),
    ).toThrowError('Invalid environment configuration: DATABASE_URL');
  });

  it.each(['postgres', 'postgresql'])(
    'accepts the %s URL protocol',
    (protocol) => {
      const databaseUrl = `${protocol}://localhost/webdireito`;
      expect(
        parseEnvironment({ ...validEnvironment, DATABASE_URL: databaseUrl })
          .DATABASE_URL,
      ).toBe(databaseUrl);
    },
  );

  it.each(['localhost', 'app.example.test', '127.0.0.1', '0.0.0.0', '::1'])(
    'accepts HOST %s',
    (host) => {
      expect(parseEnvironment({ ...validEnvironment, HOST: host }).HOST).toBe(host);
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
  ])('rejects an invalid HOST: %s', (host) => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, HOST: host }),
    ).toThrowError('Invalid environment configuration: HOST');
  });

  it('accepts a valid isolated configuration', () => {
    expect(parseEnvironment(validEnvironment)).toEqual({
      ...authDefaults,
      DATABASE_URL: validEnvironment.DATABASE_URL,
      HOST: validEnvironment.HOST,
      PORT: 3000,
      NODE_ENV: 'test',
    });
  });

  it('uses defaults for optional variables', () => {
    expect(
      parseEnvironment({ DATABASE_URL: validEnvironment.DATABASE_URL, AUTH_JWT_SECRET: authDefaults.AUTH_JWT_SECRET }),
    ).toEqual({
      ...authDefaults,
      DATABASE_URL: validEnvironment.DATABASE_URL,
      HOST: '127.0.0.1',
      PORT: 3000,
      NODE_ENV: 'development',
    });
  });

  it('reports only variable names for malformed configuration', () => {
    expect(() =>
      parseEnvironment({ AUTH_JWT_SECRET: authDefaults.AUTH_JWT_SECRET, DATABASE_URL: 'super-secret', PORT: 'invalid' }),
    ).toThrowError(new EnvironmentError(['DATABASE_URL', 'PORT']));
  });

  it('loads a temporary file with environment variables taking precedence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'neodireito-environment-'));
    temporaryDirectories.push(directory);
    const environmentPath = join(directory, '.env');
    await writeFile(
      environmentPath,
      [
        'DATABASE_URL=postgresql://file-user:file-password@localhost/file_database',
        'HOST=localhost',
        'PORT=4000',
        'NODE_ENV=development',
        `AUTH_JWT_SECRET=${Buffer.alloc(48, 1).toString('base64url')}`,
      ].join('\n'),
    );
    const environment = {
      AUTH_JWT_SECRET: authDefaults.AUTH_JWT_SECRET,
      DATABASE_URL: validEnvironment.DATABASE_URL,
      PORT: '5000',
      NODE_ENV: 'test',
    };

    expect(loadEnvironment(environment, environmentPath)).toEqual({
      ...authDefaults,
      DATABASE_URL: validEnvironment.DATABASE_URL,
      HOST: 'localhost',
      PORT: 5000,
      NODE_ENV: 'test',
    });
    expect(environment).toEqual({
      AUTH_JWT_SECRET: authDefaults.AUTH_JWT_SECRET,
      DATABASE_URL: validEnvironment.DATABASE_URL,
      PORT: '5000',
      NODE_ENV: 'test',
    });
  });

  it.each([undefined, '', 'short', 'not base64url!'.repeat(5)])('rejects missing or invalid JWT secrets without a fallback', (secret) => {
    expect(() => parseEnvironment({ ...validEnvironment, NODE_ENV: 'production', AUTH_JWT_SECRET: secret }))
      .toThrowError('Invalid environment configuration: AUTH_JWT_SECRET');
  });

  it.each([
    ['AUTH_ACCESS_TTL_SECONDS', '0'], ['AUTH_ACCESS_TTL_SECONDS', '901'],
    ['AUTH_REFRESH_TTL_SECONDS', '604801'], ['AUTH_REFRESH_TTL_SECONDS', 'invalid'],
    ['AUTH_JWT_ISSUER', ''], ['AUTH_JWT_AUDIENCE', ''],
  ])('rejects invalid %s', (field, value) => {
    expect(() => parseEnvironment({ ...validEnvironment, [field]: value })).toThrowError(`Invalid environment configuration: ${field}`);
  });
});
