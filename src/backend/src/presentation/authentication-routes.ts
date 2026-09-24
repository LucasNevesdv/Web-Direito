import cookie from '@fastify/cookie';
import type { RateLimiter } from '../application/security/rate-limiter.js';
import { rateLimitHook } from './rate-limit-hook.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthenticateUser } from '../application/authentication/authenticate-user.js';
import type { GetAuthenticatedIdentity } from '../application/authentication/get-authenticated-identity.js';
import type { RefreshSession } from '../application/authentication/refresh-session.js';
import type { LogoutSession } from '../application/authentication/logout-session.js';
import type { PublicIdentity } from '../application/authentication/authentication-contracts.js';
import { InactiveOfficeError, InactiveUserError, InvalidAccessTokenError, InvalidCredentialsError, MultipleActiveOfficesError } from '../application/authentication/authentication-errors.js';

export interface AuthenticationRoutes {
  login: Pick<AuthenticateUser, 'execute'>;
  identity: Pick<GetAuthenticatedIdentity, 'execute'>;
  refresh: Pick<RefreshSession, 'execute'>;
  logout: Pick<LogoutSession, 'execute'>;
  frontendOrigin: string;
  secureCookie: boolean;
  refreshTtlSeconds: number;
}

const loginBody = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  password: z.string().refine((value) => Array.from(value).length >= 1 && Array.from(value).length <= 128),
}).strict();
const invalidCredentials = { error: 'INVALID_CREDENTIALS', message: 'Não foi possível entrar. Confira suas credenciais.' };
const tooManyAttempts = { error: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas. Aguarde antes de tentar novamente.' };

function publicResponse(identity: PublicIdentity): PublicIdentity {
  return {
    user: { id: identity.user.id, name: identity.user.name, email: identity.user.email },
    office: { id: identity.office.id, name: identity.office.name, role: identity.office.role },
  };
}

export function registerAuthenticationRoutes(app: FastifyInstance, services: AuthenticationRoutes, limiter: RateLimiter): void {
  const cookieOptions = {
    httpOnly: true, sameSite: 'lax' as const, path: '/api/v1/auth', secure: services.secureCookie,
  };
  app.register(async (auth) => {
    await auth.register(cookie);
    auth.addHook('onSend', async (_request, reply, payload) => {
      reply.header('Cache-Control', 'no-store');
      return payload;
    });
    auth.addHook('onRequest', async (request, reply) => {
      // Same-origin proxy deployment: never trust Host/X-Forwarded-Host as the allowed origin.
      if (request.method === 'POST' && request.headers.origin !== services.frontendOrigin) {
        return reply.status(403).send({ error: 'FORBIDDEN', message: 'Solicitação não permitida.' });
      }
      if ((request.headers.cookie?.length ?? 0) > 4096) {
        reply.clearCookie('refresh_token', cookieOptions);
        if (request.routeOptions.url === '/api/v1/auth/logout') {
          await services.logout.execute(request.cookies.refresh_token);
          return reply.status(204).send();
        }
        throw new InvalidAccessTokenError();
      }
    });
    auth.setErrorHandler((error, _request, reply) => {
      if (error instanceof InvalidCredentialsError || error instanceof InactiveUserError || error instanceof InactiveOfficeError) {
        return reply.status(401).send(invalidCredentials);
      }
      if (error instanceof InvalidAccessTokenError) {
        if (_request.routeOptions.url === '/api/v1/auth/refresh') reply.clearCookie('refresh_token', cookieOptions);
        return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Entre novamente para continuar.' });
      }
      if (error instanceof MultipleActiveOfficesError) {
        return reply.status(409).send({ error: 'OFFICE_SELECTION_REQUIRED', message: 'A seleção entre escritórios ainda não está disponível.' });
      }
      const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
      if (status === 429) return reply.status(429).send(tooManyAttempts);
      if (typeof status === 'number' && status >= 400 && status < 500) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Confira os dados informados.' });
      }
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Não foi possível concluir a solicitação. Tente novamente.' });
    });

    auth.post('/api/v1/auth/login', {
      bodyLimit: 4 * 1024,
      onRequest: rateLimitHook(limiter, 'login-ip'),
      preValidation: rateLimitHook(limiter, 'login-identity'),
    }, async (request, reply) => {
      const parsed = loginBody.safeParse(request.body);
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          if (issue.path[0] === 'email') fields.email = 'Informe um e-mail válido.';
          if (issue.path[0] === 'password') fields.password = 'Informe sua senha com até 128 caracteres.';
        }
        return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Confira os dados informados.', fields });
      }
      const result = await services.login.execute(parsed.data);
      reply.setCookie('refresh_token', result.refreshToken, {
        ...cookieOptions,
        maxAge: services.refreshTtlSeconds, expires: result.refreshExpiresAt,
      });
      return reply.send({
        accessToken: result.response.accessToken, expiresIn: result.response.expiresIn,
        ...publicResponse(result.response),
      });
    });

    auth.post('/api/v1/auth/refresh', {
      bodyLimit: 1024,
      onRequest: rateLimitHook(limiter, 'refresh-ip'),
    }, async (request, reply) => {
      // No token accepted from query or body, including when a valid cookie is present.
      if (request.body !== undefined || Object.keys(request.query as object).length) throw new InvalidAccessTokenError();
      const result = await services.refresh.execute(request.cookies.refresh_token);
      reply.setCookie('refresh_token', result.refreshToken, {
        ...cookieOptions, expires: result.refreshExpiresAt,
        maxAge: Math.max(0, Math.floor((result.refreshExpiresAt.getTime() - Date.now()) / 1000)),
      });
      return reply.send({ accessToken: result.response.accessToken, expiresIn: result.response.expiresIn, ...publicResponse(result.response) });
    });

    auth.post('/api/v1/auth/logout', { bodyLimit: 1024 }, async (request, reply) => {
      try { await services.logout.execute(request.cookies.refresh_token); }
      finally { reply.clearCookie('refresh_token', cookieOptions); }
      return reply.status(204).send();
    });

    auth.get('/api/v1/auth/me', async (request, reply) => {
      const authorization = request.headers.authorization;
      const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
      if (!match) throw new InvalidAccessTokenError();
      return reply.send(publicResponse(await services.identity.execute(match[1])));
    });
  });
}
