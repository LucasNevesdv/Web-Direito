import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EnvironmentError,
  loadEnvironment,
  parseEnvironment,
} from '../src/environment.js';

const validEnvironment = {
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
  it('rejects a missing DATABASE_URL without revealing values', () => {
    expect(() =>
      parseEnvironment({ PORT: '3000', NODE_ENV: 'test' }),
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
      DATABASE_URL: validEnvironment.DATABASE_URL,
      HOST: validEnvironment.HOST,
      PORT: 3000,
      NODE_ENV: 'test',
    });
  });

  it('uses defaults for optional variables', () => {
    expect(
      parseEnvironment({ DATABASE_URL: validEnvironment.DATABASE_URL }),
    ).toEqual({
      DATABASE_URL: validEnvironment.DATABASE_URL,
      HOST: '127.0.0.1',
      PORT: 3000,
      NODE_ENV: 'development',
    });
  });

  it('reports only variable names for malformed configuration', () => {
    expect(() =>
      parseEnvironment({ DATABASE_URL: 'super-secret', PORT: 'invalid' }),
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
      ].join('\n'),
    );
    const environment = {
      DATABASE_URL: validEnvironment.DATABASE_URL,
      PORT: '5000',
      NODE_ENV: 'test',
    };

    expect(loadEnvironment(environment, environmentPath)).toEqual({
      DATABASE_URL: validEnvironment.DATABASE_URL,
      HOST: 'localhost',
      PORT: 5000,
      NODE_ENV: 'test',
    });
    expect(environment).toEqual({
      DATABASE_URL: validEnvironment.DATABASE_URL,
      PORT: '5000',
      NODE_ENV: 'test',
    });
  });
});
