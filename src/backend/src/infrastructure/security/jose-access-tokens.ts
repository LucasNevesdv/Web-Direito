import { SignJWT, jwtVerify } from 'jose';
import type { DadosTokenAcesso, TokensAcesso } from '../../application/authentication/authentication-contracts.js';
import { ErroTokenAcessoInvalido } from '../../application/authentication/authentication-errors.js';

export class TokensAcessoJose implements TokensAcesso {
  readonly #chave: Uint8Array;
  constructor(
    segredo: string,
    private readonly emissor: string,
    private readonly audiencia: string,
    private readonly validadeSegundos: number,
    private readonly relogio: () => Date = () => new Date(),
  ) { this.#chave = Buffer.from(segredo, 'base64url'); }

  async criarTokenDeAcesso(dadosToken: DadosTokenAcesso): Promise<string> {
    const agora = Math.floor(this.relogio().getTime() / 1000);
    return new SignJWT({ sessionId: dadosToken.idSessao, activeOfficeId: dadosToken.idEscritorioAtivo, role: dadosToken.papel === 'PROPRIETARIO' ? 'OWNER' : dadosToken.papel })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(dadosToken.idUsuario).setIssuer(this.emissor).setAudience(this.audiencia)
      .setIssuedAt(agora).setExpirationTime(agora + this.validadeSegundos).sign(this.#chave);
  }

  async validarTokenDeAcesso(token: string): Promise<DadosTokenAcesso> {
    try {
      const agora = this.relogio();
      const { payload: conteudo } = await jwtVerify(token, this.#chave, {
        algorithms: ['HS256'], typ: 'JWT', issuer: this.emissor, audience: this.audiencia,
        requiredClaims: ['sub', 'sessionId', 'activeOfficeId', 'role', 'iat', 'exp', 'iss', 'aud'],
        currentDate: agora, maxTokenAge: this.validadeSegundos,
      });
      const padraoUuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
      if (typeof conteudo.sub !== 'string' || !padraoUuid.test(conteudo.sub)
        || typeof conteudo.sessionId !== 'string' || !padraoUuid.test(conteudo.sessionId)
        || typeof conteudo.activeOfficeId !== 'string' || !padraoUuid.test(conteudo.activeOfficeId)
        || conteudo.role !== 'OWNER' || typeof conteudo.iat !== 'number' || typeof conteudo.exp !== 'number'
        || conteudo.iat > Math.floor(agora.getTime() / 1000) || conteudo.exp <= conteudo.iat
        || conteudo.exp - conteudo.iat > this.validadeSegundos) throw new ErroTokenAcessoInvalido();
      return { idUsuario: conteudo.sub, idSessao: conteudo.sessionId, idEscritorioAtivo: conteudo.activeOfficeId, papel: 'PROPRIETARIO' };
    } catch { throw new ErroTokenAcessoInvalido(); }
  }
}
