import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { RateLimitKeys, RateLimitScope } from '../../application/security/rate-limiter.js';

export class HmacRateLimitKeys implements RateLimitKeys {
  private readonly key: Buffer;
  constructor(secret: string) {
    this.key = createHmac('sha256', Buffer.from(secret, 'base64url')).update('neodireito/rate-limit/v1').digest();
  }

  digest(scope: RateLimitScope, ip: string, email?: string): string {
    let normalizedIp = ip.trim().toLowerCase();
    if (!isIP(normalizedIp)) throw new Error('Invalid client address');
    if (isIP(normalizedIp) === 6) {
      normalizedIp = new URL(`http://[${normalizedIp}]`).hostname.slice(1, -1);
      const mapped = normalizedIp.match(/^::ffff:([a-f\d]{1,4}):([a-f\d]{1,4})$/);
      if (mapped) {
        const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
        normalizedIp = [high >> 8, high & 255, low >> 8, low & 255].join('.');
      }
    }
    const normalizedEmail = typeof email === 'string' && email.length <= 1024 ? email.trim().toLowerCase().slice(0, 254) : '';
    return createHmac('sha256', this.key).update(JSON.stringify([scope, normalizedIp, scope === 'login-identity' ? normalizedEmail : null])).digest('hex');
  }
}
