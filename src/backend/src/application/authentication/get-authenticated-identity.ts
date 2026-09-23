import { publicIdentity, type AccessTokens, type AuthenticationRepository } from './authentication-contracts.js';
import { InvalidAccessTokenError } from './authentication-errors.js';

export class GetAuthenticatedIdentity {
  constructor(
    private readonly repository: AuthenticationRepository,
    private readonly tokens: AccessTokens,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(accessToken: string) {
    const claims = await this.tokens.verify(accessToken);
    const record = await this.repository.findSession(claims.sessionId);
    if (!record || !record.session.isActive(this.clock()) || record.account.user.status !== 'ACTIVE'
      || record.session.userId !== claims.userId || record.account.user.id !== claims.userId
      || record.session.activeOfficeId !== claims.activeOfficeId) throw new InvalidAccessTokenError();
    const membership = record.account.memberships.find(({ office, role }) =>
      office.id === claims.activeOfficeId && office.status === 'ACTIVE' && role === claims.role);
    if (!membership) throw new InvalidAccessTokenError();
    return publicIdentity(record.account, membership.office.id);
  }
}
