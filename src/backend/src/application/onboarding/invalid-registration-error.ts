export type CampoCadastroInvalido = 'nomeEscritorio' | 'nomeAdministrador' | 'email' | 'senha';

export class ErroCadastroInvalido extends Error {
  readonly codigo = 'CADASTRO_INVALIDO';

  constructor(readonly campo: CampoCadastroInvalido) {
    super(`Invalid registration field: ${campo}`);
    this.name = 'ErroCadastroInvalido';
  }
}
