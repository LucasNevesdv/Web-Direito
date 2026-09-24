import type { AuthenticationRepository, RefreshTokens } from './authentication-contracts.js';

export class LogoutSession {
  constructor(
    private readonly repository: Pick<AuthenticationRepository, 'revokeSession'>,
    private readonly refreshTokens: Pick<RefreshTokens, 'parse'>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(token: string | undefined): Promise<void> {
    const parsed = token ? this.refreshTokens.parse(token) : null;
    if (parsed) await this.repository.revokeSession(parsed.sessionId, this.clock());
  }
}
