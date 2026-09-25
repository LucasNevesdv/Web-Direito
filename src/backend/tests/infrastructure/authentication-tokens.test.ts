import { createHash, randomUUID } from 'node:crypto';
import { decodeJwt, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { ErroTokenAcessoInvalido } from '../../src/application/authentication/authentication-errors.js';
import { TokensRenovacaoCriptograficos } from '../../src/infrastructure/security/crypto-refresh-tokens.js';
import { TokensAcessoJose } from '../../src/infrastructure/security/jose-access-tokens.js';
import { SEGREDO_TESTE } from '../support/authentication-fixture.js';

const AGORA = new Date('2026-09-23T12:00:00Z');
const DADOS_TOKEN = { idUsuario: randomUUID(), idSessao: randomUUID(), idEscritorioAtivo: randomUUID(), papel: 'PROPRIETARIO' as const };
const criarServicoDeTokens = () => new TokensAcessoJose(SEGREDO_TESTE, 'issuer', 'audience', 900, () => AGORA);

describe("tokens de acesso JWT", () => {
  it("assina somente claims necessárias com expiração de quinze minutos", async () => {
    const token = await criarServicoDeTokens().criarTokenDeAcesso(DADOS_TOKEN);
    const conteudo = decodeJwt(token);
    expect(Object.keys(conteudo).sort()).toEqual(['activeOfficeId', 'aud', 'exp', 'iat', 'iss', 'role', 'sessionId', 'sub']);
    expect(conteudo.exp! - conteudo.iat!).toBe(900);
    expect(await criarServicoDeTokens().validarTokenDeAcesso(token)).toEqual(DADOS_TOKEN);
  });

  it.each(['expired', 'future-issued', 'wrong-issuer', 'wrong-audience', 'wrong-algorithm', 'wrong-signature', 'missing-session', 'invalid-role', 'long-lifetime'] as const)("rejeita %s", async (cenario) => {
    const instante = Math.floor(AGORA.getTime() / 1000);
    const conteudo: Record<string, unknown> = { sub: DADOS_TOKEN.idUsuario, sessionId: DADOS_TOKEN.idSessao, activeOfficeId: DADOS_TOKEN.idEscritorioAtivo, role: 'OWNER', iss: 'issuer', aud: 'audience', iat: instante, exp: instante + 900 };
    if (cenario === 'expired') { conteudo.iat = instante - 901; conteudo.exp = instante - 1; }
    if (cenario === 'future-issued') { conteudo.iat = instante + 10; conteudo.exp = instante + 900; }
    if (cenario === 'wrong-issuer') conteudo.iss = 'another';
    if (cenario === 'wrong-audience') conteudo.aud = 'another';
    if (cenario === 'missing-session') delete conteudo.sessionId;
    if (cenario === 'invalid-role') conteudo.role = 'ADMIN';
    if (cenario === 'long-lifetime') conteudo.exp = instante + 901;
    const token = await new SignJWT(conteudo).setProtectedHeader({ alg: cenario === 'wrong-algorithm' ? 'HS384' : 'HS256', typ: 'JWT' })
      .sign(cenario === 'wrong-signature' ? Buffer.alloc(48, 8) : Buffer.from(SEGREDO_TESTE, 'base64url'));
    await expect(criarServicoDeTokens().validarTokenDeAcesso(token)).rejects.toBeInstanceOf(ErroTokenAcessoInvalido);
  });

  it.each(['invalid', 'eyJhbGciOiJub25lIn0.e30.', ''])("rejeita entrada malformada ou sem assinatura", async (token) => {
    await expect(criarServicoDeTokens().validarTokenDeAcesso(token)).rejects.toBeInstanceOf(ErroTokenAcessoInvalido);
  });
});

describe("tokens de renovação", () => {
  it("gera tokens independentes de 256 bits e armazena somente hashes SHA-256", () => {
    const gerador = new TokensRenovacaoCriptograficos();
    const primeiro = gerador.gerarTokenDeRenovacao(), segundo = gerador.gerarTokenDeRenovacao();
    expect(Buffer.from(primeiro.token.split('.')[1], 'base64url')).toHaveLength(32);
    expect(gerador.interpretarTokenDeRenovacao(primeiro.token)).toEqual({ idSessao: primeiro.idSessao, hash: primeiro.hash });
    expect(gerador.compararHashesDeRenovacao(primeiro.hash, primeiro.hash)).toBe(true);
    expect(gerador.compararHashesDeRenovacao(primeiro.hash, segundo.hash)).toBe(false);
    expect(gerador.compararHashesDeRenovacao(primeiro.hash, 'invalid')).toBe(false);
    expect(primeiro.token === segundo.token).toBe(false);
    expect(primeiro.hash === createHash('sha256').update(primeiro.token).digest('hex')).toBe(true);
    expect(primeiro.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(primeiro.hash.includes(primeiro.token)).toBe(false);
  });
  it.each(['', 'legacy-token', 'x'.repeat(10000), `${randomUUID()}.${'!'.repeat(43)}`, `${randomUUID()}.${'A'.repeat(42)}B`])("rejeita formato de renovação malformado %s", (token) => {
    expect(new TokensRenovacaoCriptograficos().interpretarTokenDeRenovacao(token)).toBeNull();
  });
});
