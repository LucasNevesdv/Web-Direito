import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { AuthClient } from './auth-client';
import { authClient } from './authentication';

const Context = createContext<AuthClient>(authClient);

export function AuthProvider({ children, client = authClient }: { children: ReactNode; client?: AuthClient }) {
  useEffect(() => {
    void client.restore();
    const restorePage = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    // Erase protected DOM before the browser can retain a back/forward snapshot.
    const hidePage = () => flushSync(() => client.prepareForNavigation());
    window.addEventListener('pagehide', hidePage);
    window.addEventListener('pageshow', restorePage);
    return () => {
      window.removeEventListener('pagehide', hidePage);
      window.removeEventListener('pageshow', restorePage);
    };
  }, [client]);
  return <Context.Provider value={client}>{children}</Context.Provider>;
}

export function useAuth() {
  const client = useContext(Context);
  return { client, ...useSyncExternalStore(client.subscribe, client.getSnapshot) };
}
