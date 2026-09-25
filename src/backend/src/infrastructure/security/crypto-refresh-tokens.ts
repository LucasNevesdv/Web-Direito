import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { TokensRenovacao } from '../../application/authentication/authentication-contracts.js';

export class TokensRenovacaoCriptograficos implements TokensRenovacao {
  gerarTokenDeRenovacao(idSessao: string = randomUUID()) {
    const token = `${idSessao}.${randomBytes(32).toString('base64url')}`;
    return { idSessao, token, hash: createHash('sha256').update(token).digest('hex') };
  }

  interpretarTokenDeRenovacao(token: string) {
    if (typeof token !== 'string' || token.length !== 80 ||
      !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const [idSessao, segredo] = token.split('.');
    // Reject alternative, non-canonical base64url encodings of the same bytes.
    if (Buffer.from(segredo, 'base64url').toString('base64url') !== segredo) return null;
    return { idSessao, hash: createHash('sha256').update(token).digest('hex') };
  }

  compararHashesDeRenovacao(hashRecebido: string, hashArmazenado: string): boolean {
    if (![hashRecebido, hashArmazenado].every((hash) => /^[a-f\d]{64}$/.test(hash))) return false;
    return timingSafeEqual(Buffer.from(hashRecebido, 'hex'), Buffer.from(hashArmazenado, 'hex'));
  }
}
