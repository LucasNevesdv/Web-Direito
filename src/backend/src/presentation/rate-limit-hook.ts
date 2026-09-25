import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LimitadorRequisicoes, EscopoLimiteRequisicoes } from '../application/security/rate-limiter.js';

export function criarTratadorDeLimiteDeRequisicoes(limitador: LimitadorRequisicoes, escopo: EscopoLimiteRequisicoes) {
  return async (requisicao: FastifyRequest, respostaHttp: FastifyReply) => {
    try {
      const corpo = requisicao.body as { email?: unknown } | null;
      const decisao = await limitador.registrarTentativaDeRequisicao(escopo, requisicao.ip, typeof corpo?.email === 'string' ? corpo.email : undefined);
      if (!decisao.podeProsseguir) return respostaHttp.header('Retry-After', decisao.tentarAposSegundos).status(429)
        .send({ erro: 'EXCESSO_TENTATIVAS', mensagem: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
    } catch {
      return respostaHttp.header('Retry-After', 5).status(503)
        .send({ erro: 'SERVICO_INDISPONIVEL', mensagem: 'Serviço temporariamente indisponível. Tente novamente.' });
    }
  };
}
