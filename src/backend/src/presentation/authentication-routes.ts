import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthenticateUser } from '../application/authentication/authenticate-user.js';
import type { GetAuthenticatedIdentity } from '../application/authentication/get-authenticated-identity.js';
import type { PublicIdentity } from '../application/authentication/authentication-contracts.js';
import { InactiveOfficeError, InactiveUserError, InvalidAccessTokenError, InvalidCredentialsError, MultipleActiveOfficesError } from '../application/authentication/authentication-errors.js';

export interface AuthenticationRoutes {
  login: Pick<AuthenticateUser, 'execute'>;
  identity: Pick<GetAuthenticatedIdentity, 'execute'>;
  secureCookie: boolean;
  refreshTtlSeconds: number;
  loginLimit: number;
  loginWindowMs: number;
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

export function registerAuthenticationRoutes(app: FastifyInstance, services: AuthenticationRoutes): void {
  app.register(async (auth) => {
    await auth.register(cookie);
    await auth.register(rateLimit, {
      global: false, hook: 'onRequest', keyGenerator: (request) => request.ip,
      errorResponseBuilder: () => ({ statusCode: 429, ...tooManyAttempts }),
    });
    auth.addHook('onSend', async (_request, reply, payload) => {
      reply.header('Cache-Control', 'no-store');
      return payload;
    });
    auth.setErrorHandler((error, _request, reply) => {
      if (error instanceof InvalidCredentialsError || error instanceof InactiveUserError || error instanceof InactiveOfficeError) {
        return reply.status(401).send(invalidCredentials);
      }
      if (error instanceof InvalidAccessTokenError) {
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
      config: { rateLimit: { max: services.loginLimit, timeWindow: services.loginWindowMs } },
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
        httpOnly: true, sameSite: 'lax', path: '/api/v1/auth', secure: services.secureCookie,
        maxAge: services.refreshTtlSeconds, expires: result.refreshExpiresAt,
      });
      return reply.send({
        accessToken: result.response.accessToken, expiresIn: result.response.expiresIn,
        ...publicResponse(result.response),
      });
    });

    auth.get('/api/v1/auth/me', async (request, reply) => {
      const authorization = request.headers.authorization;
      const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
      if (!match) throw new InvalidAccessTokenError();
      return reply.send(publicResponse(await services.identity.execute(match[1])));
    });
  });
}
