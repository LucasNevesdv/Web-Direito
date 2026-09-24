import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { rateLimiterFixture } from './support/rate-limiter-fixture.js';
import { EmailAlreadyRegisteredError } from '../src/application/onboarding/email-already-registered-error.js';
import { InvalidRegistrationError } from '../src/application/onboarding/invalid-registration-error.js';
import type { RegisterOfficeWithOwner } from '../src/application/onboarding/register-office-with-owner.js';

const apps: ReturnType<typeof buildApp>[] = [];
const input = {
  officeName: 'Escritório de teste',
  adminName: 'Responsável de teste',
  email: 'owner@example.test',
  password: 'test-only-password',
};
const publicResult = {
  office: {
    id: '650a7eb3-55ed-4b2c-9232-6ef73164bc10',
    name: input.officeName,
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  user: {
    id: '99796506-2a94-45a7-b15a-93d9c5990c97',
    name: input.adminName,
    email: input.email,
  },
  role: 'OWNER' as const,
};

function createApp() {
  const execute = vi.fn<RegisterOfficeWithOwner['execute']>()
    .mockResolvedValue(publicResult);
  const check = vi.fn().mockResolvedValue(undefined);
  const app = buildApp({ check }, { execute }, undefined, { limiter: rateLimiterFixture().limiter });
  apps.push(app);
  return { app, execute, check };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

describe('POST /api/v1/onboarding', () => {
  it('returns only the public office, user and OWNER role with HTTP 201', async () => {
    const { app, execute, check } = createApp();
    const resultWithPrivateFields = {
      ...publicResult,
      password: input.password,
      token: 'should-not-be-returned',
      user: { ...publicResult.user, passwordHash: 'private-hash' },
    };
    execute.mockResolvedValueOnce(resultWithPrivateFields);

    const response = await app.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: input,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      ...publicResult,
      office: {
        ...publicResult.office,
        createdAt: publicResult.office.createdAt.toISOString(),
        updatedAt: publicResult.office.updatedAt.toISOString(),
      },
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith(input);
    expect(check).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
    for (const privateValue of [input.password, 'passwordHash', 'private-hash', 'token']) {
      expect(response.body).not.toContain(privateValue);
    }
  });

  it('normalizes names and email without trimming the password', async () => {
    const { app, execute } = createApp();
    const password = ` ${input.password} `;

    const response = await app.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: {
        officeName: `  ${input.officeName}  `,
        adminName: `  ${input.adminName}  `,
        email: '  OWNER@EXAMPLE.TEST  ',
        password,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({ ...input, password });
  });

  it.each([
    ['officeName', ''],
    ['officeName', 'x'],
    ['officeName', 'x'.repeat(121)],
    ['adminName', '  '],
    ['adminName', 'x'],
    ['adminName', 'x'.repeat(121)],
    ['email', 'invalid-email'],
    ['password', 'x'.repeat(11)],
    ['password', 'x'.repeat(129)],
    ['password', { private: 'nested-private-value' }],
  ])('rejects invalid %s with a safe field message and HTTP 400', async (field, value) => {
    const { app, execute } = createApp();

    const response = await app.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: { ...input, [field]: value },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'VALIDATION_ERROR', fields: { [field]: expect.any(String) },
    });
    expect(response.body).not.toContain(input.password);
    expect(response.body).not.toContain('nested-private-value');
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects missing required fields without running registration', async () => {
    const { app, execute } = createApp();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(Object.keys(response.json().fields)).toEqual([
      'officeName', 'adminName', 'email', 'password',
    ]);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(['id', 'officeId', 'userId', 'role', 'status', 'createdAt', 'updatedAt', 'passwordConfirmation'])(
    'rejects a client-supplied %s', async (field) => {
      const { app, execute } = createApp();
      const response = await app.inject({
        method: 'POST', url: '/api/v1/onboarding',
        payload: { ...input, [field]: 'private-client-value' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: 'VALIDATION_ERROR', message: 'Confira os dados do cadastro.',
      });
      expect(response.body).not.toContain('private-client-value');
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it('translates an application validation failure into a safe HTTP 400 response', async () => {
    const { app, execute } = createApp();
    execute.mockRejectedValueOnce(new InvalidRegistrationError('adminName'));

    const response = await app.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: input,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: 'VALIDATION_ERROR', fields: { adminName: expect.any(String) },
    });
  });

  it('returns HTTP 409 for a known email conflict without exposing the email', async () => {
    const { app, execute } = createApp();
    execute.mockRejectedValueOnce(new EmailAlreadyRegisteredError());

    const response = await app.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: input,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'EMAIL_ALREADY_REGISTERED', message: 'Este e-mail já está cadastrado.',
    });
    expect(response.body).not.toContain(input.email);
    expect(response.body).not.toContain(input.password);
  });

  it('sanitizes unexpected failures without logging request data or database errors', async () => {
    const { app, execute } = createApp();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infoLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const internalError = new Error('private database connection and hash details');
    execute.mockRejectedValueOnce(internalError);

    const response = await app.inject({
      method: 'POST', url: '/api/v1/onboarding', payload: input,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'Não foi possível concluir o cadastro. Tente novamente.',
    });
    for (const value of [input.password, internalError.message, 'stack', 'passwordHash']) {
      expect(response.body).not.toContain(value);
    }
    expect(errorLog).not.toHaveBeenCalled();
    expect(infoLog).not.toHaveBeenCalled();
  });

  it.each([
    ['application/json', '{"password":"private-invalid-json"'],
    ['application/json', JSON.stringify({ ...input, password: 'private-oversized-value'.repeat(1000) })],
    ['application/octet-stream', 'private-unsupported-body'],
  ])('sanitizes parser errors for %s', async (contentType, payload) => {
    const { app, execute } = createApp();
    const response = await app.inject({
      method: 'POST', url: '/api/v1/onboarding',
      headers: { 'content-type': contentType }, payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'VALIDATION_ERROR', message: 'Confira os dados do cadastro.',
    });
    expect(response.body).not.toContain('private-');
    expect(execute).not.toHaveBeenCalled();
  });

  it('preserves health and readiness independently of onboarding', async () => {
    const { app, execute, check } = createApp();
    execute.mockRejectedValue(new Error('registration unavailable'));

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
    expect(check).not.toHaveBeenCalled();

    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready' });

    check.mockRejectedValueOnce(new Error('private database failure'));
    const unavailable = await app.inject({ method: 'GET', url: '/ready' });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({ status: 'not_ready' });
    expect(execute).not.toHaveBeenCalled();
  });
});
