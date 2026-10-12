import { dataHoraBrasileira } from '../../shared/api';
import { BOTAO_SECUNDARIO } from '../../shared/ui';
import { ACOES_HISTORICO, type EventoHistorico } from './task-types';

export function ListaHistorico({ eventos, aoFechar }: { eventos: EventoHistorico[]; aoFechar: () => void }) {
  return <section aria-label="Histórico de alterações" className="space-y-3">
    <h3 className="text-xl">Histórico de alterações</h3>
    {eventos.length === 0 && <p>Nenhuma alteração registrada.</p>}
    <ol className="space-y-2">{eventos.map((evento) => <li key={evento.id} className="rounded border border-slate-700 p-3 text-sm">
      <p><strong>{ACOES_HISTORICO[evento.acao] ?? evento.acao}</strong> — {dataHoraBrasileira(evento.criadoEm)} — {evento.autor.nome}</p>
      {evento.anterior != null && <details><summary>Detalhes</summary><p>Antes: {JSON.stringify(evento.anterior)}</p><p>Depois: {JSON.stringify(evento.atual)}</p></details>}
    </li>)}</ol>
    <button type="button" className={BOTAO_SECUNDARIO} onClick={aoFechar}>Fechar histórico</button>
  </section>;
}
