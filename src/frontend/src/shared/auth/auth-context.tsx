import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { ClienteAutenticacao } from './auth-client';
import { CLIENTE_AUTENTICACAO } from './authentication';

const CONTEXTO_AUTENTICACAO = createContext<ClienteAutenticacao>(CLIENTE_AUTENTICACAO);

export function ProvedorAutenticacao({ children: filhos, cliente = CLIENTE_AUTENTICACAO }: { children: ReactNode; cliente?: ClienteAutenticacao }) {
  useEffect(() => {
    void cliente.restaurarSessao();
    const tratarRestauracaoDaPagina = (evento: PageTransitionEvent) => {
      if (evento.persisted) window.location.reload();
    };
    // Erase protected DOM before the browser can retain a back/forward snapshot.
    const tratarSaidaDaPagina = () => flushSync(() => cliente.prepararSaidaDaPagina());
    window.addEventListener('pagehide', tratarSaidaDaPagina);
    window.addEventListener('pageshow', tratarRestauracaoDaPagina);
    return () => {
      window.removeEventListener('pagehide', tratarSaidaDaPagina);
      window.removeEventListener('pageshow', tratarRestauracaoDaPagina);
    };
  }, [cliente]);
  return <CONTEXTO_AUTENTICACAO.Provider value={cliente}>{filhos}</CONTEXTO_AUTENTICACAO.Provider>;
}

export function useAutenticacao() {
  const cliente = useContext(CONTEXTO_AUTENTICACAO);
  return { cliente, ...useSyncExternalStore(cliente.observarMudancasDaAutenticacao, cliente.obterEstadoDaAutenticacao) };
}
