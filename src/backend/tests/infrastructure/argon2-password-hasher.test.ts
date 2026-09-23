import { describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2-password-hasher.js';

describe('Argon2PasswordHasher', () => {
  it('produces an Argon2id hash with the documented costs and verifies the original secret', async () => {
    const hasher = new Argon2PasswordHasher();
    const password = 'test-only password with spaces';
    const stored = await hasher.hash(password);
    expect(stored.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(stored.includes(password)).toBe(false);
    expect(await hasher.verify(stored, password)).toBe(true);
    expect(await hasher.verify(stored, 'a different test-only value')).toBe(false);
  });

  it('uses a different random salt for each registration', async () => {
    const hasher = new Argon2PasswordHasher();
    const first = await hasher.hash('same test-only password');
    const second = await hasher.hash('same test-only password');
    expect(first === second).toBe(false);
    expect(await hasher.verify(second, 'same test-only password')).toBe(true);
  });
});
