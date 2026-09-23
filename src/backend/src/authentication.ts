import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { AuthenticateUser } from './application/authentication/authenticate-user.js';
import { GetAuthenticatedIdentity } from './application/authentication/get-authenticated-identity.js';
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
  return {
    login: new AuthenticateUser(repository, passwords, tokens, new CryptoRefreshTokens(), {
      referencePasswordHash, accessTtlSeconds: environment.AUTH_ACCESS_TTL_SECONDS,
      refreshTtlSeconds: environment.AUTH_REFRESH_TTL_SECONDS,
    }),
    identity: new GetAuthenticatedIdentity(repository, tokens),
    secureCookie: environment.NODE_ENV === 'production',
    refreshTtlSeconds: environment.AUTH_REFRESH_TTL_SECONDS,
    loginLimit: environment.NODE_ENV === 'production' ? 10 : 30,
    loginWindowMs: 15 * 60 * 1000,
  };
}
