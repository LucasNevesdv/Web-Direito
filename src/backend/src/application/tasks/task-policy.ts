import type { AutorEscritorio, PrazoJudicial, SituacaoTarefa, Tarefa } from './task-contracts.js';

export type CodigoErroTarefas = 'PROIBIDO' | 'NAO_ENCONTRADO' | 'CONFLITO' | 'DADOS_INVALIDOS' | 'TRANSICAO_INVALIDA'
  | 'TAREFA_ENCERRADA' | 'PRAZO_ENCERRADO' | 'VINCULO_NAO_ENCONTRADO' | 'RESPONSAVEL_INVALIDO';
const SITUACOES_HTTP: Record<CodigoErroTarefas, number> = { PROIBIDO: 403, NAO_ENCONTRADO: 404, CONFLITO: 409, DADOS_INVALIDOS: 400,
  TRANSICAO_INVALIDA: 409, TAREFA_ENCERRADA: 409, PRAZO_ENCERRADO: 409, VINCULO_NAO_ENCONTRADO: 422, RESPONSAVEL_INVALIDO: 422 };
export class ErroTarefas extends Error {
  readonly situacao: number;
  constructor(readonly codigo: CodigoErroTarefas) { super(codigo); this.situacao = SITUACOES_HTTP[codigo]; }
}

const TRANSICOES: Record<SituacaoTarefa, SituacaoTarefa[]> = {
  PENDENTE: ['EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'],
  EM_ANDAMENTO: ['PENDENTE', 'CONCLUIDA', 'CANCELADA'],
  CONCLUIDA: ['PENDENTE'],
  CANCELADA: ['PENDENTE'],
};
const GESTORES = ['PROPRIETARIO', 'ADMINISTRADOR'];
const JURIDICOS = ['PROPRIETARIO', 'ADMINISTRADOR', 'ADVOGADO'];

export const PoliticaTarefas = {
  tarefaAberta: (situacao: SituacaoTarefa) => situacao === 'PENDENTE' || situacao === 'EM_ANDAMENTO',
  podeEditarTarefa(autor: AutorEscritorio, tarefa: Tarefa): boolean {
    return GESTORES.includes(autor.papel) || [tarefa.criador.id, tarefa.responsavel.id, tarefa.revisor?.id].includes(autor.idUsuario);
  },
  exigirEdicaoTarefa(autor: AutorEscritorio, tarefa: Tarefa): void {
    if (!this.podeEditarTarefa(autor, tarefa)) throw new ErroTarefas('PROIBIDO');
  },
  exigirTransicao(autor: AutorEscritorio, tarefa: Tarefa, destino: SituacaoTarefa): void {
    this.exigirEdicaoTarefa(autor, tarefa);
    if (!TRANSICOES[tarefa.situacao].includes(destino)) throw new ErroTarefas('TRANSICAO_INVALIDA');
    // Cancelar retira a demanda de todos; restrito a quem a criou ou administra o escritório.
    if (destino === 'CANCELADA' && !GESTORES.includes(autor.papel) && tarefa.criador.id !== autor.idUsuario) throw new ErroTarefas('PROIBIDO');
  },
  // O advogado informa e confirma o prazo judicial; o MVP não calcula dias úteis.
  podeGerirPrazos: (autor: AutorEscritorio) => JURIDICOS.includes(autor.papel),
  exigirGestaoPrazos(autor: AutorEscritorio): void {
    if (!this.podeGerirPrazos(autor)) throw new ErroTarefas('PROIBIDO');
  },
  exigirCumprimentoPrazo(autor: AutorEscritorio, prazo: PrazoJudicial): void {
    if (!JURIDICOS.includes(autor.papel) && prazo.responsavel.id !== autor.idUsuario) throw new ErroTarefas('PROIBIDO');
  },
};
