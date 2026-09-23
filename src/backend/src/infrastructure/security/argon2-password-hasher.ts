import { argon2id, hash, verify } from 'argon2';
import type { PasswordHasher } from '../../application/security/password-hasher.js';

// OWASP minimum for Argon2id: 19 MiB, 2 iterations, parallelism 1.
// node-argon2 generates a fresh cryptographic salt for every hash.
export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, {
      type: argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
    });
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }
}
