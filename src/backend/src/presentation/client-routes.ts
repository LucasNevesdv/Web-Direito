import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { GestaoClientes } from '../application/clients/manage-clients.js';
import { ErroCliente } from '../application/clients/client-policy.js';
import type { EnderecoCliente } from '../domain/clients/client.js';
import { ErroClienteInvalido } from '../domain/clients/invalid-client-error.js';
import {
  ErroTokenAcessoInvalido,
  ErroPrimeiroAcessoObrigatorio,
} from '../application/authentication/authentication-errors.js';

const TIPO_PESSOA = z.enum(['PESSOA_FISICA', 'PESSOA_JURIDICA']);
const SITUACAO = z.enum(['ATIVO', 'INATIVO']);
const VERSAO = z.number().int().nonnegative();

const ENDERECO_SCHEMA = z
  .object({
    cep: z.string().nullish(),
    logradouro: z.string().nullish(),
    numero: z.string().nullish(),
    complemento: z.string().nullish(),
    bairro: z.string().nullish(),
    cidade: z.string().nullish(),
    uf: z.string().nullish(),
  })
  .strict();

function converterEndereco(end: z.infer<typeof ENDERECO_SCHEMA> | null | undefined): EnderecoCliente | null {
  if (!end) return null;
  return {
    cep: end.cep ?? null,
    logradouro: end.logradouro ?? null,
    numero: end.numero ?? null,
    complemento: end.complemento ?? null,
    bairro: end.bairro ?? null,
    cidade: end.cidade ?? null,
    uf: end.uf ?? null,
  };
}

const CONTATO_INICIAL_SCHEMA = z
  .object({
    nome: z.string().min(1).max(120),
    cargoOuRelacao: z.string().max(80).nullish(),
    email: z.string().max(254).nullish(),
    telefone: z.string().max(30).nullish(),
    observacao: z.string().max(500).nullish(),
  })
  .strict();

const MENSAGENS: Record<string, string> = {
  PROIBIDO: 'Você não tem autorização para esta operação.',
  NAO_ENCONTRADO: 'Cliente não encontrado neste escritório.',
  DOCUMENTO_JA_CADASTRADO: 'Já existe um cliente cadastrado com este CPF/CNPJ neste escritório.',
  POSSIVEL_DUPLICIDADE: 'Foram encontrados clientes com dados semelhantes neste escritório.',
  RESPONSAVEL_INVALIDO: 'O advogado responsável informado é inválido ou não pertence ao escritório.',
  CONFLITO: 'Os dados ou a versão do cliente mudaram. Atualize a página e tente novamente.',
  DADOS_INVALIDOS: 'Confira os dados informados do cliente.',
};

