import Fastify from 'fastify';
import { unavailableRateLimiter, type RateLimiter } from './application/security/rate-limiter.js';
import type { RegisterOfficeWithOwner } from './application/onboarding/register-office-with-owner.js';
import type { DatabaseHealthChecker } from './database-health-checker.js';
import { registerOnboardingRoute } from './presentation/onboarding-route.js';
import { registerAuthenticationRoutes, type AuthenticationRoutes } from './presentation/authentication-routes.js';

export function buildApp(
  databaseHealthChecker: DatabaseHealthChecker,
  registration?: Pick<RegisterOfficeWithOwner, 'execute'>,
  authentication?: AuthenticationRoutes,
  security: { limiter: RateLimiter; trustProxy?: false | string[] } = { limiter: unavailableRateLimiter },
) {
  const app = Fastify({ logger: false, trustProxy: security.trustProxy ?? false });

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
    registerOnboardingRoute(app, registration, security.limiter);
  }
  if (authentication) registerAuthenticationRoutes(app, authentication, security.limiter);

  return app;
}
