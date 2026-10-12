import { useEffect, useRef, useState, type FormEvent } from 'react';
import { dataBrasileira, dataHoraBrasileira, requisitarApi } from '../../shared/api';
import { useAutenticacao } from '../../shared/auth/auth-context';
import { ROTULOS_VINCULO, SeletorVinculo, type Vinculo } from '../../shared/link-picker';
import { BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO, Pagina } from '../../shared/ui';
import { ListaHistorico } from './history-list';
import { PRIORIDADES, SITUACOES_TAREFA, type ConfiguracaoTarefas, type EventoHistorico, type PrioridadeTarefa, type SituacaoTarefa,
  type Tarefa } from './task-types';

type Periodo = 'TODAS' | 'HOJE' | 'FUTURAS' | 'ATRASADAS';
const PERIODOS: Record<Periodo, string> = { HOJE: 'Hoje', ATRASADAS: 'Atrasadas', FUTURAS: 'Futuras', TODAS: 'Todas' };
const TAMANHO_PAGINA = 20;
interface Formulario { titulo: string; descricao: string; prioridade: PrioridadeTarefa; idResponsavel: string; idRevisor: string; prazoInterno: string; vinculo: Vinculo | null }

export function PaginaTarefas() {
  const { cliente, identidade } = useAutenticacao();
  const [configuracao, definirConfiguracao] = useState<ConfiguracaoTarefas | null>(null);
  const [filtros, definirFiltros] = useState({ periodo: 'HOJE' as Periodo, idResponsavel: '', situacao: '', prioridade: '' });
  const [pagina, definirPagina] = useState(1);
  const [tarefas, definirTarefas] = useState<Tarefa[]>([]), [total, definirTotal] = useState(0);
  const [selecionada, definirSelecionada] = useState<Tarefa | null>(null);
  const [formulario, definirFormulario] = useState<{ dados: Formulario; tarefa?: Tarefa } | null>(null);
  const [revisao, definirRevisao] = useState(0), [carregando, definirCarregando] = useState(true);
  const [mensagem, definirMensagem] = useState(''), [erro, definirErro] = useState('');

  useEffect(() => {
    const controle = new AbortController();
    void requisitarApi<ConfiguracaoTarefas>(cliente, '/api/v1/tarefas/configuracao', { signal: controle.signal })
      .then((resposta) => { if (resposta.ok) definirConfiguracao(resposta.dados); else definirErro(resposta.mensagem); })
      .catch(() => { if (!controle.signal.aborted) definirErro('Não foi possível carregar a configuração.'); });
    return () => controle.abort();
  }, [cliente]);
  useEffect(() => {
    const controle = new AbortController(); definirCarregando(true);
    const consulta = new URLSearchParams({ periodo: filtros.periodo, pagina: String(pagina), tamanhoPagina: String(TAMANHO_PAGINA) });
    for (const chave of ['idResponsavel', 'situacao', 'prioridade'] as const) if (filtros[chave]) consulta.set(chave, filtros[chave]);
    void requisitarApi<{ tarefas: Tarefa[]; total: number }>(cliente, `/api/v1/tarefas?${consulta}`, { signal: controle.signal })
      .then((resposta) => { if (controle.signal.aborted) return; if (resposta.ok) { definirTarefas(resposta.dados.tarefas); definirTotal(resposta.dados.total); } else definirErro(resposta.mensagem); })
      .catch(() => { if (!controle.signal.aborted) definirErro('Não foi possível carregar as tarefas.'); })
      .finally(() => { if (!controle.signal.aborted) definirCarregando(false); });
    return () => controle.abort();
  }, [cliente, filtros, pagina, revisao]);

  function alterarFiltro(chave: keyof typeof filtros, valor: string) { definirPagina(1); definirFiltros({ ...filtros, [chave]: valor }); }
  async function abrir(id: string) {
    const resposta = await requisitarApi<Tarefa>(cliente, `/api/v1/tarefas/${id}`).catch(() => null);
    if (resposta?.ok) { definirSelecionada(resposta.dados); definirFormulario(null); } else definirErro(resposta?.mensagem ?? 'Não foi possível abrir a tarefa.');
  }
  function aoAtualizar(tarefa: Tarefa, aviso: string) { definirSelecionada(tarefa); definirMensagem(aviso); definirErro(''); definirRevisao((atual) => atual + 1); }
  const novoFormulario = (): Formulario => ({ titulo: '', descricao: '', prioridade: 'MEDIA', idResponsavel: configuracao?.idUsuario ?? '', idRevisor: '', prazoInterno: '', vinculo: null });

  return <Pagina caminho="/tarefas" titulo="Tarefas">
    <p className="text-slate-300">Escritório: <strong>{identidade?.escritorio.nome}</strong>. Prazos internos são da equipe; prazos judiciais ficam em <a className="text-cyan-300 underline" href="/prazos">Prazos judiciais</a>.</p>
    {mensagem && <p role="status" className="text-cyan-300">{mensagem}</p>}{erro && <p role="alert" className="text-rose-300">{erro}</p>}
    <section aria-label="Filtros" className="grid gap-3 md:grid-cols-5">
      <div role="group" aria-label="Período" className="flex flex-wrap gap-2 md:col-span-5">{(Object.keys(PERIODOS) as Periodo[]).map((periodo) =>
        <button key={periodo} type="button" aria-pressed={filtros.periodo === periodo} className={filtros.periodo === periodo ? BOTAO : BOTAO_SECUNDARIO}
          onClick={() => alterarFiltro('periodo', periodo)}>{PERIODOS[periodo]}</button>)}</div>
      <label>Responsável<select className={CAMPO} value={filtros.idResponsavel} onChange={(evento) => alterarFiltro('idResponsavel', evento.target.value)}>
        <option value="">Todos</option>{configuracao?.membros.map((membro) => <option key={membro.id} value={membro.id}>{membro.nome}</option>)}</select></label>
      <label>Situação<select className={CAMPO} value={filtros.situacao} onChange={(evento) => alterarFiltro('situacao', evento.target.value)}>
        <option value="">Todas</option>{(Object.keys(SITUACOES_TAREFA) as SituacaoTarefa[]).map((situacao) => <option key={situacao} value={situacao}>{SITUACOES_TAREFA[situacao]}</option>)}</select></label>
      <label>Prioridade<select className={CAMPO} value={filtros.prioridade} onChange={(evento) => alterarFiltro('prioridade', evento.target.value)}>
        <option value="">Todas</option>{(Object.keys(PRIORIDADES) as PrioridadeTarefa[]).map((prioridade) => <option key={prioridade} value={prioridade}>{PRIORIDADES[prioridade]}</option>)}</select></label>
      <div className="flex items-end"><button type="button" className={BOTAO} disabled={!configuracao} onClick={() => { definirFormulario({ dados: novoFormulario() }); definirSelecionada(null); }}>Nova tarefa</button></div>
    </section>
    {carregando ? <p role="status">Carregando tarefas…</p> : tarefas.length === 0 ? <p>Nenhuma tarefa encontrada.</p> :
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Título', 'Prazo interno', 'Prioridade', 'Situação', 'Responsável', ''].map((titulo) => <th key={titulo} className="p-2">{titulo}</th>)}</tr></thead>
        <tbody>{tarefas.map((tarefa) => {
          const atrasada = !!tarefa.prazoInterno && !!configuracao && tarefa.prazoInterno < configuracao.hoje && ['PENDENTE', 'EM_ANDAMENTO'].includes(tarefa.situacao);
          return <tr key={tarefa.id} className="border-t border-slate-700"><td className="p-2">{tarefa.titulo}</td>
            <td className={atrasada ? 'font-semibold text-rose-300' : ''}>{dataBrasileira(tarefa.prazoInterno)}{atrasada && ' (atrasada)'}</td>
            <td>{PRIORIDADES[tarefa.prioridade]}</td><td>{SITUACOES_TAREFA[tarefa.situacao]}</td><td>{tarefa.responsavel.nome}</td>
            <td><button type="button" className={BOTAO_SECUNDARIO} onClick={() => { void abrir(tarefa.id); }}>Abrir</button></td></tr>;
        })}</tbody></table></div>}
    <nav aria-label="Paginação" className="flex gap-4"><button disabled={pagina === 1 || carregando} onClick={() => definirPagina(pagina - 1)}>Anterior</button>
      <span>Página {pagina} de {Math.max(1, Math.ceil(total / TAMANHO_PAGINA))}</span><button disabled={pagina * TAMANHO_PAGINA >= total || carregando} onClick={() => definirPagina(pagina + 1)}>Próxima</button></nav>
    {formulario && configuracao && <FormularioTarefa inicial={formulario.dados} tarefa={formulario.tarefa} configuracao={configuracao}
      aoCancelar={() => definirFormulario(null)} aoSalvar={(tarefa) => { definirFormulario(null); aoAtualizar(tarefa, formulario.tarefa ? 'Tarefa atualizada.' : 'Tarefa criada.'); }} />}
    {selecionada && configuracao && !formulario && <DetalheTarefa tarefa={selecionada} configuracao={configuracao} aoAtualizar={aoAtualizar} aoFechar={() => definirSelecionada(null)}
      aoEditar={() => definirFormulario({ tarefa: selecionada, dados: { titulo: selecionada.titulo, descricao: selecionada.descricao, prioridade: selecionada.prioridade,
        idResponsavel: selecionada.responsavel.id, idRevisor: selecionada.revisor?.id ?? '', prazoInterno: selecionada.prazoInterno ?? '', vinculo: selecionada.vinculo } })} />}
  </Pagina>;
}

