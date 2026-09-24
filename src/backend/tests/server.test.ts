import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class EnvironmentError extends Error {
    constructor(variables: string[]) {
      super(`Invalid environment configuration: ${variables.join(', ')}`);
      this.name = 'EnvironmentError';
    }
  }

  const environment = {
    DATABASE_URL: 'postgresql://example:private-password@localhost/example',
    HOST: '127.0.0.2',
    PORT: 4321,
    NODE_ENV: 'test',
  };
  const app = {
    listen: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const prisma = { $disconnect: vi.fn(async () => {}) };
  const checker = { check: vi.fn(async () => {}) };
  const repository = {};
  const passwordHasher = {};
  const registration = { execute: vi.fn() };
  const authentication = {};

  return {
    EnvironmentError,
    environment,
    app,
    prisma,
    checker,
    repository,
    passwordHasher,
    registration,
    authentication,
    limiter: {},
    cleanup: { stop: vi.fn(async () => {}) },
    createAuthentication: vi.fn(async () => authentication),
    PrismaOfficeRegistrationRepository: vi.fn(function () { return repository; }),
    Argon2PasswordHasher: vi.fn(function () { return passwordHasher; }),
    RegisterOfficeWithOwner: vi.fn(function () { return registration; }),
    loadEnvironment: vi.fn(() => environment),
    createPrismaClient: vi.fn(() => prisma),
    createPrismaHealthChecker: vi.fn(() => checker),
    buildApp: vi.fn(() => app),
  };
});

vi.mock('../src/app.js', () => ({ buildApp: mocks.buildApp }));
vi.mock('../src/authentication.js', () => ({ createAuthentication: mocks.createAuthentication }));
vi.mock('../src/rate-limiting.js', () => ({ createRateLimiting: () => ({ limiter: mocks.limiter, startCleanup: () => mocks.cleanup }) }));
vi.mock('../src/database.js', () => ({
  createPrismaClient: mocks.createPrismaClient,
  createPrismaHealthChecker: mocks.createPrismaHealthChecker,
}));
vi.mock('../src/environment.js', () => ({
  EnvironmentError: mocks.EnvironmentError,
  loadEnvironment: mocks.loadEnvironment,
}));
vi.mock('../src/application/onboarding/register-office-with-owner.js', () => ({
  RegisterOfficeWithOwner: mocks.RegisterOfficeWithOwner,
}));
vi.mock('../src/infrastructure/prisma/prisma-office-registration-repository.js', () => ({
  PrismaOfficeRegistrationRepository: mocks.PrismaOfficeRegistrationRepository,
}));
vi.mock('../src/infrastructure/security/argon2-password-hasher.js', () => ({
  Argon2PasswordHasher: mocks.Argon2PasswordHasher,
}));

const signalHandlers = new Map<string, () => void>();
let previousExitCode: typeof process.exitCode;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.app.listen.mockReset().mockResolvedValue(undefined);
  mocks.app.close.mockReset().mockResolvedValue(undefined);
  mocks.prisma.$disconnect.mockReset().mockResolvedValue(undefined);
  mocks.loadEnvironment.mockReset().mockReturnValue(mocks.environment);
  previousExitCode = process.exitCode;
  process.exitCode = undefined;
  signalHandlers.clear();

  const originalOn = process.on.bind(process);
  vi.spyOn(process, 'on').mockImplementation((event, listener) => {
    if (event === 'SIGINT' || event === 'SIGTERM') {
      signalHandlers.set(event, () => listener());
      return process;
    }
    return originalOn(event, listener);
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit must not be called before cleanup');
  });
});

afterEach(() => {
  process.exitCode = previousExitCode;
  vi.restoreAllMocks();
});

function triggerSignal(signal: 'SIGINT' | 'SIGTERM'): void {
  const handler = signalHandlers.get(signal);
  expect(handler).toBeTypeOf('function');
  handler?.();
}

