import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GestaoEquipe } from '../application/team/manage-team.js';
import { ErroEquipe, PERMISSOES_EQUIPE } from '../application/team/team-policy.js';
import { ErroUsuarioInvalido } from '../domain/users/invalid-user-error.js';
import { ErroTokenAcessoInvalido, ErroPrimeiroAcessoObrigatorio } from '../application/authentication/authentication-errors.js';
import type { LimitadorRequisicoes } from '../application/security/rate-limiter.js';
import { criarTratadorDeLimiteDeRequisicoes } from './rate-limit-hook.js';

const AUTORIZACAO = z.object({ papel: z.enum(['ADMINISTRADOR', 'ADVOGADO', 'ESTAGIARIO', 'SECRETARIO']), permissoes: z.array(z.enum(PERMISSOES_EQUIPE)).max(5) });
const EMAIL = z.string().trim().toLowerCase().email().max(254);
const VERSAO = z.number().int().nonnegative();
const MENSAGENS = { PROIBIDO: 'Você não tem autorização para esta operação.', NAO_ENCONTRADO: 'Usuário não encontrado neste escritório.',
  CONTA_EXISTENTE: 'Esta conta já existe e utilizará sua senha atual. Confirme explicitamente a criação do vínculo.',
  VINCULO_EXISTENTE: 'Este usuário já pertence ao escritório.', VINCULO_INATIVO: 'O vínculo está inativo. Reative-o em vez de cadastrar novamente.',
  CONFLITO: 'Os dados ou o estado mudaram. Atualize a lista e tente novamente.', DADOS_INVALIDOS: 'Confira os dados, a política de senha e a confirmação.' };
export function registrarRotasEquipe(aplicacao: FastifyInstance, equipe: GestaoEquipe, origemFrontend: string, limitador: LimitadorRequisicoes): void {
  aplicacao.register(async (rotas) => {
    rotas.addHook('onSend', async (_requisicao, resposta, corpo) => { resposta.header('Cache-Control', 'no-store'); return corpo; });
    rotas.addHook('onRequest', async (requisicao, resposta) => {
      if (!['GET', 'HEAD'].includes(requisicao.method) && requisicao.headers.origin !== origemFrontend) return resposta.status(403).send({ erro: 'PROIBIDO', mensagem: MENSAGENS.PROIBIDO });
      if (!requisicao.headers.authorization?.match(/^Bearer (\S+)$/i)) throw new ErroTokenAcessoInvalido();
    });
    rotas.setErrorHandler((erro, _requisicao, resposta) => {
      if (erro instanceof ErroTokenAcessoInvalido) return resposta.status(401).send({ erro: 'NAO_AUTORIZADO', mensagem: 'Entre novamente para continuar.' });
      if (erro instanceof ErroPrimeiroAcessoObrigatorio) return resposta.status(403).send({ erro: 'PRIMEIRO_ACESSO_OBRIGATORIO', mensagem: 'Conclua o primeiro acesso.' });
      if (erro instanceof ErroEquipe) return resposta.status(erro.situacao).send({ erro: erro.codigo, mensagem: MENSAGENS[erro.codigo] });
      if (erro instanceof z.ZodError || erro instanceof ErroUsuarioInvalido || (erro as { statusCode?: number }).statusCode === 413) return resposta.status(400).send({ erro: 'DADOS_INVALIDOS', mensagem: MENSAGENS.DADOS_INVALIDOS });
      return resposta.status(503).send({ erro: 'INDISPONIVEL', mensagem: 'Não foi possível concluir. Tente novamente.' });
    });
    const token = (requisicao: import('fastify').FastifyRequest) => requisicao.headers.authorization!.match(/^Bearer (\S+)$/i)![1];
    const id = (requisicao: import('fastify').FastifyRequest) => z.object({ id: z.string().uuid() }).parse(requisicao.params).id;
    rotas.get('/api/v1/equipe/usuarios/configuracao', (requisicao) => equipe.configuracao(token(requisicao)));
    rotas.get('/api/v1/equipe/usuarios', (requisicao) => equipe.listar(token(requisicao), z.object({ pagina: z.coerce.number().int().min(1).max(10000).default(1),
      tamanhoPagina: z.coerce.number().int().min(1).max(50).default(10), pesquisa: z.string().trim().max(254).default('') }).strict().parse(requisicao.query)));
    rotas.get('/api/v1/equipe/usuarios/:id', (requisicao) => equipe.consultar(token(requisicao), id(requisicao)));
    rotas.get('/api/v1/equipe/usuarios/:id/historico', (requisicao) => equipe.historico(token(requisicao), id(requisicao)));
    rotas.post('/api/v1/equipe/usuarios', { bodyLimit: 4096, onRequest: criarTratadorDeLimiteDeRequisicoes(limitador, 'team-create-ip') }, async (requisicao, resposta) => {
      const dados = AUTORIZACAO.extend({ nome: z.string().max(256), email: EMAIL, senhaTemporaria: z.string().max(256), confirmacaoSenhaTemporaria: z.string().max(256) }).strict().parse(requisicao.body);
      return resposta.status(201).send(await equipe.cadastrar(token(requisicao), dados));
    });
    rotas.post('/api/v1/equipe/usuarios/confirmar-vinculo', { bodyLimit: 4096, onRequest: criarTratadorDeLimiteDeRequisicoes(limitador, 'team-create-ip') }, async (requisicao, resposta) => {
      const dados = AUTORIZACAO.extend({ email: EMAIL, confirmacaoVinculo: z.literal(true) }).strict().parse(requisicao.body);
      return resposta.status(201).send(await equipe.confirmarVinculo(token(requisicao), dados));
    });
    rotas.patch('/api/v1/equipe/usuarios/:id', { bodyLimit: 4096 }, (requisicao) => equipe.alterar(token(requisicao), id(requisicao), AUTORIZACAO.extend({ versao: VERSAO }).strict().parse(requisicao.body)));
    for (const estaAtivo of [true, false]) rotas.post(`/api/v1/equipe/usuarios/:id/${estaAtivo ? 'ativar' : 'inativar'}`, { bodyLimit: 1024 }, (requisicao) =>
      equipe.definirSituacao(token(requisicao), id(requisicao), estaAtivo, z.object({ versao: VERSAO }).strict().parse(requisicao.body).versao));
  });
}
