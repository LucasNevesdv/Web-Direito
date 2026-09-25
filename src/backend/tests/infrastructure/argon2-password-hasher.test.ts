import { describe, expect, it } from 'vitest';
import { ProtecaoDeSenhasArgon2 } from '../../src/infrastructure/security/argon2-password-hasher.js';

describe("ProtecaoDeSenhasArgon2", () => {
  it("produz hash Argon2id com custos documentados e verifica o segredo original", async () => {
    const geradorHash = new ProtecaoDeSenhasArgon2();
    const senha = 'test-only password with spaces';
    const armazenado = await geradorHash.gerarHashDaSenha(senha);
    expect(armazenado.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(armazenado.includes(senha)).toBe(false);
    expect(await geradorHash.compararSenhaComHash(armazenado, senha)).toBe(true);
    expect(await geradorHash.compararSenhaComHash(armazenado, 'a different test-only value')).toBe(false);
  });

  it("usa salt aleatório diferente em cada cadastro", async () => {
    const geradorHash = new ProtecaoDeSenhasArgon2();
    const primeiro = await geradorHash.gerarHashDaSenha('same test-only password');
    const segundo = await geradorHash.gerarHashDaSenha('same test-only password');
    expect(primeiro === segundo).toBe(false);
    expect(await geradorHash.compararSenhaComHash(segundo, 'same test-only password')).toBe(true);
  });
});
