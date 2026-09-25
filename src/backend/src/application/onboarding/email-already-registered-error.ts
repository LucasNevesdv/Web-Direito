export class ErroEmailJaCadastrado extends Error {
  readonly codigo = 'EMAIL_JA_CADASTRADO';

  constructor() {
    super('Email already registered');
    this.name = 'ErroEmailJaCadastrado';
  }
}
