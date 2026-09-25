export type CampoVinculoInvalido = 'id' | 'idEscritorio' | 'idUsuario' | 'papel' | 'criadoEm';

export class ErroVinculoInvalido extends Error {
  readonly codigo = 'VINCULO_INVALIDO';

  constructor(readonly campo: CampoVinculoInvalido) {
    super(`Invalid membership field: ${campo}`);
    this.name = 'ErroVinculoInvalido';
  }
}
