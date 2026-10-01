import cookie from '@fastify/cookie';
import type { LimitadorRequisicoes } from '../application/security/rate-limiter.js';
import { criarTratadorDeLimiteDeRequisicoes } from './rate-limit-hook.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AutenticacaoDeUsuario } from '../application/authentication/authenticate-user.js';
import type { ConsultaDeIdentidadeAutenticada } from '../application/authentication/get-authenticated-identity.js';
import type { RenovacaoDeSessao } from '../application/authentication/refresh-session.js';
import type { EncerramentoDeSessao } from '../application/authentication/logout-session.js';
import type { IdentidadePublica } from '../application/authentication/authentication-contracts.js';
import { ErroEscritorioInativo, ErroUsuarioInativo, ErroTokenAcessoInvalido, ErroCredenciaisInvalidas, ErroMultiplosEscritoriosAtivos } from '../application/authentication/authentication-errors.js';

export interface ServicosRotasAutenticacao {
  autenticacao: Pick<AutenticacaoDeUsuario, 'autenticarUsuario'>;
  consultaIdentidade: Pick<ConsultaDeIdentidadeAutenticada, 'consultarIdentidadeAutenticada'>;
  renovacao: Pick<RenovacaoDeSessao, 'renovarSessao'>;
  encerramento: Pick<EncerramentoDeSessao, 'encerrarSessao'>;
  origemFrontend: string;
  deveUsarCookieSeguro: boolean;
  validadeRenovacaoSegundos: number;
}

const CORPO_LOGIN = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  senha: z.string().refine((valor) => Array.from(valor).length >= 1 && Array.from(valor).length <= 128),
}).strict();
const CREDENCIAIS_INVALIDAS = { erro: 'CREDENCIAIS_INVALIDAS', mensagem: 'Não foi possível entrar. Confira suas credenciais.' };
const EXCESSO_TENTATIVAS = { erro: 'EXCESSO_TENTATIVAS', mensagem: 'Muitas tentativas. Aguarde antes de tentar novamente.' };

function selecionarCamposDaIdentidadePublica(identidade: IdentidadePublica): IdentidadePublica {
  return {
    ...(identidade.deveAlterarSenha ? { deveAlterarSenha: true } : {}),
    usuario: { id: identidade.usuario.id, nome: identidade.usuario.nome, email: identidade.usuario.email },
    escritorio: { id: identidade.escritorio.id, nome: identidade.escritorio.nome, papel: identidade.escritorio.papel },
  };
}

