export class ErroTrocaDeSenha extends Error {
  constructor(readonly codigo: 'TOKEN_INVALIDO' | 'SENHA_INVALIDA' | 'CONFIRMACAO_DIFERENTE' | 'SENHA_REPETIDA' | 'SENHA_ATUAL_INCORRETA') {
    super(codigo);
  }
}
