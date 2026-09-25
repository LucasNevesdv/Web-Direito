import type { PrismaClient } from '@prisma/client';
import type { DecisaoLimiteRequisicoes, PoliticaLimiteRequisicoes, EscopoLimiteRequisicoes, ArmazenamentoLimiteRequisicoes } from '../../application/security/rate-limiter.js';

export class ArmazenamentoLimiteRequisicoesPrisma implements ArmazenamentoLimiteRequisicoes {
  constructor(private readonly prisma: Pick<PrismaClient, '$queryRaw' | '$executeRaw'>) {}

  async incrementarContadorDaJanela(escopo: EscopoLimiteRequisicoes, hashChave: string, politica: PoliticaLimiteRequisicoes): Promise<DecisaoLimiteRequisicoes> {
    // The database clock and ON CONFLICT serialize increments across all processes.
    const [decisaoDoLimite] = await this.prisma.$queryRaw<DecisaoLimiteRequisicoes[]>`
      INSERT INTO rate_limit_buckets (scope, key_hash, window_start, count, expires_at)
      SELECT ${escopo}, ${hashChave}, start_at, 1, start_at + make_interval(secs => ${politica.janelaSegundos}::int)
      FROM (SELECT to_timestamp(floor(extract(epoch FROM clock_timestamp()) / ${politica.janelaSegundos}::int) * ${politica.janelaSegundos}::int) AS start_at) AS bucket_window
      ON CONFLICT (scope, key_hash, window_start) DO UPDATE
      SET count = LEAST(rate_limit_buckets.count + 1, ${politica.limite + 1}::int)
      RETURNING count <= ${politica.limite}::int AS "podeProsseguir",
        GREATEST(1, ceil(extract(epoch FROM expires_at - clock_timestamp())))::int AS "tentarAposSegundos"
    `;
    if (!decisaoDoLimite) throw new Error('Rate limiter unavailable');
    return decisaoDoLimite;
  }

  async removerLimitesExpirados(): Promise<number> {
    return this.prisma.$executeRaw`
      WITH expired AS (
        SELECT scope, key_hash, window_start FROM rate_limit_buckets
        WHERE expires_at <= clock_timestamp()
        ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED
      )
      DELETE FROM rate_limit_buckets AS bucket USING expired
      WHERE bucket.scope = expired.scope AND bucket.key_hash = expired.key_hash
        AND bucket.window_start = expired.window_start
    `;
  }
}
