import { createHash, randomBytes } from 'node:crypto';
import type { RefreshTokens } from '../../application/authentication/authentication-contracts.js';

export class CryptoRefreshTokens implements RefreshTokens {
  generate(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: createHash('sha256').update(token).digest('hex') };
  }
}
