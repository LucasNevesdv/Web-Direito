import { useEffect, useState } from 'react';
import { dataBrasileira, dataHoraBrasileira, requisitarApi } from '../../shared/api';
import { useAutenticacao } from '../../shared/auth/auth-context';
import { BOTAO_SECUNDARIO, CAMPO, CARTAO, Pagina } from '../../shared/ui';

interface Item { id: string; titulo: string; data: string | null; href: string }
interface Grupo { total: number; itens: Item[]; href: string }
interface Painel {
  hoje: string; ate: string; dias: number; diasPrazoCritico: number; fusoHorario: string; responsavel: string; idUsuario: string;
  membros: { id: string; nome: string }[]; tarefas: { hoje: Grupo; atrasadas: Grupo; futuras: Grupo };
  prazosCriticos: Grupo; prazosProximos: Grupo; compromissos: Grupo; casosSemAtividade: Grupo | null;
  clientesAtivos: { total: number; href: string } | null; casosAtivos: { total: number; href: string } | null;
}
interface Notificacao { id: string; tipo: 'TAREFA_PROXIMA' | 'TAREFA_ATRASADA' | 'PRAZO_CRITICO' | 'PRAZO_VENCIDO'; escalonada: boolean; titulo: string;
  dataLimite: string; idTarefa: string | null; idPrazo: string | null; lidaEm: string | null; criadoEm: string }
const TIPOS: Record<Notificacao['tipo'], string> = { TAREFA_PROXIMA: 'Tarefa com prazo próximo', TAREFA_ATRASADA: 'Tarefa atrasada',
  PRAZO_CRITICO: 'Prazo judicial crítico', PRAZO_VENCIDO: 'Prazo judicial vencido' };

function Lista({ titulo, grupo, descricao, fuso, alerta = false, vencidoAntes }: { titulo: string; grupo: Grupo; descricao?: string; fuso?: string; alerta?: boolean; vencidoAntes?: string }) {
  return <section aria-label={titulo} className={`${CARTAO} space-y-3 ${alerta && grupo.total ? 'border-rose-500' : ''}`}>
    <h2 className="text-xl">{titulo} ({grupo.total})</h2>
    {descricao && <p className="text-sm text-slate-400">{descricao}</p>}
    {grupo.itens.length === 0 ? <p>Nenhum registro encontrado.</p> : <ul className="space-y-2">{grupo.itens.map((item) =>
      <li key={item.id} className="rounded border border-slate-700 p-3">
        <a className="text-cyan-300 underline" href={item.href}>{item.titulo}</a>
        {item.data && <span className="ml-2 text-slate-300">{fuso
          ? new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.data))
          : dataBrasileira(item.data)}</span>}
        {item.data && vencidoAntes && item.data < vencidoAntes && <strong className="ml-2 text-rose-300">Vencido</strong>}
      </li>)}</ul>}
    {grupo.total > grupo.itens.length && <p className="text-sm text-slate-400">Exibindo os {grupo.itens.length} primeiros de {grupo.total} registros.</p>}
    <a className="text-cyan-300 underline" href={grupo.href}>Ver {titulo.toLocaleLowerCase('pt-BR')}</a>
  </section>;
}

