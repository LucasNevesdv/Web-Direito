import type { PapelVinculoEscritorio } from '../../domain/memberships/membership.js';

export const PERMISSOES_CASO = [
  'CASO_VISUALIZAR',
  'CASO_CADASTRAR',
  'CASO_EDITAR',
  'CASO_ARQUIVAR_REABRIR',
  'CASO_REGISTRAR_MOVIMENTACAO',
] as const;

export type PermissaoCaso = (typeof PERMISSOES_CASO)[number];

export interface AutorCaso {
  idUsuario: string;
  idEscritorio: string;
  papel: PapelVinculoEscritorio;
  permissoes: string[];
}

export type CodigoErroCasoProcesso =
  | 'PROIBIDO'
  | 'NAO_ENCONTRADO'
  | 'CLIENTE_INVALIDO'
  | 'MEMBRO_EQUIPE_INVALIDO'
  | 'RESPONSAVEL_INVALIDO'
  | 'CNJ_JA_VINCULADO_NO_CASO'
  | 'CASO_ARQUIVADO_SOMENTE_LEITURA'
  | 'CONFLITO'
  | 'DADOS_INVALIDOS';

export class ErroCasoProcesso extends Error {
  constructor(
    readonly codigo: CodigoErroCasoProcesso,
    readonly situacao: number,
    readonly detalhes?: unknown,
  ) {
    super(codigo);
    this.name = 'ErroCasoProcesso';
  }
}

export class PoliticaCasosProcessos {
  static exigir(autor: AutorCaso, permissao: PermissaoCaso): void {
    if (autor.papel === 'PROPRIETARIO') {
      return;
    }
    if (!autor.permissoes.includes(permissao)) {
      throw new ErroCasoProcesso('PROIBIDO', 403);
    }
  }

  static validarPapelResponsavel(papel: PapelVinculoEscritorio): void {
    if (papel !== 'PROPRIETARIO' && papel !== 'ADMINISTRADOR' && papel !== 'ADVOGADO') {
      throw new ErroCasoProcesso('RESPONSAVEL_INVALIDO', 400);
    }
  }
}
