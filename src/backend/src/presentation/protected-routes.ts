import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ErroPrimeiroAcessoObrigatorio, ErroTokenAcessoInvalido } from '../application/authentication/authentication-errors.js';
import { TIPOS_VINCULO } from '../application/links/business-links.js';

export type ErroDeNegocio = Error & { codigo: string; situacao: number };
export const ESQUEMA_ID = z.object({ id: z.string().uuid() });
export const ESQUEMA_VINCULO = z.object({ tipo: z.enum(TIPOS_VINCULO), id: z.string().uuid() }).strict().nullable();
export const ESQUEMA_PAGINACAO = { pagina: z.coerce.number().int().min(1).max(10000).default(1), tamanhoPagina: z.coerce.number().int().min(1).max(50).default(20) };

export const tokenDaRequisicao = (requisicao: FastifyRequest) => requisicao.headers.authorization!.match(/^Bearer (\S+)$/i)![1];
export const idDaRequisicao = (requisicao: FastifyRequest) => ESQUEMA_ID.parse(requisicao.params).id;

// Exige token Bearer, origem do frontend em escritas e respostas sem cache; erros não revelam detalhes internos.
export function protegerRotas(rotas: FastifyInstance, origemFrontend: string, erroDeNegocio: (erro: unknown) => erro is ErroDeNegocio,
  mensagens: Record<string, string>): void {
  rotas.addHook('onSend', async (_requisicao, resposta, corpo) => { resposta.header('Cache-Control', 'no-store'); return corpo; });
  rotas.addHook('onRequest', async (requisicao, resposta) => {
    if (!['GET', 'HEAD'].includes(requisicao.method) && requisicao.headers.origin !== origemFrontend) return resposta.status(403).send({ erro: 'PROIBIDO', mensagem: mensagens.PROIBIDO });
    if (!requisicao.headers.authorization?.match(/^Bearer (\S+)$/i)) throw new ErroTokenAcessoInvalido();
  });
  rotas.setErrorHandler((erro, _requisicao, resposta) => {
    if (erro instanceof ErroTokenAcessoInvalido) return resposta.status(401).send({ erro: 'NAO_AUTORIZADO', mensagem: 'Entre novamente para continuar.' });
    if (erro instanceof ErroPrimeiroAcessoObrigatorio) return resposta.status(403).send({ erro: 'PRIMEIRO_ACESSO_OBRIGATORIO', mensagem: 'Conclua o primeiro acesso.' });
    if (erroDeNegocio(erro)) return resposta.status(erro.situacao).send({ erro: erro.codigo, mensagem: mensagens[erro.codigo] });
    const codigoFastify = (erro as { statusCode?: number; code?: string });
    if (codigoFastify.statusCode === 413 || codigoFastify.code === 'FST_REQ_FILE_TOO_LARGE') return resposta.status(413).send({ erro: 'ARQUIVO_GRANDE', mensagem: mensagens.ARQUIVO_GRANDE ?? mensagens.DADOS_INVALIDOS });
    if (erro instanceof z.ZodError || codigoFastify.statusCode === 400 || codigoFastify.statusCode === 406 || codigoFastify.statusCode === 415) return resposta.status(400).send({ erro: 'DADOS_INVALIDOS', mensagem: mensagens.DADOS_INVALIDOS });
    return resposta.status(503).send({ erro: 'INDISPONIVEL', mensagem: 'Não foi possível concluir. Tente novamente.' });
  });
}
