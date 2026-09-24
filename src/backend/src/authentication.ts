import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { AuthenticateUser } from './application/authentication/authenticate-user.js';
import { GetAuthenticatedIdentity } from './application/authentication/get-authenticated-identity.js';
import { RefreshSession } from './application/authentication/refresh-session.js';
import { LogoutSession } from './application/authentication/logout-session.js';
import type { PasswordHasher } from './application/security/password-hasher.js';
import type { Environment } from './environment.js';
import { PrismaAuthenticationRepository } from './infrastructure/prisma/prisma-authentication-repository.js';
import { CryptoRefreshTokens } from './infrastructure/security/crypto-refresh-tokens.js';
import { JoseAccessTokens } from './infrastructure/security/jose-access-tokens.js';

export async function createAuthentication(prisma: PrismaClient, environment: Environment, passwords: PasswordHasher) {
  const repository = new PrismaAuthenticationRepository(prisma);
  const tokens = new JoseAccessTokens(environment.AUTH_JWT_SECRET, environment.AUTH_JWT_ISSUER,
    environment.AUTH_JWT_AUDIENCE, environment.AUTH_ACCESS_TTL_SECONDS);
  const referencePasswordHash = await passwords.hash(randomBytes(32).toString('base64url'));
  const refreshTokens = new CryptoRefreshTokens();
  return {
    login: new AuthenticateUser(repository, passwords, tokens, refreshTokens, {
      referencePasswordHash, accessTtlSeconds: environment.AUTH_ACCESS_TTL_SECONDS,
      refreshTtlSeconds: environment.AUTH_REFRESH_TTL_SECONDS,
    }),
    identity: new GetAuthenticatedIdentity(repository, tokens),
    refresh: new RefreshSession(repository, refreshTokens, tokens, environment.AUTH_ACCESS_TTL_SECONDS),
    logout: new LogoutSession(repository, refreshTokens),
    frontendOrigin: environment.AUTH_FRONTEND_ORIGIN,
    secureCookie: environment.NODE_ENV === 'production',
    refreshTtlSeconds: environment.AUTH_REFRESH_TTL_SECONDS,
  };
}
