import { PaginaCadastro } from './features/auth/register-page';
import { PaginaSenhas } from './features/auth/password-pages';
import { PaginaEquipe } from './features/team/team-page';
import { PaginaLogin } from './features/auth/login-page';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { ProvedorAutenticacao, useAutenticacao } from './shared/auth/auth-context';
import type { ClienteAutenticacao } from './shared/auth/auth-client';
import { CLIENTE_AUTENTICACAO } from './shared/auth/authentication';
import { navegar } from './routing';
import { PaginaSelecaoEscritorio, PaginaSessoes } from './features/auth/session-pages';
import { iniciarVerificacaoPeriodica } from './shared/auth/infrastructure/session-polling';

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
    if (situacao === 'selecionando') {
      if (caminho !== '/selecionar-escritorio') navegar('/selecionar-escritorio');
      return;
    }
    if (situacao === 'autenticado') {
      if (identidade?.deveAlterarSenha) {
        if (caminho !== '/primeiro-acesso') navegar('/primeiro-acesso');
      } else if (caminho === '/login' || caminho === '/primeiro-acesso') navegar('/app');
      return;
    }
    if (situacao === 'naoAutenticado' && !['/', '/register', '/login', '/recuperar-senha', '/redefinir-senha'].includes(caminho)) navegar('/login');
  }, [caminho, situacao, identidade]);
  useEffect(() => {
    if (situacao !== 'autenticado') return;
    return iniciarVerificacaoPeriodica(() => cliente.revalidarSessaoSemRenovar());
  }, [cliente, situacao]);
  const contexto = identidade?.escritorio.id;
  const contextoAnterior = useRef(contexto);
  useEffect(() => { if (contextoAnterior.current && contexto && contextoAnterior.current !== contexto) navegar('/app'); if (contexto) contextoAnterior.current = contexto; }, [contexto]);
  if (situacao === 'selecionando') return <PaginaSelecaoEscritorio />;
  if (situacao === 'autenticado' && identidade?.deveAlterarSenha) return <PaginaSenhas finalidade="primeiro" />;
  if (caminho === '/selecionar-escritorio' && situacao === 'autenticado') return <PaginaSelecaoEscritorio key={contexto} />;
  if (caminho === '/seguranca/sessoes' && situacao === 'autenticado') return <PaginaSessoes key={contexto} />;
  if (caminho === '/equipe' && situacao === 'autenticado') return <PaginaEquipe key={contexto} />;
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
