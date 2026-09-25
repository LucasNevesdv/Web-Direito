export type CampoEscritorioInvalido =
  | 'id'
  | 'nome'
  | 'situacao'
  | 'criadoEm'
  | 'atualizadoEm';

export class ErroEscritorioInvalido extends Error {
  readonly codigo = 'ESCRITORIO_INVALIDO';

  constructor(readonly campo: CampoEscritorioInvalido) {
    super(`Invalid office field: ${campo}`);
    this.name = 'ErroEscritorioInvalido';
  }
}
