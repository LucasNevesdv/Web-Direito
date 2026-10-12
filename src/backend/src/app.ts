import Fastify from 'fastify';
import type { GestaoEquipe } from './application/team/manage-team.js';
import { registrarRotasEquipe } from './presentation/team-routes.js';
import type { GestaoTarefas } from './application/tasks/manage-tasks.js';
import type { GestaoDocumentos } from './application/documents/manage-documents.js';
import { registrarRotasTarefas } from './presentation/task-routes.js';
import { registrarRotasDocumentos } from './presentation/document-routes.js';
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
  equipe?: GestaoEquipe,
  trabalho?: { tarefas: GestaoTarefas; documentos: { gestao: GestaoDocumentos; limiteBytes: number } },
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
  if (autenticacao && equipe) registrarRotasEquipe(aplicacao, equipe, autenticacao.origemFrontend, seguranca.limitador);
  if (autenticacao && trabalho) {
    registrarRotasTarefas(aplicacao, trabalho.tarefas, autenticacao.origemFrontend);
    registrarRotasDocumentos(aplicacao, trabalho.documentos.gestao, autenticacao.origemFrontend, trabalho.documentos.limiteBytes);
  }

  return aplicacao;
}
