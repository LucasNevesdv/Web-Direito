import { TIPOS, type Historico, type Tipo } from './agenda-types';

const ROTULOS: Record<string, string> = { titulo: 'Título', descricao: 'Descrição', tipo: 'Tipo', inicio: 'Início', fim: 'Fim', local: 'Local',
  linkRemoto: 'Link remoto', lembreteMinutos: 'Lembrete', participantes: 'Participantes', situacao: 'Situação', rotuloVinculo: 'Vínculo', observacao: 'Observação', conflitoConfirmado: 'Sobreposição confirmada' };
const SITUACOES: Record<string, string> = { AGENDADO: 'Agendado', REALIZADO: 'Realizado', CANCELADO: 'Cancelado' };
function formatar(campo: string, valor: unknown, fuso: string): string {
  if (valor == null || valor === '') return 'Não informado';
  if (campo === 'participantes' && Array.isArray(valor)) return valor.map((p: { nome?: string }) => p.nome ?? '').join(', ');
  if (campo === 'inicio' || campo === 'fim') return new Date(String(valor)).toLocaleString('pt-BR', { timeZone: fuso });
  if (campo === 'tipo') return TIPOS[valor as Tipo] ?? String(valor);
  if (campo === 'situacao') return SITUACOES[String(valor)] ?? String(valor);
  if (campo === 'lembreteMinutos') return `${valor} minuto(s) antes`;
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  return String(valor);
}
export function HistoricoCompromisso({ eventos, fuso }: { eventos: Historico[]; fuso: string }) {
  return <details><summary className="cursor-pointer text-cyan-300">Histórico do compromisso (até 200 alterações recentes)</summary>
    <ol className="space-y-3 py-3">{eventos.map((evento) => {
      const antes = (evento.anterior ?? {}) as Record<string, unknown>, depois = (evento.atual ?? {}) as Record<string, unknown>;
      const campos = Object.keys(ROTULOS).filter((campo) => JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo]));
      return <li key={evento.id} className="rounded border border-slate-700 p-3">
        <p>{new Date(evento.criadoEm).toLocaleString('pt-BR', { timeZone: fuso })} — {evento.autor.nome} — {({ CRIADO: 'Criado', ALTERADO: 'Alterado', REALIZADO: 'Realizado', CANCELADO: 'Cancelado' } as Record<string, string>)[evento.acao] ?? evento.acao}</p>
        <details><summary>Ver alteração</summary><dl className="space-y-2 py-2">{campos.map((campo) => <div key={campo}>
          <dt className="font-semibold">{ROTULOS[campo]}</dt><dd className="break-words text-sm text-slate-300">
            {evento.anterior != null && <span className="block">Antes: {formatar(campo, antes[campo], fuso)}</span>}
            Depois: {formatar(campo, depois[campo], fuso)}</dd></div>)}</dl></details>
      </li>;
    })}</ol>
  </details>;
}
