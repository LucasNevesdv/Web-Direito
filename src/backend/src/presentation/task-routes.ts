import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TIPOS_VINCULO } from '../application/links/business-links.js';
import type { GestaoTarefas } from '../application/tasks/manage-tasks.js';
import { ORIGENS_PRAZO, PERIODOS_TAREFA, PRIORIDADES_TAREFA, SITUACOES_PRAZO, SITUACOES_TAREFA } from '../application/tasks/task-contracts.js';
import { ErroTarefas } from '../application/tasks/task-policy.js';
import { dataCivilValida } from '../application/tasks/civil-date.js';
import { ESQUEMA_PAGINACAO, ESQUEMA_VINCULO, idDaRequisicao, protegerRotas, tokenDaRequisicao } from './protected-routes.js';

const DATA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const VERSAO = z.number().int().nonnegative();
const OBSERVACAO = z.string().max(2000).optional();
const TAREFA = z.object({ titulo: z.string().max(400), descricao: z.string().max(8000).default(''), prioridade: z.enum(PRIORIDADES_TAREFA),
  idResponsavel: z.string().uuid(), idRevisor: z.string().uuid().nullable().default(null), prazoInterno: DATA.nullable().default(null),
  vinculo: ESQUEMA_VINCULO.default(null) });
const PRAZO = z.object({ descricao: z.string().max(1000), dataLimite: DATA, origem: z.enum(ORIGENS_PRAZO), detalhesOrigem: z.string().max(1000).default(''),
  idResponsavel: z.string().uuid(), idTarefa: z.string().uuid().nullable().default(null), vinculo: ESQUEMA_VINCULO.default(null) });
const CHECKLIST = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('ADICIONAR'), titulo: z.string().max(400), versao: VERSAO }).strict(),
  z.object({ tipo: z.literal('MARCAR'), idItem: z.string().uuid(), concluido: z.boolean(), versao: VERSAO }).strict(),
  z.object({ tipo: z.literal('REMOVER'), idItem: z.string().uuid(), versao: VERSAO }).strict(),
]);
const MENSAGENS: Record<string, string> = {
  PROIBIDO: 'Você não tem autorização para esta operação.', NAO_ENCONTRADO: 'Registro não encontrado neste escritório.',
  CONFLITO: 'O registro foi alterado por outra pessoa. Atualize e tente novamente.', DADOS_INVALIDOS: 'Confira os dados informados.',
  TRANSICAO_INVALIDA: 'Esta mudança de situação não é permitida.', TAREFA_ENCERRADA: 'Reabra a tarefa antes de alterá-la.',
  PRAZO_ENCERRADO: 'Reabra o prazo antes de alterá-lo.', VINCULO_NAO_ENCONTRADO: 'O cliente, caso ou processo informado não existe neste escritório.',
  RESPONSAVEL_INVALIDO: 'Responsável e revisor devem ser membros ativos do escritório.',
};

