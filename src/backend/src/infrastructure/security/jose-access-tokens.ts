import { SignJWT, jwtVerify } from 'jose';
import type { AccessClaims, AccessTokens } from '../../application/authentication/authentication-contracts.js';
import { InvalidAccessTokenError } from '../../application/authentication/authentication-errors.js';

export class JoseAccessTokens implements AccessTokens {
  readonly #key: Uint8Array;
  constructor(
    secret: string,
    private readonly issuer: string,
    private readonly audience: string,
    private readonly ttlSeconds: number,
    private readonly clock: () => Date = () => new Date(),
  ) { this.#key = Buffer.from(secret, 'base64url'); }

  async sign(claims: AccessClaims): Promise<string> {
    const now = Math.floor(this.clock().getTime() / 1000);
    return new SignJWT({ sessionId: claims.sessionId, activeOfficeId: claims.activeOfficeId, role: claims.role })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.userId).setIssuer(this.issuer).setAudience(this.audience)
      .setIssuedAt(now).setExpirationTime(now + this.ttlSeconds).sign(this.#key);
  }

  async verify(token: string): Promise<AccessClaims> {
    try {
      const now = this.clock();
      const { payload } = await jwtVerify(token, this.#key, {
        algorithms: ['HS256'], typ: 'JWT', issuer: this.issuer, audience: this.audience,
        requiredClaims: ['sub', 'sessionId', 'activeOfficeId', 'role', 'iat', 'exp', 'iss', 'aud'],
        currentDate: now, maxTokenAge: this.ttlSeconds,
      });
      const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
      if (typeof payload.sub !== 'string' || !uuid.test(payload.sub)
        || typeof payload.sessionId !== 'string' || !uuid.test(payload.sessionId)
        || typeof payload.activeOfficeId !== 'string' || !uuid.test(payload.activeOfficeId)
        || payload.role !== 'OWNER' || typeof payload.iat !== 'number' || typeof payload.exp !== 'number'
        || payload.iat > Math.floor(now.getTime() / 1000) || payload.exp <= payload.iat
        || payload.exp - payload.iat > this.ttlSeconds) throw new InvalidAccessTokenError();
      return { userId: payload.sub, sessionId: payload.sessionId, activeOfficeId: payload.activeOfficeId, role: payload.role };
    } catch { throw new InvalidAccessTokenError(); }
  }
}
