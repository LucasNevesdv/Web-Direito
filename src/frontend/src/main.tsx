import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="max-w-xl text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
          Legal System
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Sistema em desenvolvimento
        </h1>
        <p className="mt-6 text-lg leading-8 text-slate-300">
          A fundação do sistema está pronta. Novas funcionalidades serão adicionadas em breve.
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
