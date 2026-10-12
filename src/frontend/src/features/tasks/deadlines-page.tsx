import { useEffect, useRef, useState, type FormEvent } from 'react';
import { dataBrasileira, dataHoraBrasileira, requisitarApi } from '../../shared/api';
import { useAutenticacao } from '../../shared/auth/auth-context';
import { ROTULOS_VINCULO, SeletorVinculo, type Vinculo } from '../../shared/link-picker';
import { BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO, Pagina } from '../../shared/ui';
import { ListaHistorico } from './history-list';
import { ORIGENS_PRAZO, SITUACOES_PRAZO, type ConfiguracaoTarefas, type EventoHistorico, type OrigemPrazo, type PrazoJudicial,
  type SituacaoPrazo } from './task-types';

const TAMANHO_PAGINA = 20;
interface Formulario { descricao: string; dataLimite: string; origem: OrigemPrazo; detalhesOrigem: string; idResponsavel: string; idTarefa: string | null; vinculo: Vinculo | null }

export function PaginaPrazos() {
  const { cliente } = useAutenticacao();
  const idTarefa = new URLSearchParams(window.location.search).get('tarefa');
  const [configuracao, definirConfiguracao] = useState<ConfiguracaoTarefas | null>(null);
  const [filtros, definirFiltros] = useState({ situacao: 'PENDENTE', idResponsavel: '', somenteCriticos: false });
  const [pagina, definirPagina] = useState(1);
  const [prazos, definirPrazos] = useState<PrazoJudicial[]>([]), [total, definirTotal] = useState(0);
  const [formulario, definirFormulario] = useState<{ dados: Formulario; prazo?: PrazoJudicial } | null>(null);
  const [selecionado, definirSelecionado] = useState<PrazoJudicial | null>(null);
  const [revisao, definirRevisao] = useState(0), [carregando, definirCarregando] = useState(true);
  const [mensagem, definirMensagem] = useState(''), [erro, definirErro] = useState('');

  useEffect(() => {
    const controle = new AbortController();
    void requisitarApi<ConfiguracaoTarefas>(cliente, '/api/v1/tarefas/configuracao', { signal: controle.signal })
      .then((resposta) => { if (resposta.ok) definirConfiguracao(resposta.dados); }).catch(() => undefined);
    return () => controle.abort();
  }, [cliente]);
  useEffect(() => {
    const controle = new AbortController(); definirCarregando(true);
    const consulta = new URLSearchParams({ pagina: String(pagina), tamanhoPagina: String(TAMANHO_PAGINA), somenteCriticos: String(filtros.somenteCriticos) });
    if (filtros.situacao && !filtros.somenteCriticos) consulta.set('situacao', filtros.situacao);
    if (filtros.idResponsavel) consulta.set('idResponsavel', filtros.idResponsavel);
    if (idTarefa) consulta.set('idTarefa', idTarefa);
    void requisitarApi<{ prazos: PrazoJudicial[]; total: number }>(cliente, `/api/v1/prazos?${consulta}`, { signal: controle.signal })
      .then((resposta) => { if (controle.signal.aborted) return; if (resposta.ok) { definirPrazos(resposta.dados.prazos); definirTotal(resposta.dados.total); } else definirErro(resposta.mensagem); })
      .catch(() => { if (!controle.signal.aborted) definirErro('Não foi possível carregar os prazos.'); })
      .finally(() => { if (!controle.signal.aborted) definirCarregando(false); });
    return () => controle.abort();
  }, [cliente, filtros, pagina, revisao, idTarefa]);

  function aoAtualizar(prazo: PrazoJudicial, aviso: string) { definirSelecionado(prazo); definirFormulario(null); definirMensagem(aviso); definirErro(''); definirRevisao((atual) => atual + 1); }
  const novo = (): Formulario => ({ descricao: '', dataLimite: '', origem: 'INTIMACAO', detalhesOrigem: '', idResponsavel: configuracao?.idUsuario ?? '', idTarefa, vinculo: null });

  return <Pagina caminho="/prazos" titulo="Prazos judiciais">
    <p className="text-slate-300">A data é informada e confirmada pelo advogado conforme o documento de origem; o sistema não calcula dias úteis.
      {configuracao && <> Prazos pendentes até {configuracao.diasPrazoCritico} dia(s) à frente são críticos e escalados a proprietários e administradores.</>}</p>
    {idTarefa && <p role="note">Exibindo prazos da tarefa selecionada. <a className="text-cyan-300 underline" href="/prazos">Ver todos</a></p>}
    {mensagem && <p role="status" className="text-cyan-300">{mensagem}</p>}{erro && <p role="alert" className="text-rose-300">{erro}</p>}
    <section aria-label="Filtros" className="grid gap-3 md:grid-cols-4">
      <label>Situação<select className={CAMPO} value={filtros.situacao} disabled={filtros.somenteCriticos} onChange={(evento) => { definirPagina(1); definirFiltros({ ...filtros, situacao: evento.target.value }); }}>
        <option value="">Todas</option>{(Object.keys(SITUACOES_PRAZO) as SituacaoPrazo[]).map((situacao) => <option key={situacao} value={situacao}>{SITUACOES_PRAZO[situacao]}</option>)}</select></label>
      <label>Responsável<select className={CAMPO} value={filtros.idResponsavel} onChange={(evento) => { definirPagina(1); definirFiltros({ ...filtros, idResponsavel: evento.target.value }); }}>
        <option value="">Todos</option>{configuracao?.membros.map((membro) => <option key={membro.id} value={membro.id}>{membro.nome}</option>)}</select></label>
      <label className="flex items-end gap-2"><input type="checkbox" checked={filtros.somenteCriticos} onChange={(evento) => { definirPagina(1); definirFiltros({ ...filtros, somenteCriticos: evento.target.checked }); }} /> Somente críticos</label>
      {configuracao?.podeGerirPrazos && <div className="flex items-end"><button type="button" className={BOTAO} onClick={() => { definirFormulario({ dados: novo() }); definirSelecionado(null); }}>Registrar prazo judicial</button></div>}
    </section>
    {carregando ? <p role="status">Carregando prazos…</p> : prazos.length === 0 ? <p>Nenhum prazo encontrado.</p> :
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Data limite', 'Descrição', 'Origem', 'Situação', 'Responsável', ''].map((titulo) => <th key={titulo} className="p-2">{titulo}</th>)}</tr></thead>
        <tbody>{prazos.map((prazo) => <tr key={prazo.id} className={`border-t border-slate-700 ${prazo.critico ? 'bg-rose-950/40' : ''}`}>
          <td className="p-2">{dataBrasileira(prazo.dataLimite)}{prazo.vencido ? <strong className="ml-2 text-rose-300">Vencido</strong> : prazo.critico && <strong className="ml-2 text-amber-300">Crítico</strong>}</td>
          <td>{prazo.descricao}</td><td>{ORIGENS_PRAZO[prazo.origem]}</td><td>{SITUACOES_PRAZO[prazo.situacao]}</td><td>{prazo.responsavel.nome}</td>
          <td><button type="button" className={BOTAO_SECUNDARIO} onClick={() => { definirSelecionado(prazo); definirFormulario(null); }}>Abrir</button></td></tr>)}</tbody></table></div>}
    <nav aria-label="Paginação" className="flex gap-4"><button disabled={pagina === 1 || carregando} onClick={() => definirPagina(pagina - 1)}>Anterior</button>
      <span>Página {pagina} de {Math.max(1, Math.ceil(total / TAMANHO_PAGINA))}</span><button disabled={pagina * TAMANHO_PAGINA >= total || carregando} onClick={() => definirPagina(pagina + 1)}>Próxima</button></nav>
    {formulario && configuracao && <FormularioPrazo inicial={formulario.dados} prazo={formulario.prazo} configuracao={configuracao} aoCancelar={() => definirFormulario(null)}
      aoSalvar={(prazo) => aoAtualizar(prazo, formulario.prazo ? 'Prazo atualizado e reconfirmado.' : 'Prazo judicial registrado e confirmado.')} />}
    {selecionado && configuracao && !formulario && <DetalhePrazo prazo={selecionado} configuracao={configuracao} aoAtualizar={aoAtualizar} aoFechar={() => definirSelecionado(null)}
      aoEditar={() => definirFormulario({ prazo: selecionado, dados: { descricao: selecionado.descricao, dataLimite: selecionado.dataLimite, origem: selecionado.origem,
        detalhesOrigem: selecionado.detalhesOrigem, idResponsavel: selecionado.responsavel.id, idTarefa: selecionado.idTarefa, vinculo: selecionado.vinculo } })} />}
  </Pagina>;
}

