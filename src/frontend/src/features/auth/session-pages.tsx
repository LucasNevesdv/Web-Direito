import { useEffect, useRef, useState } from 'react';
import { useAutenticacao } from '../../shared/auth/auth-context';
import type { EscritorioDisponivel } from '../../shared/auth/auth-client';
import { navegar } from '../../routing';

const BOTAO = 'rounded bg-cyan-300 px-4 py-2 text-slate-950 disabled:opacity-50';

export function PaginaSelecaoEscritorio() {
  const { cliente, situacao, identidade } = useAutenticacao();
  const [escritorios, definirEscritorios] = useState<EscritorioDisponivel[]>(cliente.obterEscritoriosDaSelecao());
  const [erro, definirErro] = useState('');
  const [pendente, definirPendente] = useState(false);

  useEffect(() => {
    if (situacao !== 'autenticado') return;
    let cancelado = false;
    void cliente.enviarRequisicaoAutenticada('/api/v1/auth/escritorios')
      .then(async resposta => {
        if (!resposta.ok) throw new Error();
        const dados = await resposta.json();
        if (!cancelado) definirEscritorios(dados);
      })
      .catch(() => { if (!cancelado) definirErro('Não foi possível carregar os escritórios.'); });
    return () => { cancelado = true; };
  }, [cliente, situacao]);

  function selecionarEscritorio(idEscritorio: string) {
    if (pendente) return;
    definirPendente(true);
    definirErro('');
    void cliente.selecionarEscritorio(idEscritorio, situacao === 'autenticado')
      .then(() => navegar('/app'))
      .catch(() => definirErro('Seleção indisponível ou expirada. Entre novamente.'))
      .finally(() => definirPendente(false));
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <h1 className="text-2xl">Selecionar escritório</h1>
      {identidade && <p>Escritório atual: {identidade.escritorio.nome}</p>}
      {erro && <p role="alert">{erro}</p>}
      {!escritorios.length && !erro && <p role="status">Carregando escritórios…</p>}
      <ul className="my-6 space-y-4">
        {escritorios.map(escritorio => (
          <li key={escritorio.id}>
            <button className={BOTAO} disabled={pendente || escritorio.id === identidade?.escritorio.id}
              data-escritorio={escritorio.id} onClick={() => selecionarEscritorio(escritorio.id)}>
              {escritorio.nome} — {escritorio.papel}
            </button>
          </li>
        ))}
      </ul>
      {pendente && <p role="status">Selecionando escritório…</p>}
      <button className={BOTAO} onClick={() => {
        void cliente.encerrarSessao().catch(() => definirErro('Não foi possível sair.'));
      }}>Sair</button>
    </main>
  );
}
interface SessaoExibida {
  id: string;
  escritorio: { id: string; nome: string };
  atual: boolean;
  navegador: string;
  dispositivo: string;
  ipMascarado: string;
  criadoEm: string;
  ultimaAtividadeEm: string;
  expiraEm: string;
  situacao: 'ATIVA' | 'REVOGADA' | 'EXPIRADA';
}