export function PaginaPainel() {
  const { cliente } = useAutenticacao();
  const [painel, definirPainel] = useState<Painel | null>(null);
  const [filtros, definirFiltros] = useState({ dias: '7', responsavel: 'EU' });
  const [membros, definirMembros] = useState<Painel['membros']>([]);
  const [notificacoes, definirNotificacoes] = useState<Notificacao[]>([]), [naoLidas, definirNaoLidas] = useState(0);
  const [revisao, definirRevisao] = useState(0), [erro, definirErro] = useState(''), [erroLembretes, definirErroLembretes] = useState('');
  useEffect(() => {
    const controle = new AbortController(); definirPainel(null); definirErro('');
    void requisitarApi<Painel>(cliente, `/api/v1/painel/resumo?${new URLSearchParams(filtros)}`, { signal: controle.signal })
      .then((resposta) => {
        if (controle.signal.aborted) return;
        if (resposta.ok) { definirPainel(resposta.dados); definirMembros(resposta.dados.membros); }
        else definirErro(resposta.mensagem);
      }).catch(() => { if (!controle.signal.aborted) definirErro('Não foi possível carregar o painel.'); });
    return () => controle.abort();
  }, [cliente, filtros, revisao]);
  useEffect(() => {
    const controle = new AbortController(); definirNotificacoes([]); definirNaoLidas(0); definirErroLembretes('');
    void requisitarApi<{ notificacoes: Notificacao[]; naoLidas: number }>(cliente, '/api/v1/notificacoes', { signal: controle.signal })
      .then((resposta) => {
        if (controle.signal.aborted) return;
        if (resposta.ok) { definirNotificacoes(resposta.dados.notificacoes); definirNaoLidas(resposta.dados.naoLidas); }
        else definirErroLembretes(resposta.mensagem);
      }).catch(() => { if (!controle.signal.aborted) definirErroLembretes('Não foi possível carregar os lembretes.'); });
    return () => controle.abort();
  }, [cliente, revisao]);
  async function marcarLida(id: string) {
    const resposta = await requisitarApi<null>(cliente, `/api/v1/notificacoes/${id}/lida`, { method: 'POST' }).catch(() => null);
    if (resposta?.ok) definirRevisao((atual) => atual + 1); else definirErroLembretes('Não foi possível marcar a notificação.');
  }
  return <Pagina caminho="/painel" titulo="Painel">
    <section aria-label="Filtros do painel" className="grid gap-3 md:grid-cols-3">
      <label>Período<select className={CAMPO} value={filtros.dias} onChange={(e) => definirFiltros({ ...filtros, dias: e.target.value })}>
        {[7, 30, 90].map((dias) => <option key={dias} value={dias}>Próximos {dias} dias</option>)}</select></label>
      <label>Responsável<select className={CAMPO} value={filtros.responsavel} onChange={(e) => definirFiltros({ ...filtros, responsavel: e.target.value })}>
        <option value="EU">Eu</option><option value="TODOS">Todos do escritório</option>{membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
      <div className="flex items-end"><button type="button" className={BOTAO_SECUNDARIO} onClick={() => definirRevisao((r) => r + 1)}>Atualizar painel</button></div>
    </section>
    <p className="text-sm text-slate-400">O período limita os itens futuros. Atrasos e prazos críticos permanecem visíveis. Na agenda, responsável significa participante.
      Os lembretes são sempre pessoais.</p>
    {erro && <p role="alert" className="text-rose-300">{erro}</p>}
    {!painel ? !erro && <p role="status">Carregando painel…</p> : <>
      <p className="text-sm text-slate-400">Referência: {dataBrasileira(painel.hoje)} · Fuso do escritório: {painel.fusoHorario}.</p>
      <Lista titulo="Prazos judiciais críticos" grupo={painel.prazosCriticos} alerta vencidoAntes={painel.hoje}
        descricao={`Pendentes vencidos ou com vencimento até ${painel.diasPrazoCritico} dia(s) à frente, inclusive hoje.`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Lista titulo="Tarefas atrasadas" grupo={painel.tarefas.atrasadas} alerta descricao="Tarefas abertas com prazo anterior a hoje." />
        <Lista titulo="Tarefas para hoje" grupo={painel.tarefas.hoje} descricao="Tarefas abertas com prazo hoje." />
        <Lista titulo="Tarefas futuras" grupo={painel.tarefas.futuras} descricao={`Tarefas abertas de amanhã até ${dataBrasileira(painel.ate)}.`} />
      </div>
      <a className="text-cyan-300 underline" href={`/tarefas?periodo=TODAS${painel.responsavel === 'TODOS' ? '' : `&idResponsavel=${painel.responsavel}`}`}>
        Ver todas as tarefas do responsável, incluindo as sem prazo e encerradas
      </a>
      <div className="grid gap-4 lg:grid-cols-2">
        <Lista titulo="Prazos próximos" grupo={painel.prazosProximos} descricao={`Pendentes após o limite crítico e até ${dataBrasileira(painel.ate)}.`} />
        <Lista titulo="Compromissos próximos" grupo={painel.compromissos} fuso={painel.fusoHorario}
          descricao={`Agendados em andamento ou com início nos próximos ${painel.dias} dias.`} />
      </div>
      <section aria-label="Clientes e casos" className="grid gap-4 md:grid-cols-2">
        {([['Clientes ativos', painel.clientesAtivos], ['Casos ativos', painel.casosAtivos]] as const).map(([titulo, indicador]) =>
          indicador ? <a key={titulo} href={indicador.href} className={CARTAO}><h2 className="text-xl">{titulo}</h2><p className="text-4xl">{indicador.total}</p>
            <p className="text-sm text-slate-400">Total atual para o responsável selecionado, independente do período.</p></a>
            : <div key={titulo} className={CARTAO}><h2 className="text-xl">{titulo}</h2><p>Sem permissão para visualizar.</p></div>)}
      </section>
      {painel.casosSemAtividade && <Lista titulo="Casos sem movimentação" grupo={painel.casosSemAtividade} fuso={painel.fusoHorario}
        descricao={`Casos ativos sem atividade registrada há pelo menos ${painel.dias} dias. Data exibida: última atividade.`} />}
    </>}
    <section aria-label="Lembretes" className={`${CARTAO} space-y-3`}>
      <h2 className="text-2xl">Lembretes pessoais ({naoLidas} não lidos)</h2>
      {erroLembretes && <p role="alert" className="text-rose-300">{erroLembretes}</p>}
      {!erroLembretes && notificacoes.length === 0 ? <p>Nenhum lembrete.</p> : <ul className="space-y-2">{notificacoes.map((n) =>
        <li key={n.id} className={`flex flex-wrap items-center justify-between gap-2 rounded border p-3 ${n.lidaEm ? 'border-slate-800 text-slate-400' : 'border-amber-400'}`}>
          <span>{TIPOS[n.tipo]}{n.escalonada && ' (escalado)'}: <a className="underline" href={n.idPrazo ? `/prazos?id=${n.idPrazo}` : `/tarefas?id=${n.idTarefa}`}>{n.titulo}</a>
            {' '}— {dataBrasileira(n.dataLimite)} · {dataHoraBrasileira(n.criadoEm)}</span>
          {!n.lidaEm && <button type="button" className={BOTAO_SECUNDARIO} onClick={() => { void marcarLida(n.id); }}>Marcar como lido</button>}
        </li>)}</ul>}
    </section>
  </Pagina>;
}
