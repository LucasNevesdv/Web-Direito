import { buildApp } from './app.js';
import { RegisterOfficeWithOwner } from './application/onboarding/register-office-with-owner.js';
import { createPrismaClient, createPrismaHealthChecker } from './database.js';
import { EnvironmentError, loadEnvironment } from './environment.js';
import { PrismaOfficeRegistrationRepository } from './infrastructure/prisma/prisma-office-registration-repository.js';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher.js';
import { createShutdown } from './shutdown.js';

let prisma: ReturnType<typeof createPrismaClient> | undefined;
let app: ReturnType<typeof buildApp> | undefined;

const shutdown = createShutdown(
  { close: async () => { await app?.close(); } },
  { $disconnect: async () => { await prisma?.$disconnect(); } },
);

function handleSignal(): void {
  void shutdown().catch(() => {
    console.error('Backend shutdown failed.');
    process.exitCode = 1;
  });
}

process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);

try {
  const environment = loadEnvironment();
  prisma = createPrismaClient(environment.DATABASE_URL);
  const registration = new RegisterOfficeWithOwner(
    new PrismaOfficeRegistrationRepository(prisma),
    new Argon2PasswordHasher(),
  );
  app = buildApp(createPrismaHealthChecker(prisma), registration);
  await app.listen({
    host: environment.HOST,
    port: environment.PORT,
  });
} catch (error) {
  process.exitCode = 1;
  console.error(
    error instanceof EnvironmentError
      ? error.message
      : 'Backend startup failed.',
  );
  try {
    await shutdown();
  } catch {
    console.error('Backend cleanup failed.');
  }
}
