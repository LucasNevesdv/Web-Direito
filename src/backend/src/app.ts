import Fastify from 'fastify';
import { registrarRotasSenhas, type ServicosRotasSenhas } from './presentation/password-routes.js';
import { LIMITADOR_REQUISICOES_INDISPONIVEL, type LimitadorRequisicoes } from './application/security/rate-limiter.js';
import type { CadastroDeEscritorioComProprietario } from './application/onboarding/register-office-with-owner.js';
import type { VerificadorSaudeBanco } from './database-health-checker.js';
import { registrarRotaCadastro } from './presentation/onboarding-route.js';
import { registrarRotasAutenticacao, type ServicosRotasAutenticacao } from './presentation/authentication-routes.js';

export function criarAplicacao(
  verificadorSaudeBanco: VerificadorSaudeBanco,
  cadastro?: Pick<CadastroDeEscritorioComProprietario, 'cadastrarEscritorioComProprietario'>,
  autenticacao?: ServicosRotasAutenticacao,
  seguranca: { limitador: LimitadorRequisicoes; proxiesConfiaveis?: false | string[] } = { limitador: LIMITADOR_REQUISICOES_INDISPONIVEL },
  senhas?: ServicosRotasSenhas,
) {
  const aplicacao = Fastify({ logger: false, trustProxy: seguranca.proxiesConfiaveis ?? false });

  aplicacao.get('/health', async () => ({ situacao: 'ok' as const }));

  aplicacao.get('/ready', async (_requisicao, respostaHttp) => {
    try {
      await verificadorSaudeBanco.verificarConexaoComBanco();
      return { situacao: 'ready' as const };
    } catch {
      return respostaHttp.status(503).send({ situacao: 'not_ready' as const });
    }
  });

  if (cadastro) {
    registrarRotaCadastro(aplicacao, cadastro, seguranca.limitador);
  }
  if (autenticacao) registrarRotasAutenticacao(aplicacao, autenticacao, seguranca.limitador);
  if (autenticacao && senhas) registrarRotasSenhas(aplicacao, senhas, autenticacao, seguranca.limitador);

  return aplicacao;
}
