import type { AutorEscritorio } from '../tasks/task-contracts.js';
import type { Compromisso } from './agenda-contracts.js';

export const MENSAGENS_AGENDA = {
  PROIBIDO: 'Você não tem autorização para alterar este compromisso.',
  NAO_ENCONTRADO: 'Registro não encontrado neste escritório.',
  DADOS_INVALIDOS: 'Confira os dados, o período e o endereço do link remoto.',
  PARTICIPANTE_INVALIDO: 'Selecione participantes ativos deste escritório.',
  VINCULO_INVALIDO: 'O vínculo informado não existe neste escritório.',
  VINCULO_PROIBIDO: 'Você não tem permissão para selecionar um vínculo deste tipo.',
  CONFLITO: 'O compromisso foi alterado. Reabra o registro antes de salvar.',
  CONFLITO_HORARIO: 'Um participante já tem compromisso neste horário. Confirme a sobreposição para continuar.',
  ENCERRADO: 'Compromissos realizados ou cancelados não podem ser alterados.',
} as const;
export class ErroAgenda extends Error {
  readonly situacao: number;
  constructor(readonly codigo: keyof typeof MENSAGENS_AGENDA) {
    super(codigo);
    this.situacao = ['PROIBIDO', 'VINCULO_PROIBIDO'].includes(codigo) ? 403 : codigo === 'NAO_ENCONTRADO' ? 404
      : ['CONFLITO', 'CONFLITO_HORARIO', 'ENCERRADO'].includes(codigo) ? 409 : 400;
  }
}
export const gestorAgenda = (autor: AutorEscritorio) => ['PROPRIETARIO', 'ADMINISTRADOR'].includes(autor.papel);
export const podeCancelar = (autor: AutorEscritorio, evento: Pick<Compromisso, 'criador'>) => gestorAgenda(autor) || evento.criador.id === autor.idUsuario;
export const podeEditar = (autor: AutorEscritorio, evento: Pick<Compromisso, 'criador' | 'participantes'>) =>
  podeCancelar(autor, evento) || evento.participantes.some((pessoa) => pessoa.id === autor.idUsuario);
