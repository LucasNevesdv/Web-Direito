import { RegisterPage } from './register-page';
import { LoginPage } from './login-page';
import { useEffect, useSyncExternalStore } from 'react';
import { AuthProvider, useAuth } from './auth-context';
import type { AuthClient } from './auth-client';
import { authClient } from './authentication';
import { navigate } from './routing';

const subscribePath = (listener: () => void) => {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
};

export function App({ client = authClient }: { client?: AuthClient }) {
  return <AuthProvider client={client}><Routes /></AuthProvider>;
}

function Routes() {
  const { status } = useAuth();
  const path = useSyncExternalStore(subscribePath, () => window.location.pathname);
  useEffect(() => {
    if (path === '/login' && status === 'authenticated') navigate('/app');
    if (path !== '/' && path !== '/register' && path !== '/login' && status === 'unauthenticated') navigate('/login');
  }, [path, status]);
  if (path !== '/' && path !== '/register') {
    if (status === 'loading') return <main className="min-h-screen bg-slate-950 p-12 text-slate-100"><p role="status">Restaurando sessão…</p></main>;
    return <LoginPage />;
  }
  if (path === '/register') {
    return <RegisterPage />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-slate-100">
      <section className="max-w-xl text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
          Legal System
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          O primeiro passo para organizar seu escritório
        </h1>
        <p className="mt-6 text-lg leading-8 text-slate-300">
          Cadastre seu escritório e a pessoa responsável pela administração. Novas
          funcionalidades serão adicionadas em breve.
        </p>
        <a
          className="mt-8 inline-flex rounded-lg bg-cyan-300 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
          href="/register"
        >
          Criar escritório
        </a>
        <a href="/login" className="ml-6 inline-flex text-cyan-300 underline underline-offset-4">Entrar</a>
      </section>
    </main>
  );
}
