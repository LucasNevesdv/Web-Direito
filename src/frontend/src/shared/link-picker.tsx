import { useEffect, useState } from 'react';
import { requisitarApi } from './api';
import { useAutenticacao } from './auth/auth-context';
import { CAMPO } from './ui';

export type TipoVinculo = 'CLIENTE' | 'CASO' | 'PROCESSO';
export interface Vinculo { tipo: TipoVinculo; id: string }
export const ROTULOS_VINCULO: Record<TipoVinculo, string> = { CLIENTE: 'Cliente', CASO: 'Caso', PROCESSO: 'Processo' };

// Seleciona cliente, caso ou processo do escritório; opções vêm de /api/v1/vinculos.
export function SeletorVinculo({ valor, aoAlterar, desabilitado }: { valor: Vinculo | null; aoAlterar: (vinculo: Vinculo | null) => void; desabilitado?: boolean }) {
  const { cliente } = useAutenticacao();
  const [tipo, definirTipo] = useState<TipoVinculo | ''>(valor?.tipo ?? '');
  const [pesquisa, definirPesquisa] = useState('');
  const [opcoes, definirOpcoes] = useState<Array<Vinculo & { rotulo: string }>>([]);
  useEffect(() => {
    if (!tipo) { definirOpcoes([]); return; }
    const controle = new AbortController();
    const temporizador = setTimeout(() => {
      void requisitarApi<Array<Vinculo & { rotulo: string }>>(cliente, `/api/v1/vinculos?tipo=${tipo}&pesquisa=${encodeURIComponent(pesquisa.trim())}`, { signal: controle.signal })
        .then((resposta) => { if (!controle.signal.aborted && resposta.ok) definirOpcoes(resposta.dados); }).catch(() => undefined);
    }, 250);
    return () => { controle.abort(); clearTimeout(temporizador); };
  }, [cliente, tipo, pesquisa]);
  return <fieldset disabled={desabilitado} className="space-y-2"><legend>Vínculo (opcional)</legend>
    <label className="block">Tipo de vínculo<select className={CAMPO} value={tipo} onChange={(evento) => {
      const novo = evento.target.value as TipoVinculo | ''; definirTipo(novo); definirPesquisa(''); aoAlterar(null);
    }}><option value="">Tarefa comum, sem vínculo</option>{(Object.keys(ROTULOS_VINCULO) as TipoVinculo[]).map((item) => <option key={item} value={item}>{ROTULOS_VINCULO[item]}</option>)}</select></label>
    {tipo && <>
      <label className="block">Pesquisar {ROTULOS_VINCULO[tipo].toLowerCase()}<input className={CAMPO} value={pesquisa} onChange={(evento) => definirPesquisa(evento.target.value)} /></label>
      {opcoes.length === 0 ? <p className="text-sm text-slate-400">Nenhum registro de {ROTULOS_VINCULO[tipo].toLowerCase()} disponível neste escritório.</p>
        : <label className="block">Selecionar<select className={CAMPO} value={valor?.id ?? ''} onChange={(evento) => aoAlterar(evento.target.value ? { tipo, id: evento.target.value } : null)}>
          <option value="">Selecione</option>{opcoes.map((opcao) => <option key={opcao.id} value={opcao.id}>{opcao.rotulo}</option>)}</select></label>}
    </>}
  </fieldset>;
}
