import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { ChavesLimiteRequisicoes, EscopoLimiteRequisicoes } from '../../application/security/rate-limiter.js';

export class ChavesLimiteRequisicoesHmac implements ChavesLimiteRequisicoes {
  private readonly chave: Buffer;
  constructor(segredo: string) {
    this.chave = createHmac('sha256', Buffer.from(segredo, 'base64url')).update('neodireito/rate-limit/v1').digest();
  }

  gerarHashDaChave(escopo: EscopoLimiteRequisicoes, ip: string, email?: string): string {
    let ipNormalizado = ip.trim().toLowerCase();
    if (!isIP(ipNormalizado)) throw new Error('Invalid client address');
    if (isIP(ipNormalizado) === 6) {
      ipNormalizado = new URL(`http://[${ipNormalizado}]`).hostname.slice(1, -1);
      const mapeado = ipNormalizado.match(/^::ffff:([a-f\d]{1,4}):([a-f\d]{1,4})$/);
      if (mapeado) {
        const alto = parseInt(mapeado[1], 16), baixo = parseInt(mapeado[2], 16);
        ipNormalizado = [alto >> 8, alto & 255, baixo >> 8, baixo & 255].join('.');
      }
    }
    const emailNormalizado = typeof email === 'string' && email.length <= 1024 ? email.trim().toLowerCase().slice(0, 254) : '';
    return createHmac('sha256', this.chave).update(JSON.stringify([escopo, ipNormalizado, escopo === 'login-identity' ? emailNormalizado : null])).digest('hex');
  }
}
