import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { AuthenticateUser } from '../../src/application/authentication/authenticate-user.js';
import { GetAuthenticatedIdentity } from '../../src/application/authentication/get-authenticated-identity.js';
import type { AuthenticationAccount, AuthenticationRepository } from '../../src/application/authentication/authentication-contracts.js';
import { Session } from '../../src/domain/sessions/session.js';
import { User } from '../../src/domain/users/user.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2-password-hasher.js';
import { CryptoRefreshTokens } from '../../src/infrastructure/security/crypto-refresh-tokens.js';
import { JoseAccessTokens } from '../../src/infrastructure/security/jose-access-tokens.js';

export const testPassword = 'isolated authentication test password';
export const testSecret = Buffer.alloc(48, 9).toString('base64url');
const hasher = new Argon2PasswordHasher();
let hashPromise: Promise<string[]> | undefined;

export async function authenticationFixture() {
  hashPromise ??= Promise.all([hasher.hash(testPassword), hasher.hash(randomUUID())]);
  const [passwordHash, referencePasswordHash] = await hashPromise;
  const user = User.create({ name: 'Test User', email: 'user@example.test', passwordHash });
  const account: AuthenticationAccount = {
    user, memberships: [{ office: { id: randomUUID(), name: 'Test Office', status: 'ACTIVE' }, role: 'OWNER' }],
  };
  const sessions = new Map<string, Session>();
  const repository: AuthenticationRepository = {
    findByEmail: vi.fn(async (email) => email === account.user.email ? account : null),
    createSession: vi.fn(async (session) => { sessions.set(session.id, session); }),
    findSession: vi.fn(async (id) => {
      const session = sessions.get(id);
      return session ? { session, account } : null;
    }),
  };
  const passwords = { verify: vi.fn((hash: string, password: string) => hasher.verify(hash, password)) };
  const tokens = new JoseAccessTokens(testSecret, 'test-issuer', 'test-audience', 900);
  const refresh = new CryptoRefreshTokens();
  const login = new AuthenticateUser(repository, passwords, tokens, refresh, {
    referencePasswordHash, accessTtlSeconds: 900, refreshTtlSeconds: 604800,
  });
  const identity = new GetAuthenticatedIdentity(repository, tokens);
  return { account, sessions, repository, passwords, tokens, refresh, login, identity, referencePasswordHash };
}
