import { ClienteAutenticacao } from './auth-client';
import { criarCoordenadorSessaoNavegador } from './infrastructure/browser-session-coordinator';
import { navegar } from '../../routing';

const enviarRequisicaoComPrazo: typeof fetch = (caminho, opcoes) => fetch(caminho, {
  ...opcoes, signal: opcoes?.signal ? AbortSignal.any([opcoes.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
});
export const CLIENTE_AUTENTICACAO = new ClienteAutenticacao(enviarRequisicaoComPrazo, () => navegar('/login'), criarCoordenadorSessaoNavegador());
