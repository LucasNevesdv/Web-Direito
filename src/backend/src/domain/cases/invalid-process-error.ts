export type CampoProcessoInvalido =
  | 'id'
  | 'idEscritorio'
  | 'idCaso'
  | 'numeroCnj'
  | 'relacaoComCaso'
  | 'tribunal'
  | 'comarca'
  | 'vara'
  | 'instancia'
  | 'faseProcessual'
  | 'versao'
  | 'criadoEm'
  | 'atualizadoEm'
  | 'idProcesso'
  | 'idAutor'
  | 'ocorridaEm'
  | 'descricao';

export class ErroProcessoInvalido extends Error {
  readonly codigo = 'PROCESSO_INVALIDO';

  constructor(
    readonly campo: CampoProcessoInvalido,
    readonly mensagem?: string,
  ) {
    super(mensagem ?? `Invalid legal process field: ${campo}`);
    this.name = 'ErroProcessoInvalido';
  }
}
