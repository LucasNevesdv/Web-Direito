import { publicIdentity, type AccessTokens, type AuthenticationRepository, type RefreshTokens } from './authentication-contracts.js';
import { InvalidAccessTokenError } from './authentication-errors.js';

export class RefreshSession {
  constructor(
    private readonly repository: AuthenticationRepository,
    private readonly refreshTokens: RefreshTokens,
    private readonly accessTokens: Pick<AccessTokens, 'sign'>,
    private readonly accessTtlSeconds: number,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(token: string | undefined) {
    const parsed = token ? this.refreshTokens.parse(token) : null;
    if (!parsed) throw new InvalidAccessTokenError();
    const found = await this.repository.findSession(parsed.sessionId);
    if (!found) throw new InvalidAccessTokenError();
    const { session, account } = found;
    const now = this.clock();
    if (!this.refreshTokens.matches(parsed.hash, session.toPersistence().refreshTokenHash)) {
      await this.repository.revokeSession(session.id, now);
      throw new InvalidAccessTokenError();
    }
    const membership = account.memberships.find(({ office, role }) =>
      office.id === session.activeOfficeId && office.status === 'ACTIVE' && role === 'OWNER');
    if (!session.isActive(now) || account.user.id !== session.userId || account.user.status !== 'ACTIVE' || !membership) {
      throw new InvalidAccessTokenError();
    }
    const next = this.refreshTokens.generate(session.id);
    const accessToken = await this.accessTokens.sign({
      userId: session.userId, sessionId: session.id, activeOfficeId: session.activeOfficeId, role: membership.role,
    });
    // The current hash is also a concurrency version. Only one caller can replace it.
    const rotated = await this.repository.rotateSession({ id: session.id, currentHash: parsed.hash, nextHash: next.hash, now });
    if (!rotated) {
      await this.repository.revokeSession(session.id, now);
      throw new InvalidAccessTokenError();
    }
    return {
      response: { ...publicIdentity(account, session.activeOfficeId), accessToken, expiresIn: this.accessTtlSeconds },
      refreshToken: next.token, refreshExpiresAt: session.expiresAt,
    };
  }
}
