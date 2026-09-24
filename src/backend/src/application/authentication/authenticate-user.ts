import { Session } from '../../domain/sessions/session.js';
import { User } from '../../domain/users/user.js';
import type { PasswordHasher } from '../security/password-hasher.js';
import { publicIdentity, type AccessTokens, type AuthenticationRepository, type RefreshTokens } from './authentication-contracts.js';
import { InactiveOfficeError, InactiveUserError, InvalidCredentialsError, MultipleActiveOfficesError } from './authentication-errors.js';

export class AuthenticateUser {
  constructor(
    private readonly repository: AuthenticationRepository,
    private readonly passwords: Pick<PasswordHasher, 'verify'>,
    private readonly accessTokens: AccessTokens,
    private readonly refreshTokens: RefreshTokens,
    private readonly options: { referencePasswordHash: string; accessTtlSeconds: number; refreshTtlSeconds: number },
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: { email: string; password: string }) {
    let email: string;
    try { email = User.normalizeEmail(input.email); } catch { throw new InvalidCredentialsError(); }
    if (typeof input.password !== 'string' || Array.from(input.password).length < 1 || Array.from(input.password).length > 128) {
      throw new InvalidCredentialsError();
    }
    const account = await this.repository.findByEmail(email);
    // Both unknown email and wrong password perform the same Argon2 verification.
    const matches = await this.passwords.verify(account?.user.passwordHash ?? this.options.referencePasswordHash, input.password);
    if (!account || !matches) throw new InvalidCredentialsError();
    if (account.user.status !== 'ACTIVE') throw new InactiveUserError();
    const memberships = account.memberships.filter(({ office }) => office.status === 'ACTIVE');
    if (memberships.length === 0) throw new InactiveOfficeError();
    if (memberships.length !== 1) throw new MultipleActiveOfficesError();
    const membership = memberships[0];
    const refresh = this.refreshTokens.generate();
    const now = this.clock();
    const session = Session.create({
      id: refresh.sessionId,
      userId: account.user.id, activeOfficeId: membership.office.id, refreshTokenHash: refresh.hash,
      expiresAt: new Date(now.getTime() + this.options.refreshTtlSeconds * 1000), now,
    });
    const accessToken = await this.accessTokens.sign({
      userId: account.user.id, activeOfficeId: membership.office.id, sessionId: session.id, role: membership.role,
    });
    await this.repository.createSession(session);
    return {
      response: { ...publicIdentity(account, membership.office.id), accessToken, expiresIn: this.options.accessTtlSeconds },
      refreshToken: refresh.token,
      refreshExpiresAt: session.expiresAt,
    };
  }
}