function FormularioPrazo({ inicial, prazo, configuracao, aoSalvar, aoCancelar }: { inicial: Formulario; prazo?: PrazoJudicial; configuracao: ConfiguracaoTarefas;
  aoSalvar: (prazo: PrazoJudicial) => void; aoCancelar: () => void }) {
  const { cliente } = useAutenticacao();
  const [dados, definirDados] = useState(inicial), [confirmado, definirConfirmado] = useState(false);
  const [enviando, definirEnviando] = useState(false), [erro, definirErro] = useState('');
  const pendente = useRef(false);
  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (pendente.current) return;
    if (!confirmado) { definirErro('Confirme que conferiu a data no documento de origem.'); return; }
    if (dados.origem === 'OUTRA' && !dados.detalhesOrigem.trim()) { definirErro('Descreva a origem do prazo.'); return; }
    pendente.current = true; definirEnviando(true); definirErro('');
    try {
      const resposta = await requisitarApi<PrazoJudicial>(cliente, prazo ? `/api/v1/prazos/${prazo.id}` : '/api/v1/prazos',
        { method: prazo ? 'PATCH' : 'POST', json: { ...dados, ...(prazo ? { versao: prazo.versao } : {}) } });
      if (resposta.ok) aoSalvar(resposta.dados); else definirErro(resposta.mensagem);
    } catch { definirErro('Não foi possível salvar o prazo.'); } finally { pendente.current = false; definirEnviando(false); }
  }
  return <form onSubmit={(evento) => { void enviar(evento); }} aria-busy={enviando} className={`${CARTAO} max-w-2xl space-y-4`}>
    <h2 className="text-2xl">{prazo ? 'Alterar prazo judicial' : 'Registrar prazo judicial'}</h2>
    {erro && <p role="alert" className="text-rose-300">{erro}</p>}
    <fieldset disabled={enviando} className="space-y-3">
      <label className="block">Descrição<input className={CAMPO} required maxLength={500} value={dados.descricao} onChange={(evento) => definirDados({ ...dados, descricao: evento.target.value })} /></label>
      <div className="grid gap-3 md:grid-cols-2">
        <label>Data limite<input className={CAMPO} type="date" required value={dados.dataLimite} onChange={(evento) => definirDados({ ...dados, dataLimite: evento.target.value })} /></label>
        <label>Responsável<select className={CAMPO} required value={dados.idResponsavel} onChange={(evento) => definirDados({ ...dados, idResponsavel: evento.target.value })}>
          <option value="">Selecione</option>{configuracao.membros.map((membro) => <option key={membro.id} value={membro.id}>{membro.nome}</option>)}</select></label>
        <label>Origem do prazo<select className={CAMPO} value={dados.origem} onChange={(evento) => definirDados({ ...dados, origem: evento.target.value as OrigemPrazo })}>
          {(Object.keys(ORIGENS_PRAZO) as OrigemPrazo[]).map((origem) => <option key={origem} value={origem}>{ORIGENS_PRAZO[origem]}</option>)}</select></label>
        <label>Detalhes da origem{dados.origem === 'OUTRA' ? '' : ' (opcional)'}<input className={CAMPO} maxLength={500} value={dados.detalhesOrigem}
          placeholder="Ex.: intimação de 05/10 no DJe" onChange={(evento) => definirDados({ ...dados, detalhesOrigem: evento.target.value })} /></label>
      </div>
      {dados.idTarefa && <p>Vinculado à tarefa selecionada. <button type="button" className="text-cyan-300 underline" onClick={() => definirDados({ ...dados, idTarefa: null })}>Desvincular</button></p>}
      <SeletorVinculo valor={dados.vinculo} aoAlterar={(vinculo) => definirDados({ ...dados, vinculo })} />
      <label className="flex gap-2"><input type="checkbox" checked={confirmado} onChange={(evento) => definirConfirmado(evento.target.checked)} />
        Confirmo que conferi a data limite no documento de origem.</label>
      <div className="flex gap-3"><button className={BOTAO} type="submit">{enviando ? 'Salvando…' : 'Salvar prazo'}</button>
        <button type="button" className={BOTAO_SECUNDARIO} onClick={aoCancelar}>Cancelar</button></div>
    </fieldset>
  </form>;
}

