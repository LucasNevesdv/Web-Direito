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
    'onboarding-ip': { limite: ambiente.RATE_LIMIT_ONBOARDING_MAX, janelaSegundos: ambiente.RATE_LIMIT_ONBOARDING_WINDOW_SECONDS },
    'login-ip': { limite: ambiente.RATE_LIMIT_LOGIN_IP_MAX, janelaSegundos: ambiente.RATE_LIMIT_LOGIN_WINDOW_SECONDS },
    'login-identity': { limite: ambiente.RATE_LIMIT_LOGIN_IDENTITY_MAX, janelaSegundos: ambiente.RATE_LIMIT_LOGIN_WINDOW_SECONDS },
    'refresh-ip': { limite: ambiente.RATE_LIMIT_REFRESH_MAX, janelaSegundos: ambiente.RATE_LIMIT_REFRESH_WINDOW_SECONDS },
  });
  return { limitador, iniciarLimpeza: () => iniciarLimpezaLimites(armazenamento, ambiente.RATE_LIMIT_CLEANUP_INTERVAL_MS) };
}
