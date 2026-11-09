import { useEffect, useState } from 'react';
import { requisitarApi } from './api';
import { useAutenticacao } from './auth/auth-context';
import { CAMPO } from './ui';

export type TipoVinculo = 'CLIENTE' | 'CASO' | 'PROCESSO';
export interface Vinculo { tipo: TipoVinculo; id: string }
export const ROTULOS_VINCULO: Record<TipoVinculo, string> = { CLIENTE: 'Cliente', CASO: 'Caso', PROCESSO: 'Processo' };

// Seleciona cliente, caso ou processo do escritório; opções vêm de /api/v1/vinculos.
export function SeletorVinculo({ valor, aoAlterar, desabilitado, rotuloSemVinculo = 'Tarefa comum, sem vínculo', rotuloSelecionado, tiposPermitidos }: {
  valor: Vinculo | null; aoAlterar: (vinculo: Vinculo | null) => void; desabilitado?: boolean; rotuloSemVinculo?: string; rotuloSelecionado?: string; tiposPermitidos?: TipoVinculo[];
}) {
  const { cliente } = useAutenticacao();
  const [tipo, definirTipo] = useState<TipoVinculo | ''>(valor?.tipo ?? '');
  const [pesquisa, definirPesquisa] = useState('');
  const [opcoes, definirOpcoes] = useState<Array<Vinculo & { rotulo: string }>>([]);
  const [erro, definirErro] = useState(''), [carregando, definirCarregando] = useState(false);
  const permitido = !tipo || !tiposPermitidos || tiposPermitidos.includes(tipo);
  useEffect(() => {
    definirOpcoes([]); definirErro(''); definirCarregando(false);
    if (!tipo || desabilitado || !permitido) return;
    definirCarregando(true);
    const controle = new AbortController();
    const temporizador = setTimeout(() => {
      void requisitarApi<Array<Vinculo & { rotulo: string }>>(cliente, `/api/v1/vinculos?tipo=${tipo}&pesquisa=${encodeURIComponent(pesquisa.trim())}`, { signal: controle.signal })
        .then((resposta) => {
          if (controle.signal.aborted) return;
          if (resposta.ok) definirOpcoes(resposta.dados); else definirErro(resposta.mensagem);
        }).catch(() => { if (!controle.signal.aborted) definirErro('Não foi possível pesquisar os vínculos. Tente novamente.'); })
        .finally(() => { if (!controle.signal.aborted) definirCarregando(false); });
    }, 250);
    return () => { controle.abort(); clearTimeout(temporizador); };
  }, [cliente, tipo, pesquisa, desabilitado, permitido]);
  return <fieldset disabled={desabilitado} className="space-y-2"><legend>Vínculo (opcional)</legend>
    <label className="block">Tipo de vínculo<select className={CAMPO} value={tipo} onChange={(evento) => {
      const novo = evento.target.value as TipoVinculo | ''; definirTipo(novo); definirPesquisa(''); definirOpcoes([]); aoAlterar(null);
    }}><option value="">{rotuloSemVinculo}</option>{tipo && !permitido && <option value={tipo}>Vínculo atual com acesso restrito</option>}
      {(tiposPermitidos ?? Object.keys(ROTULOS_VINCULO) as TipoVinculo[]).map((item) => <option key={item} value={item}>{ROTULOS_VINCULO[item]}</option>)}</select></label>
    {erro && <p role="alert" className="text-rose-300">{erro}</p>}
    {carregando && <p role="status">Pesquisando vínculos…</p>}
    {tipo && <>
      <label className="block">Pesquisar {ROTULOS_VINCULO[tipo].toLowerCase()}<input className={CAMPO} value={pesquisa} onChange={(evento) => { definirPesquisa(evento.target.value); definirOpcoes([]); }} /></label>
      {opcoes.length === 0 && !valor ? !carregando && !erro && <p className="text-sm text-slate-400">Nenhum registro de {ROTULOS_VINCULO[tipo].toLowerCase()} disponível para seu acesso.</p>
        : <label className="block">Selecionar<select disabled={carregando || !!erro} className={CAMPO} value={valor?.id ?? ''} onChange={(evento) => aoAlterar(evento.target.value ? { tipo, id: evento.target.value } : null)}>
          <option value="">Selecione</option>{valor && !opcoes.some((opcao) => opcao.id === valor.id) && <option value={valor.id}>{rotuloSelecionado ?? 'Vínculo atual'}</option>}
          {opcoes.map((opcao) => <option key={opcao.id} value={opcao.id}>{opcao.rotulo}</option>)}</select></label>}
    </>}
  </fieldset>;
}
