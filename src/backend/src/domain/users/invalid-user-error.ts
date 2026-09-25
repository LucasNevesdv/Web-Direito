export type CampoUsuarioInvalido =
  | 'id'
  | 'nome'
  | 'email'
  | 'hashSenha'
  | 'situacao'
  | 'criadoEm'
  | 'atualizadoEm';

export class ErroUsuarioInvalido extends Error {
  readonly codigo = 'USUARIO_INVALIDO';

  constructor(readonly campo: CampoUsuarioInvalido) {
    super(`Invalid user field: ${campo}`);
    this.name = 'ErroUsuarioInvalido';
  }
}
