import { PaginaCadastro } from './register-page';
import { PaginaLogin } from './login-page';
import { useEffect, useSyncExternalStore } from 'react';
import { ProvedorAutenticacao, useAutenticacao } from './auth-context';
import type { ClienteAutenticacao } from './auth-client';
import { CLIENTE_AUTENTICACAO } from './authentication';
import { navegar } from './routing';

const observarCaminho = (aoAlterarCaminho: () => void) => {
  window.addEventListener('popstate', aoAlterarCaminho);
  return () => window.removeEventListener('popstate', aoAlterarCaminho);
};

export function Aplicacao({ cliente = CLIENTE_AUTENTICACAO }: { cliente?: ClienteAutenticacao }) {
  return <ProvedorAutenticacao cliente={cliente}><Rotas /></ProvedorAutenticacao>;
}

function Rotas() {
  const { situacao } = useAutenticacao();
  const caminho = useSyncExternalStore(observarCaminho, () => window.location.pathname);
  useEffect(() => {
    if (caminho === '/login' && situacao === 'autenticado') navegar('/app');
    if (caminho !== '/' && caminho !== '/register' && caminho !== '/login' && situacao === 'naoAutenticado') navegar('/login');
  }, [caminho, situacao]);
  if (caminho !== '/' && caminho !== '/register') {
    if (situacao === 'carregando') return <main className="min-h-screen bg-slate-950 p-12 text-slate-100"><p role="status">Restaurando sessão…</p></main>;
    return <PaginaLogin />;
  }
  if (caminho === '/register') {
    return <PaginaCadastro />;
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
