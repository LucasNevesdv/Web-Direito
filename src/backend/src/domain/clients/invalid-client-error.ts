export type CampoClienteInvalido =
  | 'id'
  | 'idEscritorio'
  | 'tipoPessoa'
  | 'nome'
  | 'nomeSocial'
  | 'documento'
  | 'email'
  | 'telefone'
  | 'endereco'
  | 'observacoesInternas'
  | 'idVinculoResponsavel'
  | 'situacao'
  | 'versao'
  | 'criadoEm'
  | 'atualizadoEm'
  | 'contato'
  | 'acao'
  | 'atual';

export class ErroClienteInvalido extends Error {
  readonly codigo = 'CLIENTE_INVALIDO';

  constructor(readonly campo: CampoClienteInvalido) {
    super(`Invalid client field: ${campo}`);
    this.name = 'ErroClienteInvalido';
  }
}
