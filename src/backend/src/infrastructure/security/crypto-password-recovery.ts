import { createHash, randomBytes } from 'node:crypto';
import type { TokensRecuperacao } from '../../application/passwords/password-contracts.js';
export class TokensRecuperacaoCriptograficos implements TokensRecuperacao {
  gerarToken() { const token = randomBytes(32).toString('base64url'); return { token, hash: this.calcularHash(token) }; }
  calcularHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
}