describe('backend bootstrap', () => {
  it('composes registration, hashing and readiness and listens on the validated host and port', async () => {
    await import('../src/server.js');

    expect(mocks.loadEnvironment).toHaveBeenCalledOnce();
    expect(mocks.createPrismaClient).toHaveBeenCalledWith(
      mocks.environment.DATABASE_URL,
    );
    expect(mocks.createPrismaHealthChecker).toHaveBeenCalledWith(mocks.prisma);
    expect(mocks.PrismaOfficeRegistrationRepository).toHaveBeenCalledWith(mocks.prisma);
    expect(mocks.Argon2PasswordHasher).toHaveBeenCalledOnce();
    expect(mocks.RegisterOfficeWithOwner).toHaveBeenCalledWith(
      mocks.repository, mocks.passwordHasher,
    );
    expect(mocks.createAuthentication).toHaveBeenCalledWith(mocks.prisma, mocks.environment, mocks.passwordHasher);
    expect(mocks.buildApp).toHaveBeenCalledWith(mocks.checker, mocks.registration, mocks.authentication, { limiter: mocks.limiter, trustProxy: undefined });
    expect(mocks.app.listen).toHaveBeenCalledWith({
      host: mocks.environment.HOST,
      port: mocks.environment.PORT,
    });
    expect([...signalHandlers.keys()]).toEqual(['SIGINT', 'SIGTERM']);
    expect(mocks.app.close).not.toHaveBeenCalled();
    expect(mocks.prisma.$disconnect).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('cleans up a listen failure without logging the raw error or credentials', async () => {
    mocks.app.listen.mockRejectedValueOnce(
      new Error(`Cannot listen: ${mocks.environment.DATABASE_URL}`),
    );

    await import('../src/server.js');

    expect(mocks.app.close).toHaveBeenCalledOnce();
    expect(mocks.prisma.$disconnect).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
    expect(vi.mocked(console.error).mock.calls).toEqual([
      ['Backend startup failed.'],
    ]);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('attempts disconnection and sanitizes cleanup errors after startup fails', async () => {
    const privateError = new Error(mocks.environment.DATABASE_URL);
    mocks.app.listen.mockRejectedValueOnce(privateError);
    mocks.app.close.mockRejectedValueOnce(privateError);
    mocks.prisma.$disconnect.mockRejectedValueOnce(privateError);

    await import('../src/server.js');

    expect(mocks.app.close).toHaveBeenCalledOnce();
    expect(mocks.prisma.$disconnect).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
    expect(vi.mocked(console.error).mock.calls).toEqual([
      ['Backend startup failed.'],
      ['Backend cleanup failed.'],
    ]);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'handles a rejected cleanup on %s and shares cleanup for repeated signals',
    async (signal) => {
      mocks.app.close.mockRejectedValueOnce(
        new Error(mocks.environment.DATABASE_URL),
      );
      await import('../src/server.js');

      triggerSignal(signal);
      triggerSignal(signal);

      await vi.waitFor(() => {
        expect(process.exitCode).toBe(1);
        expect(console.error).toHaveBeenCalledTimes(2);
      });
      expect(mocks.app.close).toHaveBeenCalledOnce();
      expect(mocks.prisma.$disconnect).toHaveBeenCalledOnce();
      expect(vi.mocked(console.error).mock.calls).toEqual([
        ['Backend shutdown failed.'],
        ['Backend shutdown failed.'],
      ]);
      expect(process.exit).not.toHaveBeenCalled();
    },
  );

  it('shares successful cleanup between SIGINT and SIGTERM', async () => {
    await import('../src/server.js');

    triggerSignal('SIGINT');
    triggerSignal('SIGTERM');

    await vi.waitFor(() => {
      expect(mocks.prisma.$disconnect).toHaveBeenCalledOnce();
    });
    expect(mocks.app.close).toHaveBeenCalledOnce();
    expect(process.exitCode).toBeUndefined();
    expect(mocks.cleanup.stop).toHaveBeenCalledOnce();
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('reports invalid configuration before creating application or database resources', async () => {
    mocks.loadEnvironment.mockImplementationOnce(() => {
      throw new mocks.EnvironmentError(['DATABASE_URL', 'PORT']);
    });

    await import('../src/server.js');

    expect(mocks.createPrismaClient).not.toHaveBeenCalled();
    expect(mocks.createPrismaHealthChecker).not.toHaveBeenCalled();
    expect(mocks.buildApp).not.toHaveBeenCalled();
    expect(mocks.PrismaOfficeRegistrationRepository).not.toHaveBeenCalled();
    expect(mocks.Argon2PasswordHasher).not.toHaveBeenCalled();
    expect(mocks.RegisterOfficeWithOwner).not.toHaveBeenCalled();
    expect(mocks.app.listen).not.toHaveBeenCalled();
    expect(mocks.app.close).not.toHaveBeenCalled();
    expect(mocks.prisma.$disconnect).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(vi.mocked(console.error).mock.calls).toEqual([
      ['Invalid environment configuration: DATABASE_URL, PORT'],
    ]);
    expect(process.exit).not.toHaveBeenCalled();
  });
});
