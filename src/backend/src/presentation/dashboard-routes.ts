import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ErroPainel } from '../application/dashboard/dashboard-contracts.js';
import type { GestaoPainel } from '../application/dashboard/manage-dashboard.js';
import { protegerRotas, tokenDaRequisicao } from './protected-routes.js';

export function registrarRotasPainel(app: FastifyInstance, painel: GestaoPainel, origem: string) {
  app.register(async (rotas) => {
    protegerRotas(rotas, origem, (erro): erro is ErroPainel => erro instanceof ErroPainel,
      { DADOS_INVALIDOS: 'Selecione um período e um responsável válido do escritório.', PROIBIDO: 'Operação não permitida.' });
    rotas.get('/api/v1/painel/resumo', (r) => painel.consultar(tokenDaRequisicao(r), z.object({
      dias: z.coerce.number().refine((n) => [7, 30, 90].includes(n)).default(7),
      responsavel: z.union([z.literal('EU'), z.literal('TODOS'), z.string().uuid()]).default('EU'),
    }).strict().parse(r.query)));
  });
}
