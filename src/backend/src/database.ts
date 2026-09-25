import { PrismaClient } from '@prisma/client';
import type { VerificadorSaudeBanco } from './database-health-checker.js';

const TEMPO_LIMITE_CONEXAO_SEGUNDOS = 5;
const TEMPO_LIMITE_POOL_SEGUNDOS = 5;
const TEMPO_LIMITE_SOCKET_SEGUNDOS = 10;

export function criarClientePrisma(urlBancoDados: string): PrismaClient {
  const url = new URL(urlBancoDados);
  // Enforce finite waits even when the supplied URL disables a timeout with 0.
  url.searchParams.set('connect_timeout', String(TEMPO_LIMITE_CONEXAO_SEGUNDOS));
  url.searchParams.set('pool_timeout', String(TEMPO_LIMITE_POOL_SEGUNDOS));
  url.searchParams.set('socket_timeout', String(TEMPO_LIMITE_SOCKET_SEGUNDOS));

  return new PrismaClient({
    datasources: { db: { url: url.toString() } },
  });
}

export function criarVerificadorSaudePrisma(
  prisma: PrismaClient,
): VerificadorSaudeBanco {
  return {
    async verificarConexaoComBanco(): Promise<void> {
      await prisma.$transaction(
        async (transacao) => {
          // PostgreSQL cancels the statement; SET LOCAL ends with the transaction.
          await transacao.$executeRaw`SET LOCAL statement_timeout = '5s'`;
          await transacao.$queryRaw`SELECT 1`;
        },
        { maxWait: TEMPO_LIMITE_POOL_SEGUNDOS * 1000, timeout: 10000 },
      );
    },
  };
}
