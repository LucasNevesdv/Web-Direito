import { PaginaCadastro } from './register-page';
import { PaginaSenhas } from './password-pages';
import { PaginaEquipe } from './team-page';
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
  const { situacao, identidade, cliente } = useAutenticacao();
  const caminho = useSyncExternalStore(observarCaminho, () => window.location.pathname);
  useEffect(() => {
    if (situacao === 'autenticado' && identidade?.deveAlterarSenha && caminho !== '/primeiro-acesso') navegar('/primeiro-acesso');
    else if ((caminho === '/login' || caminho === '/primeiro-acesso') && situacao === 'autenticado' && !identidade?.deveAlterarSenha) navegar('/app');
    if (!['/', '/register', '/login', '/recuperar-senha', '/redefinir-senha'].includes(caminho) && situacao === 'naoAutenticado') navegar('/login');
  }, [caminho, situacao, identidade]);
  useEffect(() => {
    if (situacao !== 'autenticado') return;
    let pendente = false;
    const revalidar = async () => {
      if (pendente || document.visibilityState === 'hidden') return;
      pendente = true;
      try { await cliente.enviarRequisicaoAutenticada('/api/v1/auth/me'); } catch { /* Falha transitória não confirma revogação. */ }
      finally { pendente = false; }
    };
    const temporizador = setInterval(() => { void revalidar(); }, 2000);
    window.addEventListener('focus', revalidar); document.addEventListener('visibilitychange', revalidar);
    return () => { clearInterval(temporizador); window.removeEventListener('focus', revalidar); document.removeEventListener('visibilitychange', revalidar); };
  }, [cliente, situacao]);
  if (situacao === 'autenticado' && identidade?.deveAlterarSenha) return <PaginaSenhas finalidade="primeiro" />;
  if (caminho === '/equipe' && situacao === 'autenticado') return <PaginaEquipe />;
  if (caminho === '/recuperar-senha') return <PaginaSenhas finalidade="recuperar" />;
  if (caminho === '/redefinir-senha') return <PaginaSenhas finalidade="redefinir" />;
  if (caminho === '/seguranca' && situacao === 'autenticado') return <PaginaSenhas finalidade="alterar" />;
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
