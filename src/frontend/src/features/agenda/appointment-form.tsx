import { useRef, useState } from 'react';
import { requisitarApi } from '../../shared/api';
import { useAutenticacao } from '../../shared/auth/auth-context';
import { SeletorVinculo, type Vinculo } from '../../shared/link-picker';
import { BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO } from '../../shared/ui';
import { dataHoraNoFuso, instanteNoFuso } from './agenda-dates';
import { TIPOS, type Compromisso, type ConfiguracaoAgenda, type Tipo } from './agenda-types';

export function FormularioCompromisso({ evento, configuracao, dia, aoSalvar, aoFechar }: {
  evento: Compromisso | null; configuracao: ConfiguracaoAgenda; dia: string; aoSalvar: (evento: Compromisso) => void; aoFechar: () => void;
}) {
  const { cliente } = useAutenticacao();
  const [titulo, setTitulo] = useState(evento?.titulo ?? ''), [descricao, setDescricao] = useState(evento?.descricao ?? '');
  const [tipo, setTipo] = useState<Tipo>(evento?.tipo ?? 'REUNIAO');
  const [inicio, setInicio] = useState(evento ? dataHoraNoFuso(evento.inicio, configuracao.fusoHorario) : `${dia}T09:00`);
  const [fim, setFim] = useState(evento ? dataHoraNoFuso(evento.fim, configuracao.fusoHorario) : `${dia}T10:00`);
  const [local, setLocal] = useState(evento?.local ?? ''), [linkRemoto, setLink] = useState(evento?.linkRemoto ?? '');
  const [participantes, setParticipantes] = useState(evento?.participantes.map((p) => p.id) ?? [configuracao.idUsuario]);
  const [vinculo, setVinculo] = useState<Vinculo | null>(evento?.vinculo ?? null);
  const [lembrete, setLembrete] = useState(evento?.lembreteMinutos?.toString() ?? '');
  const [erro, setErro] = useState(''), [salvando, setSalvando] = useState(false);
  const [conflito, setConflito] = useState(false), [confirmar, setConfirmar] = useState(false);
  const envioPendente = useRef(false);
  const membros = [...configuracao.membros, ...(evento?.participantes.filter((p) => !configuracao.membros.some((m) => m.id === p.id)) ?? [])];
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (envioPendente.current) return;
    envioPendente.current = true; setErro(''); setSalvando(true);
    try {
      const dados = { titulo, descricao, tipo, inicio: instanteNoFuso(inicio, configuracao.fusoHorario), fim: instanteNoFuso(fim, configuracao.fusoHorario),
        local, linkRemoto, participantes, vinculo, lembreteMinutos: lembrete === '' ? null : Number(lembrete), confirmarConflito: confirmar,
        ...(evento ? { versao: evento.versao } : {}) };
      const resposta = await requisitarApi<Compromisso & { erro?: string }>(cliente, `/api/v1/agenda${evento ? `/${evento.id}` : ''}`, { method: evento ? 'PATCH' : 'POST', json: dados });
      if (!resposta.ok) { setErro(resposta.mensagem); setConflito(resposta.dados?.erro === 'CONFLITO_HORARIO'); setConfirmar(false); return; }
      aoSalvar(resposta.dados);
    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar. Tente novamente.'); }
    finally { envioPendente.current = false; setSalvando(false); }
  }
  return <form className={`${CARTAO} space-y-4`} onSubmit={(e) => { void salvar(e); }} onChange={() => { setConfirmar(false); setConflito(false); }}>
    <h2 className="text-xl font-semibold">{evento ? 'Editar compromisso' : 'Novo compromisso'}</h2>
    <p className="text-sm text-slate-400">Horários no fuso {configuracao.fusoHorario}. Lembretes aparecem na Agenda enquanto o sistema estiver aberto.</p>
    {erro && <p role="alert" className="text-rose-300">{erro}</p>}
    <fieldset disabled={salvando} className="grid gap-4 sm:grid-cols-2">
      <label>Título<input autoFocus required minLength={3} maxLength={200} className={CAMPO} value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
      <label>Tipo<select className={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>{Object.entries(TIPOS).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>
      <label>Início<input required type="datetime-local" className={CAMPO} value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
      <label>Fim<input required type="datetime-local" className={CAMPO} value={fim} onChange={(e) => setFim(e.target.value)} /></label>
      <label>Local<input maxLength={500} className={CAMPO} value={local} onChange={(e) => setLocal(e.target.value)} /></label>
      <label>Link remoto<input type="url" maxLength={2000} className={CAMPO} value={linkRemoto} onChange={(e) => setLink(e.target.value)} /></label>
      <label className="sm:col-span-2">Descrição<textarea maxLength={4000} className={CAMPO} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></label>
      <fieldset className="space-y-2"><legend>Participantes (pelo menos um)</legend>{membros.map((p) => <label key={p.id} className="flex gap-2">
        <input type="checkbox" checked={participantes.includes(p.id)} onChange={(e) => setParticipantes(e.target.checked ? [...participantes, p.id] : participantes.filter((id) => id !== p.id))} />
        {p.nome}{!configuracao.membros.some((m) => m.id === p.id) && ' (inativo — remova antes de salvar)'}</label>)}</fieldset>
      <label>Lembrete (minutos antes)<input type="number" min={0} max={10080} step={1} placeholder="Sem lembrete" className={CAMPO} value={lembrete} onChange={(e) => setLembrete(e.target.value)} /><span className="text-sm text-slate-400">0: no início; 15: quinze minutos antes. Vazio: sem lembrete.</span></label>
      <div className="sm:col-span-2">
        {evento?.vinculoRestrito && <p>O vínculo atual tem acesso restrito e será preservado nesta edição.</p>}
        <SeletorVinculo valor={vinculo} aoAlterar={setVinculo} desabilitado={evento?.vinculoRestrito} tiposPermitidos={configuracao.tiposVinculoPermitidos}
          rotuloSemVinculo="Compromisso sem vínculo" rotuloSelecionado={evento?.vinculoRestrito ? 'Vínculo com acesso restrito' : evento?.rotuloVinculo ?? undefined} />
      </div>
    </fieldset>
    {conflito && <label className="flex gap-2 rounded border border-amber-400 p-3"><input type="checkbox" checked={confirmar}
      onChange={(e) => { e.stopPropagation(); setConfirmar(e.target.checked); }} />Confirmo que desejo salvar mesmo com a sobreposição de horários.</label>}
    <div className="flex gap-3"><button className={BOTAO} disabled={salvando || (conflito && !confirmar)}>{salvando ? 'Salvando…' : 'Salvar compromisso'}</button>
      <button type="button" className={BOTAO_SECUNDARIO} disabled={salvando} onClick={aoFechar}>Fechar formulário</button></div>
  </form>;
}
