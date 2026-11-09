import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GestaoAgenda } from '../application/agenda/manage-agenda.js';
import { TIPOS_COMPROMISSO } from '../application/agenda/agenda-contracts.js';
import { ErroAgenda, MENSAGENS_AGENDA } from '../application/agenda/agenda-policy.js';
import { ESQUEMA_VINCULO, idDaRequisicao, protegerRotas, tokenDaRequisicao } from './protected-routes.js';

const INSTANTE = z.string().datetime({ offset: true });
const DADOS = z.object({ titulo: z.string().min(3).max(200), descricao: z.string().max(4000).default(''), tipo: z.enum(TIPOS_COMPROMISSO),
  inicio: INSTANTE, fim: INSTANTE, local: z.string().max(500).default(''), linkRemoto: z.string().max(2000).default(''),
  participantes: z.array(z.string().uuid()).min(1).max(50), vinculo: ESQUEMA_VINCULO.default(null),
  lembreteMinutos: z.number().int().min(0).max(10080).nullable().default(null), confirmarConflito: z.boolean().default(false) });
const FILTRO = z.object({ inicio: INSTANTE, fim: INSTANTE, idParticipante: z.string().uuid().optional(), tipo: z.enum(TIPOS_COMPROMISSO).optional(),
  pagina: z.coerce.number().int().min(1).max(10000).default(1), tamanhoPagina: z.coerce.number().int().min(1).max(100).default(100) }).strict();

export function registrarRotasAgenda(app: FastifyInstance, agenda: GestaoAgenda, origem: string) {
  app.register(async (rotas) => {
    protegerRotas(rotas, origem, (erro): erro is ErroAgenda => erro instanceof ErroAgenda, MENSAGENS_AGENDA);
    const token = tokenDaRequisicao, id = idDaRequisicao;
    rotas.get('/api/v1/agenda/configuracao', (r) => agenda.configuracao(token(r)));
    rotas.get('/api/v1/agenda', (r) => agenda.listar(token(r), FILTRO.parse(r.query)));
    rotas.get('/api/v1/agenda/proximos', (r) => agenda.proximos(token(r), FILTRO.parse(r.query)));
    rotas.get('/api/v1/agenda/itens-civis', (r) => agenda.itensCivis(token(r), FILTRO.parse(r.query)));
    rotas.get('/api/v1/agenda/lembretes', (r) => agenda.lembretes(token(r)));
    rotas.post('/api/v1/agenda/lembretes/:id/lida', { bodyLimit: 1024 }, async (r, resposta) => {
      await agenda.marcarLembrete(token(r), id(r)); return resposta.status(204).send();
    });
    rotas.post('/api/v1/agenda', { bodyLimit: 16384 }, async (r, resposta) => resposta.status(201).send(await agenda.criar(token(r), DADOS.strict().parse(r.body))));
    rotas.get('/api/v1/agenda/:id', (r) => agenda.consultar(token(r), id(r)));
    rotas.get('/api/v1/agenda/:id/historico', (r) => agenda.historico(token(r), id(r)));
    rotas.patch('/api/v1/agenda/:id', { bodyLimit: 16384 }, (r) => agenda.alterar(token(r), id(r), DADOS.extend({ versao: z.number().int().nonnegative() }).strict().parse(r.body)));
    rotas.post('/api/v1/agenda/:id/situacao', { bodyLimit: 4096 }, (r) => agenda.situacao(token(r), id(r), z.object({
      situacao: z.enum(['REALIZADO', 'CANCELADO']), versao: z.number().int().nonnegative(), observacao: z.string().max(2000).default(''),
    }).strict().parse(r.body)));
  });
}
