import type { PapelVinculoEscritorio } from '../../domain/memberships/membership.js';

export const PERMISSOES_CLIENTE = [
  'CLIENTE_VISUALIZAR',
  'CLIENTE_VISUALIZAR_OBSERVACOES',
  'CLIENTE_CADASTRAR',
  'CLIENTE_EDITAR',
  'CLIENTE_ATIVAR_INATIVAR',
] as const;

export type PermissaoCliente = typeof PERMISSOES_CLIENTE[number];

export interface AutorCliente {
  idUsuario: string;
  idEscritorio: string;
  papel: PapelVinculoEscritorio;
  permissoes: string[];
}

export type CodigoErroCliente =
  | 'PROIBIDO'
  | 'NAO_ENCONTRADO'
  | 'DOCUMENTO_JA_CADASTRADO'
  | 'POSSIVEL_DUPLICIDADE'
  | 'RESPONSAVEL_INVALIDO'
  | 'CONFLITO'
  | 'DADOS_INVALIDOS';

export class ErroCliente extends Error {
  constructor(
    readonly codigo: CodigoErroCliente,
    readonly situacao: number,
    readonly detalhes?: unknown,
  ) {
    super(codigo);
    this.name = 'ErroCliente';
  }
}

export class PoliticaClientes {
  static permissoesPadrao(papel: PapelVinculoEscritorio): PermissaoCliente[] {
    if (papel === 'PROPRIETARIO' || papel === 'ADMINISTRADOR' || papel === 'ADVOGADO') {
      return [...PERMISSOES_CLIENTE];
    }
    if (papel === 'ESTAGIARIO') {
      return [
        'CLIENTE_VISUALIZAR',
        'CLIENTE_VISUALIZAR_OBSERVACOES',
        'CLIENTE_CADASTRAR',
        'CLIENTE_EDITAR',
      ];
    }
    return [];
  }

  static permissoesEfetivas(autor: AutorCliente): string[] {
    const padrao = this.permissoesPadrao(autor.papel);
    return Array.from(new Set([...padrao, ...autor.permissoes]));
  }

  static exigir(autor: AutorCliente, permissao: PermissaoCliente): void {
    if (autor.papel === 'PROPRIETARIO') {
      return;
    }
    const permitidas = this.permissoesEfetivas(autor);
    if (!permitidas.includes(permissao)) {
      throw new ErroCliente('PROIBIDO', 403);
    }
  }

  static podeVisualizarObservacoes(autor: AutorCliente): boolean {
    if (autor.papel === 'PROPRIETARIO') return true;
    return this.permissoesEfetivas(autor).includes('CLIENTE_VISUALIZAR_OBSERVACOES');
  }

  static validarPapelResponsavel(papel: PapelVinculoEscritorio): void {
    if (papel !== 'PROPRIETARIO' && papel !== 'ADMINISTRADOR' && papel !== 'ADVOGADO') {
      throw new ErroCliente('RESPONSAVEL_INVALIDO', 400);
    }
  }
}
