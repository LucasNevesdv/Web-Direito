import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { AutenticacaoDeUsuario } from './application/authentication/authenticate-user.js';
import { ConsultaDeIdentidadeAutenticada } from './application/authentication/get-authenticated-identity.js';
import { RenovacaoDeSessao } from './application/authentication/refresh-session.js';
import { EncerramentoDeSessao } from './application/authentication/logout-session.js';
import type { ProtecaoDeSenhas } from './application/security/password-hasher.js';
import type { Ambiente } from './environment.js';
import { RepositorioAutenticacaoPrisma } from './infrastructure/prisma/prisma-authentication-repository.js';
import { TokensRenovacaoCriptograficos } from './infrastructure/security/crypto-refresh-tokens.js';
import { TokensAcessoJose } from './infrastructure/security/jose-access-tokens.js';
import { GestaoSessoes } from './application/authentication/manage-sessions.js';
import { RepositorioGestaoSessoesPrisma } from './infrastructure/prisma/prisma-session-management-repository.js';
import { TokensSelecaoCriptograficos } from './infrastructure/security/crypto-office-selection.js';
import { AuditoriaAutenticacaoPrisma } from './infrastructure/prisma/prisma-login-audit.js';

export async function comporServicosDeAutenticacao(prisma: PrismaClient, ambiente: Ambiente, protecaoDeSenhas: ProtecaoDeSenhas) {
  const repositorioAutenticacao = new RepositorioAutenticacaoPrisma(prisma);
  const tokensAcesso = new TokensAcessoJose(ambiente.AUTH_JWT_SECRET, ambiente.AUTH_JWT_ISSUER,
    ambiente.AUTH_JWT_AUDIENCE, ambiente.AUTH_ACCESS_TTL_SECONDS);
  const hashSenhaReferencia = await protecaoDeSenhas.gerarHashDaSenha(randomBytes(32).toString('base64url'));
  const tokensRenovacao = new TokensRenovacaoCriptograficos();
  const consultaIdentidade = new ConsultaDeIdentidadeAutenticada(repositorioAutenticacao, tokensAcesso);
  const gestaoSessoes = new GestaoSessoes(new RepositorioGestaoSessoesPrisma(prisma), repositorioAutenticacao,
    consultaIdentidade, tokensAcesso, tokensRenovacao, new TokensSelecaoCriptograficos(), ambiente.AUTH_ACCESS_TTL_SECONDS, ambiente.AUTH_REFRESH_TTL_SECONDS);
  return {
    gestaoSessoes,
    autenticacao: new AutenticacaoDeUsuario(repositorioAutenticacao, protecaoDeSenhas, tokensAcesso, tokensRenovacao, {
      hashSenhaReferencia, validadeAcessoSegundos: ambiente.AUTH_ACCESS_TTL_SECONDS,
      validadeRenovacaoSegundos: ambiente.AUTH_REFRESH_TTL_SECONDS,
    }, undefined, gestaoSessoes, new AuditoriaAutenticacaoPrisma(prisma)),
    consultaIdentidade,
    renovacao: new RenovacaoDeSessao(repositorioAutenticacao, tokensRenovacao, tokensAcesso, ambiente.AUTH_ACCESS_TTL_SECONDS),
    encerramento: new EncerramentoDeSessao(repositorioAutenticacao, tokensRenovacao),
    origemFrontend: ambiente.AUTH_FRONTEND_ORIGIN,
    deveUsarCookieSeguro: ambiente.NODE_ENV === 'production',
    validadeRenovacaoSegundos: ambiente.AUTH_REFRESH_TTL_SECONDS,
  };
}
