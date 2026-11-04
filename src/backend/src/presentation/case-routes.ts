import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { GestaoCasosProcessos } from '../application/cases/manage-cases.js';
import { ErroCasoProcesso } from '../application/cases/case-policy.js';
import { ErroCasoInvalido } from '../domain/cases/invalid-case-error.js';
import {
  ErroTokenAcessoInvalido,
  ErroPrimeiroAcessoObrigatorio,
} from '../application/authentication/authentication-errors.js';

const NATUREZA = z.enum(['JUDICIAL', 'EXTRAJUDICIAL', 'ADMINISTRATIVO', 'CONSULTIVO']);
const PRIORIDADE = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']);
const SITUACAO = z.enum(['ATIVO', 'SUSPENSO', 'ENCERRADO', 'ARQUIVADO']);
const TIPO_PARTICIPACAO = z.enum([
  'PARTE_CONTRARIA',
  'ADVOGADO_CONTRARIO',
  'TERCEIRO_INTERESSADO',
  'TESTEMUNHA',
  'PERITO',
  'OUTRO',
]);
const VERSAO = z.number().int().nonnegative();
const VALOR_CENTAVOS = z.number().int().min(0).max(999_999_999_999_99);

const PARTE_SCHEMA = z
  .object({
    tipoParticipacao: TIPO_PARTICIPACAO,
    nome: z.string().trim().min(2).max(150),
    documento: z.string().trim().max(18).nullish(),
    oab: z.string().trim().max(20).nullish(),
    contato: z.string().trim().max(200).nullish(),
    observacao: z.string().trim().max(500).nullish(),
  })
  .strict();

const PARTE_EDICAO_SCHEMA = z
  .object({
    tipoParticipacao: TIPO_PARTICIPACAO.optional(),
    nome: z.string().trim().min(2).max(150).optional(),
    documento: z.string().trim().max(18).nullish(),
    oab: z.string().trim().max(20).nullish(),
    contato: z.string().trim().max(200).nullish(),
    observacao: z.string().trim().max(500).nullish(),
  })
  .strict();

const MENSAGENS: Record<string, string> = {
  PROIBIDO: 'Você não tem autorização para esta operação.',
  NAO_ENCONTRADO: 'Caso ou recurso não encontrado neste escritório.',
  CLIENTE_INVALIDO: 'O cliente informado é inválido, inativo ou não pertence ao escritório.',
  MEMBRO_EQUIPE_INVALIDO: 'O membro de equipe ou responsável informado é inválido ou não pertence ao escritório.',
  RESPONSAVEL_INVALIDO: 'O responsável deve possuir papel de Proprietário, Administrador ou Advogado.',
  CNJ_JA_VINCULADO_NO_CASO: 'Este número CNJ já está vinculado ao caso.',
  CASO_ARQUIVADO_SOMENTE_LEITURA: 'O caso está arquivado e é somente leitura. Reabra o caso para realizar alterações.',
  CONFLITO: 'Os dados ou a versão do caso mudaram. Atualize a página e tente novamente.',
  DADOS_INVALIDOS: 'Confira os dados informados do caso.',
};

