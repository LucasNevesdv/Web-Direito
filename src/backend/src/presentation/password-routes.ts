import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { z } from 'zod';
import type { AlteracaoDeSenhaAutenticada, RedefinicaoDeSenha } from '../application/passwords/change-password.js';
import type { SolicitacaoRecuperacaoDeSenha } from '../application/passwords/request-password-recovery.js';
import type { TokensRecuperacao } from '../application/passwords/password-contracts.js';
import { ErroTrocaDeSenha } from '../application/passwords/password-errors.js';
import { ErroTokenAcessoInvalido } from '../application/authentication/authentication-errors.js';
import type { ServicosRotasAutenticacao } from './authentication-routes.js';
import type { EscopoLimiteRequisicoes, LimitadorRequisicoes } from '../application/security/rate-limiter.js';
import { criarTratadorDeLimiteDeRequisicoes } from './rate-limit-hook.js';

export interface ServicosRotasSenhas {
  solicitacao: Pick<SolicitacaoRecuperacaoDeSenha, 'solicitarRecuperacao'>;
  redefinicao: Pick<RedefinicaoDeSenha, 'redefinirSenha'>;
  alteracao: Pick<AlteracaoDeSenhaAutenticada, 'alterarSenha'>;
  tokens: Pick<TokensRecuperacao, 'calcularHash'>;
}
const CONFIRMACAO = { mensagem: 'Se houver uma conta elegível, enviaremos as instruções de recuperação por e-mail.' };
const NOVA_SENHA = z.object({ novaSenha: z.string().max(256), confirmacaoNovaSenha: z.string().max(256) });
const MENSAGENS = {
  TOKEN_INVALIDO: 'Link inválido, utilizado ou expirado. Solicite uma nova recuperação.',
  SENHA_INVALIDA: 'A nova senha deve ter entre 12 e 128 caracteres.',
  CONFIRMACAO_DIFERENTE: 'A confirmação deve ser igual à nova senha.',
  SENHA_REPETIDA: 'A nova senha deve ser diferente da atual.',
  SENHA_ATUAL_INCORRETA: 'Não foi possível confirmar sua senha atual.',
};
export function registrarRotasSenhas(aplicacao: FastifyInstance, servicos: ServicosRotasSenhas,
  autenticacao: ServicosRotasAutenticacao, limitador: LimitadorRequisicoes): void {
  aplicacao.register(async (rotas) => {
    await rotas.register(cookie);
    rotas.addHook('onSend', async (_requisicao, resposta, corpo) => { resposta.header('Cache-Control', 'no-store'); return corpo; });
    rotas.addHook('onRequest', async (requisicao, resposta) => {
      if (requisicao.headers.origin !== autenticacao.origemFrontend) return resposta.status(403).send({ erro: 'PROIBIDO', mensagem: 'Solicitação não permitida.' });
    });
    rotas.setErrorHandler((erro, _requisicao, resposta) => {
      if (erro instanceof ErroTrocaDeSenha) return resposta.status(400).send({ erro: erro.codigo, mensagem: MENSAGENS[erro.codigo] });
      if (erro instanceof ErroTokenAcessoInvalido) return resposta.status(401).send({ erro: 'NAO_AUTORIZADO', mensagem: 'Entre novamente para continuar.' });
      return resposta.status(erro instanceof z.ZodError || (erro as { statusCode?: number }).statusCode === 413 ? 400 : 503)
        .send({ erro: 'SOLICITACAO_NAO_CONCLUIDA', mensagem: 'Confira os dados e tente novamente.' });
    });
    async function limitarIdentificador(escopo: EscopoLimiteRequisicoes, ip: string, identificador: string, resposta: import('fastify').FastifyReply) {
      const decisao = await limitador.registrarTentativaDeRequisicao(escopo, ip, identificador);
      if (!decisao.podeProsseguir) {
        resposta.header('Retry-After', decisao.tentarAposSegundos).status(429).send({ erro: 'EXCESSO_TENTATIVAS', mensagem: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
        return false;
      }
      return true;
    }
    rotas.post('/api/v1/auth/recuperar-senha', { bodyLimit: 4096, onRequest: criarTratadorDeLimiteDeRequisicoes(limitador, 'recovery-ip') }, async (requisicao, resposta) => {
      const corpo = z.object({ email: z.string().trim().toLowerCase().min(1).max(254) }).strict().parse(requisicao.body);
      if (!await limitarIdentificador('recovery-email', requisicao.ip, corpo.email, resposta)) return;
      await servicos.solicitacao.solicitarRecuperacao(corpo.email);
      return resposta.status(202).send(CONFIRMACAO);
    });
    rotas.post('/api/v1/auth/redefinir-senha', { bodyLimit: 4096, onRequest: criarTratadorDeLimiteDeRequisicoes(limitador, 'reset-ip') }, async (requisicao, resposta) => {
      const corpo = NOVA_SENHA.extend({ token: z.string().max(256) }).strict().parse(requisicao.body);
      if (!await limitarIdentificador('reset-token', requisicao.ip, servicos.tokens.calcularHash(corpo.token), resposta)) return;
      await servicos.redefinicao.redefinirSenha(corpo);
      resposta.clearCookie('refresh_token', { path: '/api/v1/auth', httpOnly: true, sameSite: 'lax', secure: autenticacao.deveUsarCookieSeguro });
      return resposta.send({ mensagem: 'Senha redefinida. Entre novamente com sua nova senha.' });
    });
    rotas.post('/api/v1/auth/alterar-senha', { bodyLimit: 4096, onRequest: criarTratadorDeLimiteDeRequisicoes(limitador, 'password-change-ip') }, async (requisicao, resposta) => {
      const token = requisicao.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
      if (!token) throw new ErroTokenAcessoInvalido();
      const identidade = await autenticacao.consultaIdentidade.consultarIdentidadeAutenticada(token);
      if (!await limitarIdentificador('password-change-user', requisicao.ip, identidade.usuario.id, resposta)) return;
      const corpo = NOVA_SENHA.extend({ senhaAtual: z.string().max(256) }).strict().parse(requisicao.body);
      await servicos.alteracao.alterarSenha(token, corpo);
      resposta.clearCookie('refresh_token', { path: '/api/v1/auth', httpOnly: true, sameSite: 'lax', secure: autenticacao.deveUsarCookieSeguro });
      return resposta.send({ mensagem: 'Senha alterada. Entre novamente com sua nova senha.' });
    });
  });
}
