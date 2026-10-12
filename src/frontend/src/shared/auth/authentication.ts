import { ClienteAutenticacao } from './auth-client';
import { criarCoordenadorSessaoNavegador } from './infrastructure/browser-session-coordinator';
import { navegar } from '../../routing';

// Envio e download de arquivos recebem prazo maior que as demais requisições.
const prazoDaRequisicao = (caminho: Parameters<typeof fetch>[0], opcoes?: RequestInit) =>
  opcoes?.body instanceof FormData || String(caminho).includes('/download') ? 300000 : 10000;
const enviarRequisicaoComPrazo: typeof fetch = (caminho, opcoes) => {
  const prazo = AbortSignal.timeout(prazoDaRequisicao(caminho, opcoes));
  return fetch(caminho, { ...opcoes, signal: opcoes?.signal ? AbortSignal.any([opcoes.signal, prazo]) : prazo });
};
export const CLIENTE_AUTENTICACAO = new ClienteAutenticacao(enviarRequisicaoComPrazo, () => navegar('/login'), criarCoordenadorSessaoNavegador());
