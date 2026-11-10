import { useEffect, useMemo, useState } from 'react';
import { dataBrasileira, requisitarApi } from '../../shared/api';
import { useAutenticacao } from '../../shared/auth/auth-context';
import { BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO, Pagina } from '../../shared/ui';
import { FormularioCompromisso } from './appointment-form';
import { HistoricoCompromisso } from './appointment-history';
import { dataHoraNoFuso, diasDaVisao, instanteNoFuso, moverPeriodo, somarDias, type Visao } from './agenda-dates';
import { TIPOS, type Compromisso, type ConfiguracaoAgenda, type Historico, type ItemCivil, type Lembrete } from './agenda-types';

const SITUACOES = { AGENDADO: 'Agendado', REALIZADO: 'Realizado', CANCELADO: 'Cancelado' };
export function PaginaAgenda() {
  const { cliente } = useAutenticacao();
  const [intervaloPainel, setIntervaloPainel] = useState(() => {
    const q = new URLSearchParams(window.location.search), inicio = q.get('inicioPainel'), fim = q.get('fimPainel');
    const duracao = Date.parse(fim ?? '') - Date.parse(inicio ?? '');
    return inicio && fim && duracao > 0 && duracao <= 90 * 86400000 ? { inicio, fim } : null;
  });
  const [config, setConfig] = useState<ConfiguracaoAgenda | null>(null), [erro, setErro] = useState('');
  const [dia, setDia] = useState(''), [visao, setVisao] = useState<Visao>('SEMANA');
  const [profissional, setProfissional] = useState(new URLSearchParams(window.location.search).get('idParticipante') ?? ''), [tipo, setTipo] = useState(''), [unificada, setUnificada] = useState(true);
  const [pagina, setPagina] = useState(1), [revisao, setRevisao] = useState(0), [carregando, setCarregando] = useState(false);
  const [eventos, setEventos] = useState<Compromisso[]>([]), [total, setTotal] = useState(0);
  const [itens, setItens] = useState<ItemCivil[]>([]), [totalCivis, setTotalCivis] = useState(0);
  const [lembretes, setLembretes] = useState<Lembrete[]>([]), [erroLembrete, setErroLembrete] = useState('');
  const [selecionado, setSelecionado] = useState(new URLSearchParams(window.location.search).get('id') ?? '');
  const [evento, setEvento] = useState<Compromisso | null>(null), [historico, setHistorico] = useState<Historico[]>([]);
  const [formulario, setFormulario] = useState(false), [novo, setNovo] = useState(false), [ocupado, setOcupado] = useState(false);
  const [destino, setDestino] = useState<'REALIZADO' | 'CANCELADO' | ''>(''), [observacao, setObservacao] = useState('');
  const dias = useMemo(() => dia ? diasDaVisao(dia, visao) : [], [dia, visao]);
  const calendario = useMemo(() => !config ? [] : intervaloPainel ? [{ data: config.hoje, compromissos: eventos }] : dias.map((data) => {
    const inicio = instanteNoFuso(`${data}T00:00`, config.fusoHorario), fim = instanteNoFuso(`${somarDias(data, 1)}T00:00`, config.fusoHorario);
    return { data, compromissos: eventos.filter((ev) => ev.inicio < fim && ev.fim > inicio) };
  }), [config, dias, eventos, intervaloPainel]);
  const horario = (valor: string) => config ? new Date(valor).toLocaleString('pt-BR', { timeZone: config.fusoHorario }) : valor;
  function selecionar(id: string) {
    setSelecionado(id); setEvento(null); setHistorico([]); setFormulario(false); setDestino(''); setObservacao('');
    const url = new URL(window.location.href); if (id) url.searchParams.set('id', id); else url.searchParams.delete('id');
    window.history.replaceState(null, '', url);
  }
  useEffect(() => {
    const controle = new AbortController();
    void requisitarApi<ConfiguracaoAgenda>(cliente, '/api/v1/agenda/configuracao', { signal: controle.signal }).then((r) => {
      if (controle.signal.aborted) return;
      if (!r.ok) { setErro(r.mensagem); return; } setConfig(r.dados); setDia(r.dados.hoje);
    }).catch(() => { if (!controle.signal.aborted) setErro('Não foi possível carregar a configuração da Agenda.'); });
    return () => controle.abort();
  }, [cliente]);
  useEffect(() => {
    if (!config || !dias.length) return;
    const controle = new AbortController(); setCarregando(true); setErro(''); setEventos([]); setItens([]);
    const parametros = new URLSearchParams({ inicio: instanteNoFuso(`${dias[0]}T00:00`, config.fusoHorario),
      fim: instanteNoFuso(`${somarDias(dias[dias.length - 1], 1)}T00:00`, config.fusoHorario), pagina: String(pagina) });
    if (intervaloPainel) { parametros.set('inicio', intervaloPainel.inicio); parametros.set('fim', intervaloPainel.fim); }
    if (profissional) parametros.set('idParticipante', profissional); if (tipo) parametros.set('tipo', tipo);
    void Promise.all([
      requisitarApi<{ compromissos: Compromisso[]; total: number }>(cliente, `/api/v1/agenda${intervaloPainel ? '/proximos' : ''}?${parametros}`, { signal: controle.signal }),
      unificada && !intervaloPainel ? requisitarApi<{ itens: ItemCivil[]; total: number }>(cliente, `/api/v1/agenda/itens-civis?${parametros}`, { signal: controle.signal }) : Promise.resolve(null),
    ]).then(([r, civis]) => {
      if (controle.signal.aborted) return;
      if (!r.ok) { setErro(r.mensagem); return; }
      setEventos(r.dados.compromissos); setTotal(r.dados.total);
      if (civis && !civis.ok) setErro(civis.mensagem);
      else { setItens(civis?.dados.itens ?? []); setTotalCivis(civis?.dados.total ?? 0); }
    }).catch(() => { if (!controle.signal.aborted) setErro('Não foi possível consultar a Agenda.'); })
      .finally(() => { if (!controle.signal.aborted) setCarregando(false); });
    return () => controle.abort();
  }, [cliente, config, dias, pagina, profissional, tipo, unificada, revisao, intervaloPainel]);
  useEffect(() => {
    const controle = new AbortController(); let emAndamento = false;
    async function atualizar() {
      if (emAndamento) return; emAndamento = true;
      try {
        const r = await requisitarApi<Lembrete[]>(cliente, '/api/v1/agenda/lembretes', { signal: controle.signal });
        if (controle.signal.aborted) return;
        if (r.ok) { setLembretes(r.dados); setErroLembrete(''); } else setErroLembrete(r.mensagem);
      } catch { if (!controle.signal.aborted) setErroLembrete('Não foi possível atualizar os lembretes.'); }
      finally { emAndamento = false; }
    }
    void atualizar(); const timer = setInterval(() => { void atualizar(); }, 30000);
    return () => { controle.abort(); clearInterval(timer); };
  }, [cliente, revisao]);
  useEffect(() => {
    if (!selecionado) return;
    const controle = new AbortController(); setEvento(null); setHistorico([]);
    void Promise.all([
      requisitarApi<Compromisso>(cliente, `/api/v1/agenda/${selecionado}`, { signal: controle.signal }),
      requisitarApi<Historico[]>(cliente, `/api/v1/agenda/${selecionado}/historico`, { signal: controle.signal }),
    ]).then(([r, h]) => {
      if (controle.signal.aborted) return;
      if (!r.ok) { setErro(r.mensagem); return; } setEvento(r.dados);
      if (h.ok) setHistorico(h.dados); else setErro(h.mensagem);
    }).catch(() => { if (!controle.signal.aborted) setErro('Não foi possível abrir o compromisso.'); });
    return () => controle.abort();
  }, [cliente, selecionado, revisao]);
  async function mudarSituacao() {
    if (!evento || !destino) return; setOcupado(true); setErro('');
    try {
      const r = await requisitarApi<Compromisso>(cliente, `/api/v1/agenda/${evento.id}/situacao`, { method: 'POST', json: { situacao: destino, versao: evento.versao, observacao } });
      if (!r.ok) setErro(r.mensagem); else { setDestino(''); setObservacao(''); setFormulario(false); setRevisao((n) => n + 1); }
    } catch { setErro('Não foi possível alterar a situação.'); } finally { setOcupado(false); }
  }
  async function ler(id: string) {
    try { const r = await requisitarApi(cliente, `/api/v1/agenda/lembretes/${id}/lida`, { method: 'POST' });
      if (r.ok) setRevisao((n) => n + 1); else setErroLembrete(r.mensagem);
    } catch { setErroLembrete('Não foi possível marcar o lembrete.'); }
  }
  return <Pagina caminho="/agenda" titulo="Agenda">
    {erro && <p role="alert" className="text-rose-300">{erro} <button className={BOTAO_SECUNDARIO} onClick={() => { if (!config) window.location.reload(); else setRevisao((n) => n + 1); }}>Atualizar</button></p>}
    {!config ? <p role="status">Carregando configuração…</p> : <>
      <p className="text-slate-400">Horários em {config.fusoHorario}. Tarefas e prazos aparecem pela data informada, sem cálculo de dias úteis.</p>
      <section aria-label="Lembretes da agenda" className={`${CARTAO} space-y-2`}>
        <h2 className="text-xl">Lembretes da agenda</h2>{erroLembrete && <p role="alert">{erroLembrete}</p>}
        {lembretes.length === 0 ? <p>Nenhum lembrete pendente.</p> : <ul>{lembretes.map((l) => <li key={l.id} className="flex flex-wrap items-center gap-3 py-2">
          <button className="text-cyan-300 underline" onClick={() => selecionar(l.idCompromisso)}>{l.titulo} — {horario(l.inicio)}</button>
          <button className={BOTAO_SECUNDARIO} onClick={() => { void ler(l.id); }}>Marcar como lido</button></li>)}</ul>}
        <p className="text-xs text-slate-400">Atualização a cada 30 segundos nesta página. Até 100 lembretes pendentes por vez; marque os lidos para consultar os seguintes.</p>
      </section>
      <div className="flex flex-wrap items-end gap-3">
        <label>Visualização<select disabled={!!intervaloPainel} className={CAMPO} value={visao} onChange={(e) => { setVisao(e.target.value as Visao); setPagina(1); }}>
          <option value="DIA">Dia</option><option value="SEMANA">Semana</option><option value="MES">Mês</option></select></label>
        <label>Data de referência<input disabled={!!intervaloPainel} type="date" required className={CAMPO} value={dia} onChange={(e) => { if (e.target.value) { setDia(e.target.value); setPagina(1); } }} /></label>
        <label>Profissional<select className={CAMPO} value={profissional} onChange={(e) => { setProfissional(e.target.value); setPagina(1); }}><option value="">Todos</option>{config.membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
        <label>Tipo de compromisso<select className={CAMPO} value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(1); }}><option value="">Todos</option>{Object.entries(TIPOS).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>
        {!intervaloPainel && <label className="flex items-center gap-2"><input type="checkbox" checked={unificada} onChange={(e) => setUnificada(e.target.checked)} />Incluir tarefas e prazos</label>}
        <button className={BOTAO} onClick={() => { selecionar(''); setNovo(true); setFormulario(true); }}>Novo compromisso</button>
      </div>
      {formulario && (novo || evento) && <FormularioCompromisso key={novo ? 'novo' : `${evento!.id}-${evento!.versao}`} evento={novo ? null : evento} configuracao={config} dia={dia}
        aoFechar={() => setFormulario(false)} aoSalvar={(salvo) => { selecionar(salvo.id); setNovo(false); setRevisao((n) => n + 1); }} />}
      {selecionado && !evento && !erro && <p role="status">Carregando compromisso…</p>}
      {evento && <section aria-label="Detalhes do compromisso" className={`${CARTAO} space-y-3`}>
        <div className="flex flex-wrap justify-between gap-2"><h2 className="text-xl font-semibold">{evento.titulo}</h2><button className={BOTAO_SECUNDARIO} onClick={() => selecionar('')}>Fechar detalhes</button></div>
        <p>{TIPOS[evento.tipo]} · {SITUACOES[evento.situacao]} · {horario(evento.inicio)} até {horario(evento.fim)}</p>
        <p className="whitespace-pre-wrap">{evento.descricao}</p><p>Participantes: {evento.participantes.map((p) => p.nome).join(', ')}</p>
        <p>Local: {evento.local || 'Não informado'}</p>{evento.linkRemoto && <a className="text-cyan-300 underline" href={evento.linkRemoto} target="_blank" rel="noopener noreferrer">Abrir link remoto</a>}
        <p>Lembrete: {evento.lembreteMinutos === null ? 'Sem lembrete' : `${evento.lembreteMinutos} minuto(s) antes`}</p>
        {evento.vinculo && <p>Vínculo: {evento.vinculo.tipo} · {evento.vinculoRestrito ? 'Acesso restrito' : evento.rotuloVinculo ?? 'Registro vinculado'}</p>}
        <div className="flex flex-wrap gap-3">{evento.podeEditar && <><button className={BOTAO_SECUNDARIO} onClick={() => { setNovo(false); setFormulario(true); }}>Editar compromisso</button>
          <button className={BOTAO_SECUNDARIO} onClick={() => setDestino('REALIZADO')}>Marcar realizado</button></>}
          {evento.podeCancelar && <button className={BOTAO_SECUNDARIO} onClick={() => setDestino('CANCELADO')}>Cancelar compromisso</button>}</div>
        {destino && <fieldset disabled={ocupado} className="space-y-2 rounded border border-amber-400 p-3"><legend>Confirmar {destino === 'CANCELADO' ? 'cancelamento' : 'realização'}</legend>
          <label>Observação<textarea className={CAMPO} maxLength={2000} value={observacao} onChange={(e) => setObservacao(e.target.value)} /></label>
          <button className={BOTAO} onClick={() => { void mudarSituacao(); }}>Confirmar</button> <button className={BOTAO_SECUNDARIO} onClick={() => setDestino('')}>Voltar</button></fieldset>}
        <HistoricoCompromisso eventos={historico} fuso={config.fusoHorario} />
      </section>}
      {intervaloPainel ? <p>Compromissos agendados entre {horario(intervaloPainel.inicio)} e {horario(intervaloPainel.fim)}, incluindo os que estavam em andamento.
        {' '}<button className="text-cyan-300 underline" onClick={() => {
          setIntervaloPainel(null); setPagina(1);
          const url = new URL(window.location.href); url.searchParams.delete('inicioPainel'); url.searchParams.delete('fimPainel'); window.history.replaceState(null, '', url);
        }}>Voltar ao calendário</button></p> : <div className="flex flex-wrap items-center gap-3"><button className={BOTAO_SECUNDARIO} onClick={() => { setDia(moverPeriodo(dia, visao, -1)); setPagina(1); }}>Anterior</button>
        <button className={BOTAO_SECUNDARIO} onClick={() => { setDia(config.hoje); setPagina(1); }}>Hoje</button>
        <button className={BOTAO_SECUNDARIO} onClick={() => { setDia(moverPeriodo(dia, visao, 1)); setPagina(1); }}>Próximo</button>
        <span>{dataBrasileira(dias[0])} a {dataBrasileira(dias[dias.length - 1])}</span></div>}
      {carregando ? <p role="status">Carregando agenda…</p> : <>
        <p>{total} compromisso(s) no período. Página {pagina} de {Math.max(1, Math.ceil(total / 100))}.</p>
        {unificada && !intervaloPainel && <p>{totalCivis} tarefa(s)/prazo(s). O filtro de tipo se aplica apenas aos compromissos.</p>}
        {totalCivis > itens.length && <p role="status" className="text-amber-300">Há mais de 500 tarefas ou prazos neste intervalo. Reduza o período ou filtre por profissional para conferir todos.</p>}
        <div className={`grid gap-2 ${visao === 'DIA' || intervaloPainel ? '' : 'md:grid-cols-7'}`} aria-label={intervaloPainel ? 'Compromissos do painel' : 'Calendário'}>
          {calendario.map(({ data, compromissos }) => <section key={data} aria-label={dataBrasileira(data)} className={`min-w-0 rounded-lg border p-2 ${data === config.hoje ? 'border-cyan-300' : 'border-slate-700'} ${visao === 'MES' && data.slice(0, 7) !== dia.slice(0, 7) ? 'bg-slate-950' : 'bg-slate-900'}`}>
            <h3 className="mb-2 font-semibold">{intervaloPainel ? 'Compromissos do período' : new Date(`${data}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' })}</h3>
            <ul className="space-y-2">{compromissos.map((ev) => <li key={ev.id}><button
              className={`w-full break-words rounded border p-2 text-left text-sm ${ev.situacao === 'CANCELADO' ? 'border-slate-600 text-slate-400 line-through' : ev.situacao === 'REALIZADO' ? 'border-emerald-500' : 'border-cyan-500'}`}
              onClick={() => selecionar(ev.id)}><span className="block">{intervaloPainel ? horario(ev.inicio) : dataHoraNoFuso(ev.inicio, config.fusoHorario).slice(11)} · {TIPOS[ev.tipo]}</span><strong>{ev.titulo}</strong><span className="block">{SITUACOES[ev.situacao]}</span></button></li>)}
              {itens.filter((item) => item.data === data).map((item) => <li key={`${item.origem}-${item.id}`} className="break-words rounded border border-amber-500 p-2 text-sm">
                <span className="block text-amber-300">{item.origem === 'TAREFA' ? 'Tarefa' : 'Prazo judicial'}</span><strong>{item.titulo}</strong><span className="block">{item.responsavel.nome}</span>
                <a className="text-cyan-300 underline" href={`${item.origem === 'TAREFA' ? '/tarefas' : '/prazos'}?id=${item.id}`}>Abrir registro</a></li>)}</ul>
          </section>)}
        </div>
        {total > 100 && <div className="flex gap-3"><button className={BOTAO_SECUNDARIO} disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>Página anterior</button>
          <button className={BOTAO_SECUNDARIO} disabled={pagina * 100 >= total} onClick={() => setPagina((p) => p + 1)}>Próxima página</button></div>}
      </>}
    </>}
  </Pagina>;
}
