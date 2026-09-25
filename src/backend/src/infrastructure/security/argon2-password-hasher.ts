import { argon2id, hash, verify } from 'argon2';
import type { ProtecaoDeSenhas } from '../../application/security/password-hasher.js';

// OWASP minimum for Argon2id: 19 MiB, 2 iterations, parallelism 1.
// node-argon2 generates a fresh cryptographic salt for every hash.
export class ProtecaoDeSenhasArgon2 implements ProtecaoDeSenhas {
  gerarHashDaSenha(senha: string): Promise<string> {
    return hash(senha, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
    });
  }

  compararSenhaComHash(hashSenha: string, senha: string): Promise<boolean> {
    return verify(hashSenha, senha);
  }
}