export function registrarRotasTarefas(aplicacao: FastifyInstance, tarefas: GestaoTarefas, origemFrontend: string): void {
  aplicacao.register(async (rotas) => {
    protegerRotas(rotas, origemFrontend, (erro): erro is ErroTarefas => erro instanceof ErroTarefas, MENSAGENS);
    const token = tokenDaRequisicao, id = idDaRequisicao;
    const opcoes = { bodyLimit: 16384 };

    rotas.get('/api/v1/tarefas/configuracao', (requisicao) => tarefas.configuracaoDoUsuario(token(requisicao)));
    rotas.get('/api/v1/vinculos', (requisicao) => {
      const { tipo, pesquisa } = z.object({ tipo: z.enum(TIPOS_VINCULO), pesquisa: z.string().max(200).default('') }).strict().parse(requisicao.query);
      return tarefas.pesquisarVinculos(token(requisicao), tipo, pesquisa);
    });
    rotas.get('/api/v1/tarefas', (requisicao) => tarefas.listarTarefas(token(requisicao), z.object({ ...ESQUEMA_PAGINACAO,
      periodo: z.enum(PERIODOS_TAREFA).default('TODAS'), idResponsavel: z.string().uuid().optional(), situacao: z.enum(SITUACOES_TAREFA).optional(),
      prioridade: z.enum(PRIORIDADES_TAREFA).optional(), ate: DATA.refine(dataCivilValida).optional() }).strict().parse(requisicao.query)));
    rotas.post('/api/v1/tarefas', opcoes, async (requisicao, resposta) =>
      resposta.status(201).send(await tarefas.criarTarefa(token(requisicao), TAREFA.strict().parse(requisicao.body))));
    rotas.get('/api/v1/tarefas/:id', (requisicao) => tarefas.consultarTarefa(token(requisicao), id(requisicao)));
    rotas.patch('/api/v1/tarefas/:id', opcoes, (requisicao) =>
      tarefas.alterarTarefa(token(requisicao), id(requisicao), TAREFA.extend({ versao: VERSAO }).strict().parse(requisicao.body)));
    rotas.post('/api/v1/tarefas/:id/situacao', opcoes, (requisicao) => tarefas.alterarSituacaoTarefa(token(requisicao), id(requisicao),
      z.object({ situacao: z.enum(SITUACOES_TAREFA), observacao: OBSERVACAO, versao: VERSAO }).strict().parse(requisicao.body)));
    rotas.post('/api/v1/tarefas/:id/checklist', opcoes, (requisicao) => {
      const { versao, ...alteracao } = CHECKLIST.parse(requisicao.body);
      return tarefas.alterarChecklist(token(requisicao), id(requisicao), alteracao, versao);
    });
    rotas.get('/api/v1/tarefas/:id/historico', (requisicao) => tarefas.historicoTarefa(token(requisicao), id(requisicao)));

    rotas.get('/api/v1/prazos', (requisicao) => tarefas.listarPrazos(token(requisicao), z.object({ ...ESQUEMA_PAGINACAO,
      situacao: z.enum(SITUACOES_PRAZO).optional(), idResponsavel: z.string().uuid().optional(), idTarefa: z.string().uuid().optional(),
      ate: DATA.refine(dataCivilValida).optional(), depois: DATA.refine(dataCivilValida).optional(),
      somenteCriticos: z.enum(['true', 'false']).default('false').transform((valor) => valor === 'true') }).strict().parse(requisicao.query)));
    rotas.post('/api/v1/prazos', opcoes, async (requisicao, resposta) =>
      resposta.status(201).send(await tarefas.criarPrazo(token(requisicao), PRAZO.strict().parse(requisicao.body))));
    rotas.get('/api/v1/prazos/:id', (requisicao) => tarefas.consultarPrazo(token(requisicao), id(requisicao)));
    rotas.patch('/api/v1/prazos/:id', opcoes, (requisicao) =>
      tarefas.alterarPrazo(token(requisicao), id(requisicao), PRAZO.extend({ versao: VERSAO }).strict().parse(requisicao.body)));
    rotas.post('/api/v1/prazos/:id/situacao', opcoes, (requisicao) => tarefas.alterarSituacaoPrazo(token(requisicao), id(requisicao),
      z.object({ situacao: z.enum(SITUACOES_PRAZO), observacao: OBSERVACAO, versao: VERSAO }).strict().parse(requisicao.body)));
    rotas.get('/api/v1/prazos/:id/historico', (requisicao) => tarefas.historicoPrazo(token(requisicao), id(requisicao)));

    rotas.get('/api/v1/painel', (requisicao) => tarefas.painel(token(requisicao)));
    rotas.get('/api/v1/notificacoes', (requisicao) => tarefas.listarNotificacoes(token(requisicao)));
    rotas.post('/api/v1/notificacoes/:id/lida', { bodyLimit: 1024 }, async (requisicao, resposta) => {
      await tarefas.marcarNotificacaoLida(token(requisicao), id(requisicao));
      return resposta.status(204).send();
    });
  });
}