export function registrarRotasCasos(
  aplicacao: FastifyInstance,
  casos: GestaoCasosProcessos,
  origemFrontend: string,
): void {
  aplicacao.register(async (rotas) => {
    rotas.addHook('onSend', async (_requisicao, resposta, corpo) => {
      resposta.header('Cache-Control', 'no-store');
      return corpo;
    });

    rotas.addHook('onRequest', async (requisicao, resposta) => {
      if (!['GET', 'HEAD'].includes(requisicao.method) && requisicao.headers.origin !== origemFrontend) {
        return resposta.status(403).send({ erro: 'PROIBIDO', mensagem: MENSAGENS.PROIBIDO });
      }
      if (!requisicao.headers.authorization?.match(/^Bearer (\S+)$/i)) {
        throw new ErroTokenAcessoInvalido();
      }
    });

    rotas.setErrorHandler((erro, _requisicao, resposta) => {
      if (erro instanceof ErroTokenAcessoInvalido) {
        return resposta.status(401).send({ erro: 'NAO_AUTORIZADO', mensagem: 'Entre novamente para continuar.' });
      }
      if (erro instanceof ErroPrimeiroAcessoObrigatorio) {
        return resposta.status(403).send({ erro: 'PRIMEIRO_ACESSO_OBRIGATORIO', mensagem: 'Conclua o primeiro acesso.' });
      }
      if (erro instanceof ErroCasoProcesso) {
        const corpoResposta: Record<string, unknown> = {
          erro: erro.codigo,
          mensagem: MENSAGENS[erro.codigo] ?? erro.message,
        };
        if (erro.detalhes && typeof erro.detalhes === 'object') {
          Object.assign(corpoResposta, erro.detalhes);
        }
        return resposta.status(erro.situacao).send(corpoResposta);
      }
      if (
        erro instanceof z.ZodError ||
        erro instanceof ErroCasoInvalido ||
        (erro as { statusCode?: number }).statusCode === 413 ||
        (erro as { name?: string }).name === 'ZodError'
      ) {
        return resposta.status(400).send({ erro: 'DADOS_INVALIDOS', mensagem: MENSAGENS.DADOS_INVALIDOS });
      }
      return resposta.status(503).send({ erro: 'INDISPONIVEL', mensagem: 'Não foi possível concluir. Tente novamente.' });
    });

    const token = (req: FastifyRequest) => req.headers.authorization!.match(/^Bearer (\S+)$/i)![1]!;
    const extrairId = (req: FastifyRequest) => z.object({ id: z.string().uuid() }).strict().parse(req.params).id;
    const extrairIds = (req: FastifyRequest) =>
      z.object({ id: z.string().uuid(), idParte: z.string().uuid() }).strict().parse(req.params);

    rotas.get('/api/v1/casos', async (requisicao) => {
      const filtro = z
        .object({
          pagina: z.coerce.number().int().min(1).max(10000).default(1),
          tamanhoPagina: z.coerce.number().int().min(1).max(50).default(20),
          pesquisa: z.string().trim().max(160).default(''),
          idCliente: z.string().uuid().optional(),
          numeroCnj: z.string().trim().max(30).optional(),
          natureza: NATUREZA.optional(),
          areaJuridica: z.string().trim().max(40).optional(),
          prioridade: PRIORIDADE.optional(),
          situacao: SITUACAO.optional(),
          idVinculoResponsavel: z.string().uuid().optional(),
          semResponsavel: z
            .preprocess((val) => (val === 'true' || val === true ? true : val === 'false' || val === false ? false : undefined), z.boolean().optional()),
          semAtividadeDesdeDias: z.coerce.number().int().min(1).max(365).optional(),
        })
        .strict()
        .parse(requisicao.query);

      return casos.listarCasos(token(requisicao), filtro);
    });

    rotas.post('/api/v1/casos', async (requisicao, resposta) => {
      const dados = z
        .object({
          titulo: z.string().trim().min(3).max(160),
          descricao: z.string().trim().max(4000).nullish(),
          natureza: NATUREZA,
          areaJuridica: z.string().trim().min(1).max(40),
          prioridade: PRIORIDADE.optional(),
          idVinculoResponsavel: z.string().uuid().nullish(),
          valorCausaCentavos: VALOR_CENTAVOS.nullish(),
          valorEnvolvidoCentavos: VALOR_CENTAVOS.nullish(),
          idsClientes: z.array(z.string().uuid()).min(1),
          idsVinculosEquipe: z.array(z.string().uuid()).optional(),
          partesIniciais: z.array(PARTE_SCHEMA).optional(),
        })
        .strict()
        .parse(requisicao.body);

      const novo = await casos.cadastrarCaso(token(requisicao), {
        ...dados,
        descricao: dados.descricao ?? null,
        idVinculoResponsavel: dados.idVinculoResponsavel ?? null,
        valorCausaCentavos: dados.valorCausaCentavos ?? null,
        valorEnvolvidoCentavos: dados.valorEnvolvidoCentavos ?? null,
      });

      return resposta.status(201).send(novo);
    });

    rotas.get('/api/v1/casos/:id', async (requisicao) => {
      return casos.consultarCasoPorId(token(requisicao), extrairId(requisicao));
    });

    rotas.patch('/api/v1/casos/:id', async (requisicao) => {
      const idCaso = extrairId(requisicao);
      const dados = z
        .object({
          titulo: z.string().trim().min(3).max(160).optional(),
          descricao: z.string().trim().max(4000).nullish(),
          natureza: NATUREZA.optional(),
          areaJuridica: z.string().trim().min(1).max(40).optional(),
          prioridade: PRIORIDADE.optional(),
          situacao: SITUACAO.optional(),
          idVinculoResponsavel: z.string().uuid().nullish(),
          valorCausaCentavos: VALOR_CENTAVOS.nullish(),
          valorEnvolvidoCentavos: VALOR_CENTAVOS.nullish(),
          idsClientes: z.array(z.string().uuid()).min(1).optional(),
          idsVinculosEquipe: z.array(z.string().uuid()).optional(),
          versao: VERSAO,
        })
        .strict()
        .parse(requisicao.body);

      return casos.editarCaso(token(requisicao), idCaso, dados);
    });

    rotas.post('/api/v1/casos/:id/arquivar', async (requisicao) => {
      const idCaso = extrairId(requisicao);
      const dados = z
        .object({
          versao: VERSAO,
          motivo: z.string().trim().max(500).optional(),
        })
        .strict()
        .parse(requisicao.body);

      return casos.arquivarCaso(token(requisicao), idCaso, dados);
    });

    rotas.post('/api/v1/casos/:id/reabrir', async (requisicao) => {
      const idCaso = extrairId(requisicao);
      const dados = z
        .object({
          versao: VERSAO,
          motivo: z.string().trim().max(500).optional(),
        })
        .strict()
        .parse(requisicao.body);

      return casos.reabrirCaso(token(requisicao), idCaso, dados);
    });

    rotas.post('/api/v1/casos/:id/partes', async (requisicao, resposta) => {
      const idCaso = extrairId(requisicao);
      const dados = PARTE_SCHEMA.parse(requisicao.body);
      const novaParte = await casos.adicionarParte(token(requisicao), idCaso, dados);
      return resposta.status(201).send(novaParte);
    });

    rotas.patch('/api/v1/casos/:id/partes/:idParte', async (requisicao) => {
      const { id, idParte } = extrairIds(requisicao);
      const dados = PARTE_EDICAO_SCHEMA.parse(requisicao.body);
      return casos.editarParte(token(requisicao), id, idParte, dados);
    });

    rotas.delete('/api/v1/casos/:id/partes/:idParte', async (requisicao, resposta) => {
      const { id, idParte } = extrairIds(requisicao);
      await casos.removerParte(token(requisicao), id, idParte);
      return resposta.status(204).send();
    });

    rotas.get('/api/v1/casos/:id/linha-do-tempo', async (requisicao) => {
      const idCaso = extrairId(requisicao);
      const query = z
        .object({
          idProcesso: z.string().uuid().optional(),
        })
        .strict()
        .parse(requisicao.query);

      return casos.consultarLinhaDoTempo(token(requisicao), idCaso, query);
    });
  });
}
