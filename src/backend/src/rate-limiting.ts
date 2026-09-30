import type { PrismaClient } from '@prisma/client';
import { LimitadorRequisicoesCompartilhado } from './application/security/rate-limiter.js';
import type { Ambiente } from './environment.js';
import { ArmazenamentoLimiteRequisicoesPrisma } from './infrastructure/prisma/prisma-rate-limit-store.js';
import { ChavesLimiteRequisicoesHmac } from './infrastructure/security/hmac-rate-limit-keys.js';
import { iniciarLimpezaLimites } from './infrastructure/security/rate-limit-cleanup.js';

export function comporLimitacaoDeRequisicoes(prisma: PrismaClient, ambiente: Ambiente) {
  const armazenamento = new ArmazenamentoLimiteRequisicoesPrisma(prisma);
  const chaves = new ChavesLimiteRequisicoesHmac(ambiente.RATE_LIMIT_HMAC_SECRET ?? ambiente.AUTH_JWT_SECRET);
  const limitador = new LimitadorRequisicoesCompartilhado(armazenamento, chaves, {
    'recovery-ip': { limite: ambiente.RECUPERACAO_LIMITE_IP, janelaSegundos: ambiente.RECUPERACAO_JANELA_IP_SEGUNDOS },
    'recovery-email': { limite: ambiente.RECUPERACAO_LIMITE_EMAIL, janelaSegundos: ambiente.RECUPERACAO_JANELA_EMAIL_SEGUNDOS },
    'reset-ip': { limite: ambiente.REDEFINICAO_LIMITE, janelaSegundos: ambiente.REDEFINICAO_JANELA_SEGUNDOS },
    'reset-token': { limite: ambiente.REDEFINICAO_LIMITE, janelaSegundos: ambiente.REDEFINICAO_JANELA_SEGUNDOS },
    'password-change-ip': { limite: ambiente.ALTERACAO_SENHA_LIMITE, janelaSegundos: ambiente.ALTERACAO_SENHA_JANELA_SEGUNDOS },
    'password-change-user': { limite: ambiente.ALTERACAO_SENHA_LIMITE, janelaSegundos: ambiente.ALTERACAO_SENHA_JANELA_SEGUNDOS },
    'onboarding-ip': { limite: ambiente.RATE_LIMIT_ONBOARDING_MAX, janelaSegundos: ambiente.RATE_LIMIT_ONBOARDING_WINDOW_SECONDS },
    'login-ip': { limite: ambiente.RATE_LIMIT_LOGIN_IP_MAX, janelaSegundos: ambiente.RATE_LIMIT_LOGIN_WINDOW_SECONDS },
    'login-identity': { limite: ambiente.RATE_LIMIT_LOGIN_IDENTITY_MAX, janelaSegundos: ambiente.RATE_LIMIT_LOGIN_WINDOW_SECONDS },
    'refresh-ip': { limite: ambiente.RATE_LIMIT_REFRESH_MAX, janelaSegundos: ambiente.RATE_LIMIT_REFRESH_WINDOW_SECONDS },
  });
  return { limitador, iniciarLimpeza: () => iniciarLimpezaLimites(armazenamento, ambiente.RATE_LIMIT_CLEANUP_INTERVAL_MS) };
}
