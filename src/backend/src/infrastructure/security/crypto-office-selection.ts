import { createHash, randomBytes } from 'node:crypto';
import type { TokensSelecao } from '../../application/authentication/session-management-contracts.js';
export class TokensSelecaoCriptograficos implements TokensSelecao {
  gerar() { const token = randomBytes(32).toString('base64url'); return { token, hash: this.calcularHash(token) }; }
  calcularHash(token: string) { return createHash('sha256').update('office-selection:' + token).digest('hex'); }
}
