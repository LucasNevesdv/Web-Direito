import { config } from 'dotenv';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

function isPostgreSqlUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const database = decodeURIComponent(url.pathname.slice(1));
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname.length > 0 &&
      url.pathname.startsWith('/') &&
      !url.pathname.slice(1).includes('/') &&
      database.trim().length > 0
    );
  } catch {
    return false;
  }
}

function isHost(value: string): boolean {
  if (isIP(value)) {
    return true;
  }

  const hostname = value.endsWith('.') ? value.slice(0, -1) : value;
  return (
    hostname.length > 0 &&
    hostname.length <= 253 &&
    !/^[\d.]+$/.test(hostname) &&
    hostname.split('.').every((label) =>
      /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label),
    )
  );
}

const environmentSchema = z.object({
  DATABASE_URL: z.string().trim().refine(isPostgreSqlUrl),
  HOST: z.string().refine(isHost).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  AUTH_JWT_SECRET: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/)
    .refine((value) => Buffer.from(value, 'base64url').length >= 32),
  AUTH_JWT_ISSUER: z.string().trim().min(1).max(200).default('neodireito'),
  AUTH_JWT_AUDIENCE: z.string().trim().min(1).max(200).default('neodireito-web'),
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(900),
  AUTH_REFRESH_TTL_SECONDS: z.coerce.number().int().min(3600).max(604800).default(604800),
});

export type Environment = z.infer<typeof environmentSchema>;

export class EnvironmentError extends Error {
  constructor(variables: string[]) {
    super(`Invalid environment configuration: ${variables.join(', ')}`);
    this.name = 'EnvironmentError';
  }
}

export function parseEnvironment(
  input: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const variables = [
      ...new Set(
        result.error.issues
          .map((issue) => issue.path[0])
          .filter((variable): variable is string => typeof variable === 'string'),
      ),
    ];
    throw new EnvironmentError(variables);
  }

  return result.data;
}

export function loadEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  environmentPath = fileURLToPath(new URL('../.env', import.meta.url)),
): Environment {
  const processEnvironment: Record<string, string> = Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  config({
    path: environmentPath,
    processEnv: processEnvironment,
    override: false,
  });
  return parseEnvironment(processEnvironment);
}