function FormularioTarefa({ inicial, tarefa, configuracao, aoSalvar, aoCancelar }: { inicial: Formulario; tarefa?: Tarefa; configuracao: ConfiguracaoTarefas;
  aoSalvar: (tarefa: Tarefa) => void; aoCancelar: () => void }) {
  const { cliente } = useAutenticacao();
  const [dados, definirDados] = useState(inicial), [enviando, definirEnviando] = useState(false), [erro, definirErro] = useState('');
  const pendente = useRef(false);
  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (pendente.current) return;
    if (dados.titulo.trim().length < 3) { definirErro('Informe um título com pelo menos 3 caracteres.'); return; }
    pendente.current = true; definirEnviando(true); definirErro('');
    const corpo = { titulo: dados.titulo, descricao: dados.descricao, prioridade: dados.prioridade, idResponsavel: dados.idResponsavel, idRevisor: dados.idRevisor || null,
      prazoInterno: dados.prazoInterno || null, vinculo: dados.vinculo, ...(tarefa ? { versao: tarefa.versao } : {}) };
    try {
      const resposta = await requisitarApi<Tarefa>(cliente, tarefa ? `/api/v1/tarefas/${tarefa.id}` : '/api/v1/tarefas', { method: tarefa ? 'PATCH' : 'POST', json: corpo });
      if (resposta.ok) aoSalvar(resposta.dados); else definirErro(resposta.mensagem);
    } catch { definirErro('Não foi possível salvar a tarefa.'); } finally { pendente.current = false; definirEnviando(false); }
  }
  return <form onSubmit={(evento) => { void enviar(evento); }} aria-busy={enviando} className={`${CARTAO} max-w-2xl space-y-4`}>
    <h2 className="text-2xl">{tarefa ? 'Editar tarefa' : 'Nova tarefa'}</h2>
    {erro && <p role="alert" className="text-rose-300">{erro}</p>}
    <fieldset disabled={enviando} className="space-y-3">
      <label className="block">Título<input className={CAMPO} required maxLength={200} value={dados.titulo} onChange={(evento) => definirDados({ ...dados, titulo: evento.target.value })} /></label>
      <label className="block">Descrição<textarea className={CAMPO} maxLength={4000} value={dados.descricao} onChange={(evento) => definirDados({ ...dados, descricao: evento.target.value })} /></label>
      <div className="grid gap-3 md:grid-cols-2">
        <label>Prioridade<select className={CAMPO} value={dados.prioridade} onChange={(evento) => definirDados({ ...dados, prioridade: evento.target.value as PrioridadeTarefa })}>
          {(Object.keys(PRIORIDADES) as PrioridadeTarefa[]).map((prioridade) => <option key={prioridade} value={prioridade}>{PRIORIDADES[prioridade]}</option>)}</select></label>
        <label>Prazo interno<input className={CAMPO} type="date" value={dados.prazoInterno} onChange={(evento) => definirDados({ ...dados, prazoInterno: evento.target.value })} /></label>
        <label>Responsável<select className={CAMPO} required value={dados.idResponsavel} onChange={(evento) => definirDados({ ...dados, idResponsavel: evento.target.value })}>
          <option value="">Selecione</option>{configuracao.membros.map((membro) => <option key={membro.id} value={membro.id}>{membro.nome}</option>)}</select></label>
        <label>Revisor (opcional)<select className={CAMPO} value={dados.idRevisor} onChange={(evento) => definirDados({ ...dados, idRevisor: evento.target.value })}>
          <option value="">Sem revisor</option>{configuracao.membros.filter((membro) => membro.id !== dados.idResponsavel).map((membro) => <option key={membro.id} value={membro.id}>{membro.nome}</option>)}</select></label>
      </div>
      <SeletorVinculo valor={dados.vinculo} aoAlterar={(vinculo) => definirDados({ ...dados, vinculo })} />
      <div className="flex gap-3"><button className={BOTAO} type="submit">{enviando ? 'Salvando…' : 'Salvar tarefa'}</button>
        <button type="button" className={BOTAO_SECUNDARIO} onClick={aoCancelar}>Cancelar</button></div>
    </fieldset>
  </form>;
}

