import { RegisterPage } from './register-page';
import { LoginPage } from './login-page';

export function App() {
  if (window.location.pathname === '/login') return <LoginPage />;
  if (window.location.pathname === '/register') {
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
