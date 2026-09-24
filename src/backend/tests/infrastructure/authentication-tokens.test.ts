import { createHash, randomUUID } from 'node:crypto';
import { decodeJwt, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { InvalidAccessTokenError } from '../../src/application/authentication/authentication-errors.js';
import { CryptoRefreshTokens } from '../../src/infrastructure/security/crypto-refresh-tokens.js';
import { JoseAccessTokens } from '../../src/infrastructure/security/jose-access-tokens.js';
import { testSecret } from '../support/authentication-fixture.js';

const now = new Date('2026-09-23T12:00:00Z');
const claims = { userId: randomUUID(), sessionId: randomUUID(), activeOfficeId: randomUUID(), role: 'OWNER' as const };
const service = () => new JoseAccessTokens(testSecret, 'issuer', 'audience', 900, () => now);

describe('JWT access tokens', () => {
  it('signs only necessary claims with a fifteen-minute expiration', async () => {
    const token = await service().sign(claims);
    const payload = decodeJwt(token);
    expect(Object.keys(payload).sort()).toEqual(['activeOfficeId', 'aud', 'exp', 'iat', 'iss', 'role', 'sessionId', 'sub']);
    expect(payload.exp! - payload.iat!).toBe(900);
    expect(await service().verify(token)).toEqual(claims);
  });

  it.each(['expired', 'future-issued', 'wrong-issuer', 'wrong-audience', 'wrong-algorithm', 'wrong-signature', 'missing-session', 'invalid-role', 'long-lifetime'] as const)('rejects %s', async (scenario) => {
    const timestamp = Math.floor(now.getTime() / 1000);
    const payload: Record<string, unknown> = { sub: claims.userId, sessionId: claims.sessionId, activeOfficeId: claims.activeOfficeId, role: 'OWNER', iss: 'issuer', aud: 'audience', iat: timestamp, exp: timestamp + 900 };
    if (scenario === 'expired') { payload.iat = timestamp - 901; payload.exp = timestamp - 1; }
    if (scenario === 'future-issued') { payload.iat = timestamp + 10; payload.exp = timestamp + 900; }
    if (scenario === 'wrong-issuer') payload.iss = 'another';
    if (scenario === 'wrong-audience') payload.aud = 'another';
    if (scenario === 'missing-session') delete payload.sessionId;
    if (scenario === 'invalid-role') payload.role = 'ADMIN';
    if (scenario === 'long-lifetime') payload.exp = timestamp + 901;
    const token = await new SignJWT(payload).setProtectedHeader({ alg: scenario === 'wrong-algorithm' ? 'HS384' : 'HS256', typ: 'JWT' })
      .sign(scenario === 'wrong-signature' ? Buffer.alloc(48, 8) : Buffer.from(testSecret, 'base64url'));
    await expect(service().verify(token)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  it.each(['invalid', 'eyJhbGciOiJub25lIn0.e30.', ''])('rejects malformed or unsigned input', async (token) => {
    await expect(service().verify(token)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });
});

describe('Refresh tokens', () => {
  it('generates independent 256-bit tokens and stores only SHA-256 digests', () => {
    const generator = new CryptoRefreshTokens();
    const first = generator.generate(), second = generator.generate();
    expect(Buffer.from(first.token.split('.')[1], 'base64url')).toHaveLength(32);
    expect(generator.parse(first.token)).toEqual({ sessionId: first.sessionId, hash: first.hash });
    expect(generator.matches(first.hash, first.hash)).toBe(true);
    expect(generator.matches(first.hash, second.hash)).toBe(false);
    expect(generator.matches(first.hash, 'invalid')).toBe(false);
    expect(first.token === second.token).toBe(false);
    expect(first.hash === createHash('sha256').update(first.token).digest('hex')).toBe(true);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.hash.includes(first.token)).toBe(false);
  });
  it.each(['', 'legacy-token', 'x'.repeat(10000), `${randomUUID()}.${'!'.repeat(43)}`, `${randomUUID()}.${'A'.repeat(42)}B`])('rejects malformed refresh format %s', (token) => {
    expect(new CryptoRefreshTokens().parse(token)).toBeNull();
  });
});
