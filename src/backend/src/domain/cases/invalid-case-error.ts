export type CampoCasoInvalido =
  | 'id'
  | 'idEscritorio'
  | 'titulo'
  | 'descricao'
  | 'natureza'
  | 'areaJuridica'
  | 'prioridade'
  | 'situacao'
  | 'idVinculoResponsavel'
  | 'valorCausaCentavos'
  | 'valorEnvolvidoCentavos'
  | 'idsClientes'
  | 'idsVinculosEquipe'
  | 'versao'
  | 'ultimaAtividadeEm'
  | 'criadoEm'
  | 'atualizadoEm'
  | 'nome'
  | 'documento'
  | 'tipoParticipacao'
  | 'oab'
  | 'contato'
  | 'observacao'
  | 'acao'
  | 'atual';

export class ErroCasoInvalido extends Error {
  readonly codigo = 'CASO_INVALIDO';

  constructor(readonly campo: CampoCasoInvalido) {
    super(`Invalid legal case field: ${campo}`);
    this.name = 'ErroCasoInvalido';
  }
}
