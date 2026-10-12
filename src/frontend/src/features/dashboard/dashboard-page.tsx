import { useEffect, useState } from 'react';
import { dataBrasileira, dataHoraBrasileira, requisitarApi } from '../../shared/api';
import { useAutenticacao } from '../../shared/auth/auth-context';
import { BOTAO_SECUNDARIO, CARTAO, Pagina } from '../../shared/ui';
import type { PrazoJudicial } from '../tasks/task-types';

interface Painel { hoje: string; diasPrazoCritico: number; minhasTarefas: { hoje: number; atrasadas: number; futuras: number };
  prazosCriticos: PrazoJudicial[]; totalPrazosCriticos: number; notificacoesNaoLidas: number }
interface Notificacao { id: string; tipo: 'TAREFA_PROXIMA' | 'TAREFA_ATRASADA' | 'PRAZO_CRITICO' | 'PRAZO_VENCIDO'; escalonada: boolean; titulo: string;
  dataLimite: string; idTarefa: string | null; idPrazo: string | null; lidaEm: string | null; criadoEm: string }
const TIPOS: Record<Notificacao['tipo'], string> = { TAREFA_PROXIMA: 'Tarefa com prazo próximo', TAREFA_ATRASADA: 'Tarefa atrasada',
  PRAZO_CRITICO: 'Prazo judicial crítico', PRAZO_VENCIDO: 'Prazo judicial vencido' };

export function PaginaPainel() {
  const { cliente } = useAutenticacao();
  const [painel, definirPainel] = useState<Painel | null>(null);
  const [notificacoes, definirNotificacoes] = useState<Notificacao[]>([]);
  const [revisao, definirRevisao] = useState(0), [erro, definirErro] = useState('');
  useEffect(() => {
    const controle = new AbortController();
    void Promise.all([
      requisitarApi<Painel>(cliente, '/api/v1/painel', { signal: controle.signal }),
      requisitarApi<{ notificacoes: Notificacao[] }>(cliente, '/api/v1/notificacoes', { signal: controle.signal }),
    ]).then(([respostaPainel, respostaNotificacoes]) => {
      if (controle.signal.aborted) return;
      if (!respostaPainel.ok) { definirErro(respostaPainel.mensagem); return; }
      definirPainel(respostaPainel.dados);
      if (respostaNotificacoes.ok) definirNotificacoes(respostaNotificacoes.dados.notificacoes);
    }).catch(() => { if (!controle.signal.aborted) definirErro('Não foi possível carregar o painel.'); });
    return () => controle.abort();
  }, [cliente, revisao]);
  async function marcarLida(id: string) {
    const resposta = await requisitarApi<null>(cliente, `/api/v1/notificacoes/${id}/lida`, { method: 'POST' }).catch(() => null);
    if (resposta?.ok) definirRevisao((atual) => atual + 1); else definirErro('Não foi possível marcar a notificação.');
  }
  return <Pagina caminho="/painel" titulo="Painel">
    {erro && <p role="alert" className="text-rose-300">{erro}</p>}
    {!painel ? !erro && <p role="status">Carregando painel…</p> : <>
      <section aria-label="Prazos judiciais críticos" className={`${CARTAO} space-y-3 border-rose-500`}>
        <h2 className="text-2xl">Prazos judiciais críticos ({painel.totalPrazosCriticos})</h2>
        <p className="text-sm text-slate-400">Pendentes vencidos ou com data limite até {painel.diasPrazoCritico} dia(s) a partir de hoje ({dataBrasileira(painel.hoje)}).</p>
        {painel.prazosCriticos.length === 0 ? <p>Nenhum prazo crítico.</p> : <ul className="space-y-2">{painel.prazosCriticos.map((prazo) =>
          <li key={prazo.id} className="flex flex-wrap justify-between gap-2 rounded border border-slate-700 p-3">
            <span><strong>{dataBrasileira(prazo.dataLimite)}</strong>{prazo.vencido && <strong className="ml-2 text-rose-300">Vencido</strong>} — {prazo.descricao}</span>
            <span className="text-slate-300">{prazo.responsavel.nome}</span></li>)}</ul>}
        {painel.totalPrazosCriticos > painel.prazosCriticos.length && <a className="text-cyan-300 underline" href="/prazos">Ver todos os prazos críticos</a>}
      </section>
      <section aria-label="Minhas tarefas" className="grid gap-4 md:grid-cols-3">
        {([['atrasadas', 'Atrasadas'], ['hoje', 'Para hoje'], ['futuras', 'Futuras']] as const).map(([chave, rotulo]) =>
          <a key={chave} href="/tarefas" className={`${CARTAO} block`}><p className="text-slate-400">Minhas tarefas — {rotulo}</p>
            <p className={`text-4xl font-bold ${chave === 'atrasadas' && painel.minhasTarefas.atrasadas ? 'text-rose-300' : ''}`}>{painel.minhasTarefas[chave]}</p></a>)}
      </section>
      <section aria-label="Lembretes" className={`${CARTAO} space-y-3`}>
        <h2 className="text-2xl">Lembretes ({painel.notificacoesNaoLidas} não lidos)</h2>
        {notificacoes.length === 0 ? <p>Nenhum lembrete.</p> : <ul className="space-y-2">{notificacoes.map((notificacao) =>
          <li key={notificacao.id} className={`flex flex-wrap items-center justify-between gap-2 rounded border p-3 ${notificacao.lidaEm ? 'border-slate-800 text-slate-400' : 'border-amber-400'}`}>
            <span>{TIPOS[notificacao.tipo]}{notificacao.escalonada && ' (escalado)'}: <a className="underline" href={notificacao.idPrazo ? '/prazos' : '/tarefas'}>{notificacao.titulo}</a>
              {' '}— {dataBrasileira(notificacao.dataLimite)} · {dataHoraBrasileira(notificacao.criadoEm)}</span>
            {!notificacao.lidaEm && <button type="button" className={BOTAO_SECUNDARIO} onClick={() => { void marcarLida(notificacao.id); }}>Marcar como lido</button>}
          </li>)}</ul>}
      </section>
    </>}
  </Pagina>;
}
