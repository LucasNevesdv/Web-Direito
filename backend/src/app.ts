import Fastify from 'fastify';

export function buildApp() {
  const app = Fastify();

  app.get('/health', async () => ({ status: 'ok' as const }));

  return app;
}