function DetalhePrazo({ prazo, configuracao, aoAtualizar, aoEditar, aoFechar }: { prazo: PrazoJudicial; configuracao: ConfiguracaoTarefas;
  aoAtualizar: (prazo: PrazoJudicial, aviso: string) => void; aoEditar: () => void; aoFechar: () => void }) {
  const { cliente } = useAutenticacao();
  const [observacao, definirObservacao] = useState(''), [confirmar, definirConfirmar] = useState<SituacaoPrazo | null>(null);
  const [historico, definirHistorico] = useState<EventoHistorico[] | null>(null);
  const [enviando, definirEnviando] = useState(false), [erro, definirErro] = useState('');
  const podeCumprir = configuracao.podeGerirPrazos || prazo.responsavel.id === configuracao.idUsuario;
  async function alterarSituacao(situacao: SituacaoPrazo, aviso: string) {
    if (enviando) return;
    definirEnviando(true); definirErro('');
    try {
      const resposta = await requisitarApi<PrazoJudicial>(cliente, `/api/v1/prazos/${prazo.id}/situacao`, { method: 'POST',
        json: { situacao, versao: prazo.versao, ...(observacao.trim() ? { observacao } : {}) } });
      if (resposta.ok) { aoAtualizar(resposta.dados, aviso); definirConfirmar(null); definirObservacao(''); } else definirErro(resposta.mensagem);
    } catch { definirErro('Não foi possível alterar o prazo.'); } finally { definirEnviando(false); }
  }
  async function consultarHistorico() {
    const resposta = await requisitarApi<EventoHistorico[]>(cliente, `/api/v1/prazos/${prazo.id}/historico`).catch(() => null);
    if (resposta?.ok) definirHistorico(resposta.dados); else definirErro('Não foi possível consultar o histórico.');
  }
  return <section aria-label="Detalhes do prazo" className={`${CARTAO} space-y-4`}>
    <div className="flex justify-between gap-3"><h2 className="text-2xl">{prazo.descricao}</h2><button type="button" className={BOTAO_SECUNDARIO} onClick={aoFechar}>Fechar</button></div>
    {erro && <p role="alert" className="text-rose-300">{erro}</p>}
    <dl className="grid gap-2 md:grid-cols-2">
      <div><dt className="text-slate-400">Data limite</dt><dd>{dataBrasileira(prazo.dataLimite)}{prazo.vencido ? ' — vencido' : prazo.critico ? ' — crítico' : ''}</dd></div>
      <div><dt className="text-slate-400">Situação</dt><dd>{SITUACOES_PRAZO[prazo.situacao]}</dd></div>
      <div><dt className="text-slate-400">Origem</dt><dd>{ORIGENS_PRAZO[prazo.origem]}{prazo.detalhesOrigem && ` — ${prazo.detalhesOrigem}`}</dd></div>
      <div><dt className="text-slate-400">Responsável</dt><dd>{prazo.responsavel.nome}</dd></div>
      <div><dt className="text-slate-400">Confirmado por</dt><dd>{prazo.confirmadoPor.nome} em {dataHoraBrasileira(prazo.confirmadoEm)}</dd></div>
      <div><dt className="text-slate-400">Vínculo</dt><dd>{prazo.vinculo ? `${ROTULOS_VINCULO[prazo.vinculo.tipo]} ${prazo.vinculo.id}` : '—'}{prazo.idTarefa && <> · <a className="text-cyan-300 underline" href={`/prazos?tarefa=${prazo.idTarefa}`}>tarefa vinculada</a></>}</dd></div>
    </dl>
    {prazo.conclusao && <p role="note" className="rounded border border-emerald-500 p-3">Cumprido em {dataHoraBrasileira(prazo.conclusao.em)} por {prazo.conclusao.autor.nome}
      {prazo.conclusao.observacao && <>. Observação: {prazo.conclusao.observacao}</>}</p>}
    <div className="flex flex-wrap gap-2">
      {prazo.situacao === 'PENDENTE' && configuracao.podeGerirPrazos && <button type="button" className={BOTAO_SECUNDARIO} onClick={aoEditar}>Alterar</button>}
      {prazo.situacao === 'PENDENTE' && podeCumprir && <button type="button" className={BOTAO} onClick={() => definirConfirmar('CUMPRIDO')}>Marcar como cumprido</button>}
      {prazo.situacao === 'PENDENTE' && configuracao.podeGerirPrazos && <button type="button" className={BOTAO_SECUNDARIO} onClick={() => definirConfirmar('CANCELADO')}>Cancelar prazo</button>}
      {prazo.situacao !== 'PENDENTE' && configuracao.podeGerirPrazos && <button type="button" className={BOTAO_SECUNDARIO} disabled={enviando}
        onClick={() => { void alterarSituacao('PENDENTE', 'Prazo reaberto.'); }}>Reabrir</button>}
      <button type="button" className={BOTAO_SECUNDARIO} onClick={() => { void consultarHistorico(); }}>Histórico</button>
    </div>
    {confirmar && <section role="alertdialog" aria-label="Confirmar situação do prazo" className="space-y-3 rounded-xl border border-amber-400 p-4">
      <p>{confirmar === 'CUMPRIDO' ? 'Confirmar o cumprimento do prazo? Data e autor serão registrados.' : 'Cancelar este prazo? Ele permanecerá no histórico.'}</p>
      {confirmar === 'CUMPRIDO' && <label className="block">Observação (opcional)<textarea className={CAMPO} maxLength={2000} value={observacao} onChange={(evento) => definirObservacao(evento.target.value)} /></label>}
      <div className="flex gap-2"><button type="button" className={BOTAO} disabled={enviando} onClick={() => { void alterarSituacao(confirmar, confirmar === 'CUMPRIDO' ? 'Prazo cumprido.' : 'Prazo cancelado.'); }}>Confirmar</button>
        <button type="button" className={BOTAO_SECUNDARIO} onClick={() => definirConfirmar(null)}>Voltar</button></div>
    </section>}
    {historico && <ListaHistorico eventos={historico} aoFechar={() => definirHistorico(null)} />}
  </section>;
}
