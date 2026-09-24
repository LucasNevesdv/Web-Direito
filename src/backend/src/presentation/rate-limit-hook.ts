import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RateLimiter, RateLimitScope } from '../application/security/rate-limiter.js';

export function rateLimitHook(limiter: RateLimiter, scope: RateLimitScope) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { email?: unknown } | null;
      const decision = await limiter.check(scope, request.ip, typeof body?.email === 'string' ? body.email : undefined);
      if (!decision.allowed) return reply.header('Retry-After', decision.retryAfterSeconds).status(429)
        .send({ error: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
    } catch {
      return reply.header('Retry-After', 5).status(503)
        .send({ error: 'SERVICE_UNAVAILABLE', message: 'Serviço temporariamente indisponível. Tente novamente.' });
    }
  };
}