export function registrarRotasAutenticacao(aplicacao: FastifyInstance, servicos: ServicosRotasAutenticacao, limitador: LimitadorRequisicoes): void {
  const opcoesCookie = {
    httpOnly: true, sameSite: 'lax' as const, path: '/api/v1/auth', secure: servicos.deveUsarCookieSeguro,
  };
  aplicacao.register(async (autenticacao) => {
    await autenticacao.register(cookie);
    autenticacao.addHook('onSend', async (_requisicao, respostaHttp, conteudo) => {
      respostaHttp.header('Cache-Control', 'no-store');
      return conteudo;
    });
    autenticacao.addHook('onRequest', async (requisicao, respostaHttp) => {
      // Same-origin proxy deployment: never trust Host/X-Forwarded-Host as the allowed origin.
      if (requisicao.method === 'POST' && requisicao.headers.origin !== servicos.origemFrontend) {
        return respostaHttp.status(403).send({ erro: 'PROIBIDO', mensagem: 'Solicitação não permitida.' });
      }
      if ((requisicao.headers.cookie?.length ?? 0) > 4096) {
        respostaHttp.clearCookie('refresh_token', opcoesCookie);
        if (requisicao.routeOptions.url === '/api/v1/auth/logout') {
          await servicos.encerramento.encerrarSessao(requisicao.cookies.refresh_token);
          return respostaHttp.status(204).send();
        }
        throw new ErroTokenAcessoInvalido();
      }
    });
    autenticacao.setErrorHandler((erro, _requisicao, respostaHttp) => {
      if (erro instanceof ErroCredenciaisInvalidas || erro instanceof ErroUsuarioInativo || erro instanceof ErroEscritorioInativo) {
        return respostaHttp.status(401).send(CREDENCIAIS_INVALIDAS);
      }
      if (erro instanceof ErroTokenAcessoInvalido) {
        if (_requisicao.routeOptions.url === '/api/v1/auth/refresh') respostaHttp.clearCookie('refresh_token', opcoesCookie);
        return respostaHttp.status(401).send({ erro: 'NAO_AUTORIZADO', mensagem: 'Entre novamente para continuar.' });
      }
      if (erro instanceof ErroMultiplosEscritoriosAtivos) {
        return respostaHttp.status(409).send({ erro: 'SELECAO_ESCRITORIO_NECESSARIA', mensagem: 'A seleção entre escritórios ainda não está disponível.' });
      }
      const situacao = erro && typeof erro === 'object' && 'statusCode' in erro ? erro.statusCode : undefined;
      if (situacao === 429) return respostaHttp.status(429).send(EXCESSO_TENTATIVAS);
      if (typeof situacao === 'number' && situacao >= 400 && situacao < 500) {
        return respostaHttp.status(400).send({ erro: 'ERRO_VALIDACAO', mensagem: 'Confira os dados informados.' });
      }
      return respostaHttp.status(500).send({ erro: 'ERRO_INTERNO', mensagem: 'Não foi possível concluir a solicitação. Tente novamente.' });
    });

    autenticacao.post('/api/v1/auth/login', {
      bodyLimit: 4 * 1024,
      onRequest: criarTratadorDeLimiteDeRequisicoes(limitador, 'login-ip'),
      preValidation: criarTratadorDeLimiteDeRequisicoes(limitador, 'login-identity'),
    }, async (requisicao, respostaHttp) => {
      const interpretado = CORPO_LOGIN.safeParse(requisicao.body);
      if (!interpretado.success) {
        const campos: Record<string, string> = {};
        for (const problema of interpretado.error.issues) {
          if (problema.path[0] === 'email') campos.email = 'Informe um e-mail válido.';
          if (problema.path[0] === 'senha') campos.senha = 'Informe sua senha com até 128 caracteres.';
        }
        return respostaHttp.status(400).send({ erro: 'ERRO_VALIDACAO', mensagem: 'Confira os dados informados.', campos });
      }
      const resultado = await servicos.autenticacao.autenticarUsuario(interpretado.data);
      respostaHttp.setCookie('refresh_token', resultado.tokenRenovacao, {
        ...opcoesCookie,
        maxAge: servicos.validadeRenovacaoSegundos, expires: resultado.renovacaoExpiraEm,
      });
      return respostaHttp.send({
        tokenAcesso: resultado.resposta.tokenAcesso, expiraEmSegundos: resultado.resposta.expiraEmSegundos,
        ...selecionarCamposDaIdentidadePublica(resultado.resposta),
      });
    });

    autenticacao.post('/api/v1/auth/refresh', {
      bodyLimit: 1024,
      onRequest: criarTratadorDeLimiteDeRequisicoes(limitador, 'refresh-ip'),
    }, async (requisicao, respostaHttp) => {
      // No token accepted from query or body, including when a valid cookie is present.
      if (requisicao.body !== undefined || Object.keys(requisicao.query as object).length) throw new ErroTokenAcessoInvalido();
      const resultado = await servicos.renovacao.renovarSessao(requisicao.cookies.refresh_token);
      respostaHttp.setCookie('refresh_token', resultado.tokenRenovacao, {
        ...opcoesCookie, expires: resultado.renovacaoExpiraEm,
        maxAge: Math.max(0, Math.floor((resultado.renovacaoExpiraEm.getTime() - Date.now()) / 1000)),
      });
      return respostaHttp.send({ tokenAcesso: resultado.resposta.tokenAcesso, expiraEmSegundos: resultado.resposta.expiraEmSegundos, ...selecionarCamposDaIdentidadePublica(resultado.resposta) });
    });

    autenticacao.post('/api/v1/auth/logout', { bodyLimit: 1024 }, async (requisicao, respostaHttp) => {
      try { await servicos.encerramento.encerrarSessao(requisicao.cookies.refresh_token); }
      finally { respostaHttp.clearCookie('refresh_token', opcoesCookie); }
      return respostaHttp.status(204).send();
    });

    autenticacao.get('/api/v1/auth/me', async (requisicao, respostaHttp) => {
      const autorizacao = requisicao.headers.authorization;
      const correspondencia = autorizacao?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
      if (!correspondencia) throw new ErroTokenAcessoInvalido();
      return respostaHttp.send(selecionarCamposDaIdentidadePublica(await servicos.consultaIdentidade.consultarIdentidadeAutenticada(correspondencia[1])));
    });
  });
}
