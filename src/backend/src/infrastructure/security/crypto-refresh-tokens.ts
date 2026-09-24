import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { RefreshTokens } from '../../application/authentication/authentication-contracts.js';

export class CryptoRefreshTokens implements RefreshTokens {
  generate(sessionId: string = randomUUID()) {
    const token = `${sessionId}.${randomBytes(32).toString('base64url')}`;
    return { sessionId, token, hash: createHash('sha256').update(token).digest('hex') };
  }

  parse(token: string) {
    if (typeof token !== 'string' || token.length !== 80 ||
      !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const [sessionId, secret] = token.split('.');
    // Reject alternative, non-canonical base64url encodings of the same bytes.
    if (Buffer.from(secret, 'base64url').toString('base64url') !== secret) return null;
    return { sessionId, hash: createHash('sha256').update(token).digest('hex') };
  }

  matches(receivedHash: string, storedHash: string): boolean {
    if (![receivedHash, storedHash].every((hash) => /^[a-f\d]{64}$/.test(hash))) return false;
    return timingSafeEqual(Buffer.from(receivedHash, 'hex'), Buffer.from(storedHash, 'hex'));
  }
}
