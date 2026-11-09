import Fastify from 'fastify';
import type { GestaoAgenda } from './application/agenda/manage-agenda.js';
import type { GestaoPainel } from './application/dashboard/manage-dashboard.js';
import { registrarRotasPainel } from './presentation/dashboard-routes.js';
import { registrarRotasAgenda } from './presentation/agenda-routes.js';
import type { GestaoEquipe } from './application/team/manage-team.js';
import { registrarRotasEquipe } from './presentation/team-routes.js';
import type { GestaoTarefas } from './application/tasks/manage-tasks.js';
import type { GestaoDocumentos } from './application/documents/manage-documents.js';
import { registrarRotasTarefas } from './presentation/task-routes.js';
import { registrarRotasDocumentos } from './presentation/document-routes.js';
import type { GestaoClientes } from './application/clients/manage-clients.js';
import { registrarRotasClientes } from './presentation/client-routes.js';
import type { GestaoCasosProcessos } from './application/cases/manage-cases.js';
import { registrarRotasCasos } from './presentation/case-routes.js';
import type { GestaoAdministracao } from './application/administration/manage-administration.js';
import { registrarRotasAdministracao } from './presentation/administration-routes.js';
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
  trabalho?: { tarefas: GestaoTarefas; documentos: { gestao: GestaoDocumentos; limiteBytes: number }; agenda?: GestaoAgenda; painel?: GestaoPainel },
  clientes?: GestaoClientes,
  casos?: GestaoCasosProcessos,
  administracao?: GestaoAdministracao,
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
    if (trabalho.agenda) registrarRotasAgenda(aplicacao, trabalho.agenda, autenticacao.origemFrontend);
    if (trabalho.painel) registrarRotasPainel(aplicacao, trabalho.painel, autenticacao.origemFrontend);
    registrarRotasTarefas(aplicacao, trabalho.tarefas, autenticacao.origemFrontend);
    registrarRotasDocumentos(aplicacao, trabalho.documentos.gestao, autenticacao.origemFrontend, trabalho.documentos.limiteBytes);
  }
  if (autenticacao && clientes) {
    registrarRotasClientes(aplicacao, clientes, autenticacao.origemFrontend);
  }
  if (autenticacao && casos) {
    registrarRotasCasos(aplicacao, casos, autenticacao.origemFrontend);
  }
  if (autenticacao && administracao) {
    registrarRotasAdministracao(aplicacao, administracao, autenticacao.origemFrontend);
  }

  return aplicacao;
}
