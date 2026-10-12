import type { PrismaClient } from '@prisma/client';
import type { Ambiente } from '../environment.js';
import type { ProtecaoDeSenhas } from '../application/security/password-hasher.js';
import type { ServicosRotasAutenticacao } from '../presentation/authentication-routes.js';
import { RepositorioSenhasPrisma } from './prisma/prisma-password-repository.js';
import { RepositorioTrabalhosRecuperacaoPrisma } from './prisma/prisma-recovery-email-jobs.js';
import { EnvioRecuperacaoDeSenha } from '../application/passwords/deliver-password-recovery.js';
import { TokensRecuperacaoCriptograficos } from './security/crypto-password-recovery.js';
import { ProcessamentoRecuperacaoDeSenha } from './security/password-recovery-worker.js';
import { criarEnvioEmail } from './email/email-provider.js';
import { SolicitacaoRecuperacaoDeSenha } from '../application/passwords/request-password-recovery.js';
import { AlteracaoDeSenhaAutenticada, RedefinicaoDeSenha } from '../application/passwords/change-password.js';
import { TokensAcessoJose } from './security/jose-access-tokens.js';

export function comporServicosDeSenhas(prisma: PrismaClient, ambiente: Ambiente, protecao: ProtecaoDeSenhas, autenticacao: ServicosRotasAutenticacao) {
  const repositorio = new RepositorioSenhasPrisma(prisma);
  const tokens = new TokensRecuperacaoCriptograficos();
  const trabalhos = new RepositorioTrabalhosRecuperacaoPrisma(prisma);
  const registrarEvento = (evento: string) => console.info(JSON.stringify({ componente: 'envio_recuperacao', evento }));
  const envioEmail = criarEnvioEmail(ambiente);
  const envio = new EnvioRecuperacaoDeSenha(trabalhos, tokens, envioEmail, ambiente.URL_FRONTEND, {
    maximoTentativas: ambiente.EMAIL_FILA_MAX_TENTATIVAS, atrasoInicialSegundos: ambiente.EMAIL_FILA_ATRASO_INICIAL_SEGUNDOS,
    atrasoMaximoSegundos: ambiente.EMAIL_FILA_ATRASO_MAXIMO_SEGUNDOS,
  }, registrarEvento);
  const processamento = new ProcessamentoRecuperacaoDeSenha(trabalhos, envio, repositorio, {
    intervaloMs: ambiente.EMAIL_FILA_INTERVALO_MS, reservaSegundos: ambiente.EMAIL_FILA_LEASE_SEGUNDOS,
    prazoEncerramentoMs: ambiente.EMAIL_FILA_ENCERRAMENTO_MS, retencaoDias: ambiente.EMAIL_FILA_RETENCAO_DIAS,
  }, registrarEvento);
  return { processamento, servicos: {
    tokens, solicitacao: new SolicitacaoRecuperacaoDeSenha(trabalhos),
    redefinicao: new RedefinicaoDeSenha(repositorio, tokens, protecao),
    alteracao: new AlteracaoDeSenhaAutenticada(repositorio, protecao, new TokensAcessoJose(ambiente.AUTH_JWT_SECRET,
      ambiente.AUTH_JWT_ISSUER, ambiente.AUTH_JWT_AUDIENCE, ambiente.AUTH_ACCESS_TTL_SECONDS), autenticacao.consultaIdentidade),
  } };
}
