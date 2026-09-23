import Fastify from 'fastify';
import type { RegisterOfficeWithOwner } from './application/onboarding/register-office-with-owner.js';
import type { DatabaseHealthChecker } from './database-health-checker.js';
import { registerOnboardingRoute } from './presentation/onboarding-route.js';

export function buildApp(
  databaseHealthChecker: DatabaseHealthChecker,
  registration?: Pick<RegisterOfficeWithOwner, 'execute'>,
) {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' as const }));

  app.get('/ready', async (_request, reply) => {
    try {
      await databaseHealthChecker.check();
      return { status: 'ready' as const };
    } catch {
      return reply.status(503).send({ status: 'not_ready' as const });
    }
  });

  if (registration) {
    registerOnboardingRoute(app, registration);
  }

  return app;
}
