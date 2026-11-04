import type { ReactNode } from 'react';
import { useAutenticacao } from './auth/auth-context';

export const CAMPO = 'w-full rounded-lg border border-slate-600 bg-slate-950 p-2';
export const BOTAO = 'rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50';
export const BOTAO_SECUNDARIO = 'rounded-lg border border-slate-500 px-3 py-1 disabled:opacity-50';
export const CARTAO = 'rounded-xl border border-slate-700 bg-slate-900 p-5';

const LINKS = [['/painel', 'Painel'], ['/clientes', 'Clientes'], ['/casos', 'Casos'], ['/tarefas', 'Tarefas'], ['/prazos', 'Prazos judiciais'], ['/documentos', 'Documentos'], ['/equipe', 'Equipe'], ['/app', 'Conta']] as const;

export function NavegacaoPrincipal({ atual }: { atual: string }) {
  const { cliente, identidade } = useAutenticacao();
  return <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
    <nav aria-label="Principal" className="flex flex-wrap gap-4">{LINKS.map(([caminho, rotulo]) =>
      <a key={caminho} href={caminho} aria-current={caminho === atual ? 'page' : undefined}
        className={caminho === atual ? 'font-semibold text-cyan-300' : 'text-slate-300 underline-offset-4 hover:underline'}>{rotulo}</a>)}</nav>
    <div className="flex items-center gap-4 text-sm text-slate-300"><span>{identidade?.escritorio.nome}</span>
      <button type="button" className={BOTAO_SECUNDARIO} onClick={() => { void cliente.encerrarSessao().catch(() => undefined); }}>Sair</button></div>
  </header>;
}

export function Pagina({ caminho, titulo, children }: { caminho: string; titulo: string; children: ReactNode }) {
  return <main className="min-h-screen bg-slate-950 p-6 text-slate-100"><section className="mx-auto max-w-6xl space-y-6">
    <NavegacaoPrincipal atual={caminho} /><h1 className="text-3xl font-bold">{titulo}</h1>{children}</section></main>;
}