export function PaginaSessoes() {
  const { cliente } = useAutenticacao();
  const [sessoes, definirSessoes] = useState<SessaoExibida[]>([]);
  const [erro, definirErro] = useState('');
  const [carregando, definirCarregando] = useState(true);
  const [alvo, definirAlvo] = useState<SessaoExibida | 'outras' | null>(null);
  const [pendente, definirPendente] = useState(false);
  const [versao, definirVersao] = useState(0);
  const canal = useRef<BroadcastChannel>();

  useEffect(() => {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        canal.current = new BroadcastChannel('web-direito:session-list:v1');
        canal.current.onmessage = evento => {
          if (evento.data === 'atualizar') definirVersao(valor => valor + 1);
        };
      }
    } catch { /* O foco continua atualizando a listagem sem canal. */ }
    return () => canal.current?.close();
  }, []);

  useEffect(() => {
    let cancelado = false;
    definirCarregando(true);
    void cliente.enviarRequisicaoAutenticada('/api/v1/auth/sessoes')
      .then(async resposta => {
        if (!resposta.ok) throw new Error();
        const dados = await resposta.json();
        if (!cancelado) definirSessoes(dados);
      })
      .catch(() => { if (!cancelado) definirErro('Não foi possível carregar as sessões.'); })
      .finally(() => { if (!cancelado) definirCarregando(false); });
    const atualizar = () => definirVersao(valor => valor + 1);
    window.addEventListener('focus', atualizar);
    return () => { cancelado = true; window.removeEventListener('focus', atualizar); };
  }, [cliente, versao]);

  async function confirmarEncerramento() {
    if (!alvo || pendente) return;
    definirPendente(true);
    definirErro('');
    try {
      const caminho = alvo === 'outras' ? '/api/v1/auth/sessoes/encerrar-outras' : `/api/v1/auth/sessoes/${alvo.id}`;
      const resposta = await cliente.enviarRequisicaoAutenticada(caminho, { method: alvo === 'outras' ? 'POST' : 'DELETE' });
      if (resposta.status !== 204) throw new Error();
      canal.current?.postMessage('atualizar');
      if (alvo !== 'outras' && alvo.atual) cliente.encerrarAutenticacaoNoNavegador();
      else definirVersao(valor => valor + 1);
      definirAlvo(null);
    } catch {
      definirErro('Não foi possível encerrar. Atualize e tente novamente.');
    } finally {
      definirPendente(false);
    }
  }
  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <a href="/app">Voltar</a>
      <h1 className="my-5 text-2xl">Sessões e dispositivos</h1>
      {erro && <p role="alert">{erro}</p>}
      {carregando && <p role="status">Carregando sessões…</p>}
      <button className={BOTAO} disabled={pendente} onClick={() => definirAlvo('outras')}>
        Encerrar todas as outras
      </button>
      <button className="ml-4 underline" onClick={() => definirVersao(valor => valor + 1)}>Atualizar</button>
      {!carregando && !sessoes.length && <p>Nenhuma sessão encontrada.</p>}
      <ul className="my-6 space-y-4">
        {sessoes.map(sessao => (
          <li key={sessao.id} data-sessao={sessao.id}
            className={`rounded border p-4 ${sessao.atual ? 'border-cyan-300' : 'border-slate-600'}`}>
            <h2>{sessao.atual ? 'Sessão atual — ' : ''}{sessao.escritorio.nome}</h2>
            <p>{sessao.navegador} · {sessao.dispositivo} · IP: {sessao.ipMascarado} · {sessao.situacao}</p>
            <p>Identificador: {sessao.id}</p>
            <p>Criação: {new Date(sessao.criadoEm).toLocaleString('pt-BR')}</p>
            <p>Última atividade: {new Date(sessao.ultimaAtividadeEm).toLocaleString('pt-BR')}</p>
            <p>Expiração: {new Date(sessao.expiraEm).toLocaleString('pt-BR')}</p>
            {sessao.situacao === 'ATIVA' && (
              <button className={BOTAO} disabled={pendente} onClick={() => definirAlvo(sessao)}>Encerrar sessão</button>
            )}
          </li>
        ))}
      </ul>
      {alvo && (
        <section role="alertdialog" aria-modal="true" aria-labelledby="confirmar-sessao"
          className="rounded border border-cyan-300 p-4" onKeyDown={evento => {
            if (evento.key === 'Escape' && !pendente) definirAlvo(null);
            if (evento.key === 'Tab') {
              const botoes = evento.currentTarget.querySelectorAll('button');
              evento.preventDefault();
              (document.activeElement === botoes[0] ? botoes[1] : botoes[0])?.focus();
            }
          }}>
          <h2 id="confirmar-sessao">
            {alvo === 'outras' ? 'Encerrar todas as outras sessões?' : alvo.atual
              ? 'Encerrar a sessão atual e sair de todas estas abas?' : 'Encerrar esta sessão?'}
          </h2>
          <button autoFocus className={BOTAO} disabled={pendente} onClick={() => { void confirmarEncerramento(); }}>
            Confirmar
          </button>
          <button className="ml-4 underline" disabled={pendente} onClick={() => definirAlvo(null)}>Cancelar</button>
        </section>
      )}
    </main>
  );
}