function DetalheTarefa({ tarefa, configuracao, aoAtualizar, aoEditar, aoFechar }: { tarefa: Tarefa; configuracao: ConfiguracaoTarefas;
  aoAtualizar: (tarefa: Tarefa, aviso: string) => void; aoEditar: () => void; aoFechar: () => void }) {
  const { cliente, identidade } = useAutenticacao();
  const [observacao, definirObservacao] = useState(''), [novoItem, definirNovoItem] = useState('');
  const [confirmar, definirConfirmar] = useState<SituacaoTarefa | null>(null);
  const [historico, definirHistorico] = useState<EventoHistorico[] | null>(null);
  const [enviando, definirEnviando] = useState(false), [erro, definirErro] = useState('');
  const aberta = tarefa.situacao === 'PENDENTE' || tarefa.situacao === 'EM_ANDAMENTO';
  const podeEditar = tarefa.podeEditar ?? false;
  const podeCancelar = podeEditar && (tarefa.criador.id === configuracao.idUsuario || ['PROPRIETARIO', 'ADMINISTRADOR'].includes(identidade?.escritorio.papel ?? ''));
  async function enviar(caminho: string, corpo: object, aviso: string) {
    if (enviando) return;
    definirEnviando(true); definirErro('');
    try {
      const resposta = await requisitarApi<Tarefa>(cliente, caminho, { method: 'POST', json: { ...corpo, versao: tarefa.versao } });
      if (resposta.ok) { aoAtualizar({ ...resposta.dados, podeEditar }, aviso); definirConfirmar(null); definirObservacao(''); definirNovoItem(''); }
      else definirErro(resposta.mensagem);
    } catch { definirErro('Não foi possível concluir a operação.'); } finally { definirEnviando(false); }
  }
  const situacao = (destino: SituacaoTarefa, aviso: string) => enviar(`/api/v1/tarefas/${tarefa.id}/situacao`, { situacao: destino, ...(observacao.trim() ? { observacao } : {}) }, aviso);
  const checklist = (corpo: object) => enviar(`/api/v1/tarefas/${tarefa.id}/checklist`, corpo, 'Checklist atualizado.');
  async function consultarHistorico() {
    const resposta = await requisitarApi<EventoHistorico[]>(cliente, `/api/v1/tarefas/${tarefa.id}/historico`).catch(() => null);
    if (resposta?.ok) definirHistorico(resposta.dados); else definirErro('Não foi possível consultar o histórico.');
  }
  return <section aria-label="Detalhes da tarefa" className={`${CARTAO} space-y-4`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-2xl">{tarefa.titulo}</h2>
      <button type="button" className={BOTAO_SECUNDARIO} onClick={aoFechar}>Fechar</button></div>
    {erro && <p role="alert" className="text-rose-300">{erro}</p>}
    <dl className="grid gap-2 md:grid-cols-2">
      <div><dt className="text-slate-400">Situação</dt><dd>{SITUACOES_TAREFA[tarefa.situacao]}</dd></div>
      <div><dt className="text-slate-400">Prioridade</dt><dd>{PRIORIDADES[tarefa.prioridade]}</dd></div>
      <div><dt className="text-slate-400">Prazo interno</dt><dd>{dataBrasileira(tarefa.prazoInterno)}</dd></div>
      <div><dt className="text-slate-400">Responsável</dt><dd>{tarefa.responsavel.nome}</dd></div>
      <div><dt className="text-slate-400">Revisor</dt><dd>{tarefa.revisor?.nome ?? '—'}</dd></div>
      <div><dt className="text-slate-400">Criada por</dt><dd>{tarefa.criador.nome} em {dataHoraBrasileira(tarefa.criadoEm)}</dd></div>
      <div><dt className="text-slate-400">Vínculo</dt><dd>{tarefa.vinculo ? `${ROTULOS_VINCULO[tarefa.vinculo.tipo]} ${tarefa.vinculo.id}` : 'Tarefa comum'}</dd></div>
    </dl>
    {tarefa.descricao && <p className="whitespace-pre-wrap">{tarefa.descricao}</p>}
    {tarefa.conclusao && <p role="note" className="rounded border border-emerald-500 p-3">Concluída em {dataHoraBrasileira(tarefa.conclusao.em)} por {tarefa.conclusao.autor.nome}
      {tarefa.conclusao.observacao && <>. Observação: {tarefa.conclusao.observacao}</>}</p>}
    <section aria-label="Checklist" className="space-y-2"><h3 className="text-xl">Checklist</h3>
      {tarefa.checklist.length === 0 && <p className="text-slate-400">Sem itens.</p>}
      <ul>{tarefa.checklist.map((item) => <li key={item.id} className="flex items-center gap-3">
        <label><input type="checkbox" checked={item.concluido} disabled={!aberta || !podeEditar || enviando}
          onChange={(evento) => { void checklist({ tipo: 'MARCAR', idItem: item.id, concluido: evento.target.checked }); }} /> {item.titulo}</label>
        {aberta && podeEditar && <button type="button" className="text-sm text-rose-300" disabled={enviando} onClick={() => { void checklist({ tipo: 'REMOVER', idItem: item.id }); }}>Remover</button>}
      </li>)}</ul>
      {aberta && podeEditar && <form className="flex gap-2" onSubmit={(evento) => { evento.preventDefault(); if (novoItem.trim()) void checklist({ tipo: 'ADICIONAR', titulo: novoItem }); }}>
        <label className="flex-1">Novo item<input className={CAMPO} maxLength={200} value={novoItem} onChange={(evento) => definirNovoItem(evento.target.value)} /></label>
        <button className={BOTAO_SECUNDARIO} disabled={enviando}>Adicionar</button></form>}
    </section>
    {podeEditar && <div className="flex flex-wrap gap-2">
      {aberta && <button type="button" className={BOTAO_SECUNDARIO} onClick={aoEditar}>Editar</button>}
      {tarefa.situacao === 'PENDENTE' && <button type="button" className={BOTAO_SECUNDARIO} disabled={enviando} onClick={() => { void situacao('EM_ANDAMENTO', 'Tarefa em andamento.'); }}>Iniciar</button>}
      {tarefa.situacao === 'EM_ANDAMENTO' && <button type="button" className={BOTAO_SECUNDARIO} disabled={enviando} onClick={() => { void situacao('PENDENTE', 'Tarefa voltou a pendente.'); }}>Voltar a pendente</button>}
      {aberta && <button type="button" className={BOTAO} onClick={() => definirConfirmar('CONCLUIDA')}>Concluir</button>}
      {aberta && podeCancelar && <button type="button" className={BOTAO_SECUNDARIO} onClick={() => definirConfirmar('CANCELADA')}>Cancelar tarefa</button>}
      {!aberta && <button type="button" className={BOTAO_SECUNDARIO} disabled={enviando} onClick={() => { void situacao('PENDENTE', 'Tarefa reaberta. A conclusão anterior permanece no histórico.'); }}>Reabrir</button>}
    </div>}
    {confirmar && <section role="alertdialog" aria-label="Confirmar situação" className="space-y-3 rounded-xl border border-amber-400 p-4">
      <p>{confirmar === 'CONCLUIDA' ? 'Concluir a tarefa? Data e autor serão registrados.' : 'Cancelar a tarefa? Ela continuará no histórico.'}</p>
      {confirmar === 'CONCLUIDA' && <label className="block">Observação da conclusão (opcional)<textarea className={CAMPO} maxLength={2000} value={observacao} onChange={(evento) => definirObservacao(evento.target.value)} /></label>}
      <div className="flex gap-2"><button type="button" className={BOTAO} disabled={enviando} onClick={() => { void situacao(confirmar, confirmar === 'CONCLUIDA' ? 'Tarefa concluída.' : 'Tarefa cancelada.'); }}>Confirmar</button>
        <button type="button" className={BOTAO_SECUNDARIO} onClick={() => definirConfirmar(null)}>Voltar</button></div>
    </section>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={BOTAO_SECUNDARIO} onClick={() => { void consultarHistorico(); }}>Histórico</button>
      <a className={BOTAO_SECUNDARIO} href={`/prazos?tarefa=${tarefa.id}`}>Prazos judiciais desta tarefa</a>
    </div>
    {historico && <ListaHistorico eventos={historico} aoFechar={() => definirHistorico(null)} />}
  </section>;
}
