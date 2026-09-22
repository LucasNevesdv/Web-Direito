import Fastify from 'fastify';
import type { DatabaseHealthChecker } from './database-health-checker.js';

export function buildApp(databaseHealthChecker: DatabaseHealthChecker) {
  const app = Fastify();

  app.get('/health', async () => ({ status: 'ok' as const }));

  app.get('/ready', async (_request, reply) => {
    try {
      await databaseHealthChecker.check();
      return { status: 'ready' as const };
    } catch {
      return reply.status(503).send({ status: 'not_ready' as const });
    }
  });

  return app;
}