export function registrarRotasClientes(
  aplicacao: FastifyInstance,
  clientes: GestaoClientes,
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
      if (erro instanceof ErroCliente) {
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
        erro instanceof ErroClienteInvalido ||
        (erro as { statusCode?: number }).statusCode === 413 ||
        (erro as { name?: string }).name === 'ZodError'
      ) {
        return resposta.status(400).send({ erro: 'DADOS_INVALIDOS', mensagem: MENSAGENS.DADOS_INVALIDOS });
      }
      return resposta.status(503).send({ erro: 'INDISPONIVEL', mensagem: 'Não foi possível concluir. Tente novamente.' });
    });

    const token = (req: FastifyRequest) => req.headers.authorization!.match(/^Bearer (\S+)$/i)![1]!;
    const extrairId = (req: FastifyRequest) => z.object({ id: z.string().uuid() }).strict().parse(req.params).id;

    rotas.get('/api/v1/clientes', async (requisicao) => {
      const filtro = z
        .object({
          pagina: z.coerce.number().int().min(1).max(10000).default(1),
          tamanhoPagina: z.coerce.number().int().min(1).max(50).default(10),
          pesquisa: z.string().trim().max(254).default(''),
          situacao: SITUACAO.optional(),
          tipoPessoa: TIPO_PESSOA.optional(),
          idVinculoResponsavel: z.string().uuid().optional(),
        })
        .strict()
        .parse(requisicao.query);

      return clientes.listarClientes(token(requisicao), filtro);
    });

    rotas.post(
      '/api/v1/clientes/verificar-duplicidades',
      { bodyLimit: 4096 },
      async (requisicao) => {
        const dados = z
          .object({
            tipoPessoa: TIPO_PESSOA.nullish(),
            documento: z.string().min(1).max(30),
            nome: z.string().min(1).max(256),
            email: z.string().max(254).nullish(),
            telefone: z.string().max(30).nullish(),
            ignorarIdCliente: z.string().uuid().nullish(),
          })
          .strict()
          .parse(requisicao.body);

        return clientes.verificarDuplicidades(token(requisicao), {
          tipoPessoa: dados.tipoPessoa ?? undefined,
          documento: dados.documento,
          nome: dados.nome,
          email: dados.email ?? undefined,
          telefone: dados.telefone ?? undefined,
          ignorarIdCliente: dados.ignorarIdCliente ?? undefined,
        });
      },
    );

    rotas.post('/api/v1/clientes', { bodyLimit: 16384 }, async (requisicao, resposta) => {
      const dados = z
        .object({
          tipoPessoa: TIPO_PESSOA,
          nome: z.string().min(1).max(256),
          nomeSocial: z.string().max(256).nullish(),
          documento: z.string().min(1).max(30),
          email: z.string().max(254).nullish(),
          telefone: z.string().max(30).nullish(),
          endereco: ENDERECO_SCHEMA.nullish(),
          observacoesInternas: z.string().max(4000).nullish(),
          idVinculoResponsavel: z.string().uuid().nullish(),
          contatosIniciais: z.array(CONTATO_INICIAL_SCHEMA).max(20).optional(),
          confirmarDuplicidadePotencial: z.boolean().optional(),
        })
        .strict()
        .parse(requisicao.body);

      const novoCliente = await clientes.cadastrarCliente(token(requisicao), {
        tipoPessoa: dados.tipoPessoa,
        nome: dados.nome,
        nomeSocial: dados.nomeSocial ?? undefined,
        documento: dados.documento,
        email: dados.email ?? undefined,
        telefone: dados.telefone ?? undefined,
        endereco: converterEndereco(dados.endereco),
        observacoesInternas: dados.observacoesInternas ?? undefined,
        idVinculoResponsavel: dados.idVinculoResponsavel ?? undefined,
        contatosIniciais: dados.contatosIniciais,
        confirmarDuplicidadePotencial: dados.confirmarDuplicidadePotencial,
      });

      return resposta.status(201).send(novoCliente);
    });

    rotas.get('/api/v1/clientes/:id', async (requisicao) => {
      return clientes.consultarCliente(token(requisicao), extrairId(requisicao));
    });

    rotas.patch('/api/v1/clientes/:id', { bodyLimit: 16384 }, async (requisicao) => {
      const id = extrairId(requisicao);
      const dados = z
        .object({
          nome: z.string().min(1).max(256),
          nomeSocial: z.string().max(256).nullish(),
          documento: z.string().min(1).max(30),
          email: z.string().max(254).nullish(),
          telefone: z.string().max(30).nullish(),
          endereco: ENDERECO_SCHEMA.nullish(),
          observacoesInternas: z.string().max(4000).nullish(),
          idVinculoResponsavel: z.string().uuid().nullish(),
          versao: VERSAO,
        })
        .strict()
        .parse(requisicao.body);

      return clientes.editarCliente(token(requisicao), id, {
        nome: dados.nome,
        nomeSocial: dados.nomeSocial ?? undefined,
        documento: dados.documento,
        email: dados.email ?? undefined,
        telefone: dados.telefone ?? undefined,
        endereco: converterEndereco(dados.endereco),
        observacoesInternas: dados.observacoesInternas ?? undefined,
        idVinculoResponsavel: dados.idVinculoResponsavel ?? undefined,
        versao: dados.versao,
      });
    });

    rotas.post('/api/v1/clientes/:id/inativar', { bodyLimit: 2048 }, async (requisicao) => {
      const id = extrairId(requisicao);
      const dados = z
        .object({
          versao: VERSAO,
          motivo: z.string().max(500).nullish(),
        })
        .strict()
        .parse(requisicao.body);

      return clientes.definirSituacaoCliente(token(requisicao), id, false, dados.versao, dados.motivo);
    });

    rotas.post('/api/v1/clientes/:id/ativar', { bodyLimit: 2048 }, async (requisicao) => {
      const id = extrairId(requisicao);
      const dados = z
        .object({
          versao: VERSAO,
          motivo: z.string().max(500).nullish(),
        })
        .strict()
        .parse(requisicao.body);

      return clientes.definirSituacaoCliente(token(requisicao), id, true, dados.versao, dados.motivo);
    });

    rotas.get('/api/v1/clientes/:id/linha-do-tempo', async (requisicao) => {
      return clientes.consultarLinhaDoTempo(token(requisicao), extrairId(requisicao));
    });

    rotas.get('/api/v1/clientes/:id/vinculos', async (requisicao) => {
      return clientes.consultarVinculos(token(requisicao), extrairId(requisicao));
    });

    const extrairIdsContato = (req: FastifyRequest) =>
      z
        .object({
          id: z.string().uuid(),
          idContato: z.string().uuid(),
        })
        .strict()
        .parse(req.params);

    const CONTATO_MUTACAO_SCHEMA = z
      .object({
        nome: z.string().min(1).max(120),
        cargoOuRelacao: z.string().max(80).nullish(),
        email: z.string().max(254).nullish(),
        telefone: z.string().max(30).nullish(),
        observacao: z.string().max(500).nullish(),
      })
      .strict();

    rotas.post('/api/v1/clientes/:id/contatos', { bodyLimit: 4096 }, async (requisicao, resposta) => {
      const id = extrairId(requisicao);
      const dados = CONTATO_MUTACAO_SCHEMA.parse(requisicao.body);
      const contato = await clientes.adicionarContato(token(requisicao), id, {
        nome: dados.nome,
        cargoOuRelacao: dados.cargoOuRelacao ?? undefined,
        email: dados.email ?? undefined,
        telefone: dados.telefone ?? undefined,
        observacao: dados.observacao ?? undefined,
      });
      return resposta.status(201).send(contato);
    });

    rotas.patch('/api/v1/clientes/:id/contatos/:idContato', { bodyLimit: 4096 }, async (requisicao) => {
      const { id, idContato } = extrairIdsContato(requisicao);
      const dados = CONTATO_MUTACAO_SCHEMA.parse(requisicao.body);
      return clientes.editarContato(token(requisicao), id, idContato, {
        nome: dados.nome,
        cargoOuRelacao: dados.cargoOuRelacao ?? undefined,
        email: dados.email ?? undefined,
        telefone: dados.telefone ?? undefined,
        observacao: dados.observacao ?? undefined,
      });
    });

    rotas.delete('/api/v1/clientes/:id/contatos/:idContato', async (requisicao, resposta) => {
      const { id, idContato } = extrairIdsContato(requisicao);
      await clientes.removerContato(token(requisicao), id, idContato);
      return resposta.status(204).send();
    });
  });
}
