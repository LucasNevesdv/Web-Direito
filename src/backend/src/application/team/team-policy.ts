import type { PapelVinculoEscritorio } from '../../domain/memberships/membership.js';

export const PERMISSOES_EQUIPE = ['EQUIPE_VISUALIZAR', 'EQUIPE_CADASTRAR_USUARIO', 'EQUIPE_ALTERAR_USUARIO', 'EQUIPE_DEFINIR_PERMISSOES', 'EQUIPE_ATIVAR_INATIVAR_USUARIO'] as const;
export type PermissaoEquipe = typeof PERMISSOES_EQUIPE[number];
export interface AutorEquipe { idUsuario: string; papel: PapelVinculoEscritorio; permissoes: string[] }
export class ErroEquipe extends Error {
  constructor(readonly codigo: 'PROIBIDO' | 'NAO_ENCONTRADO' | 'CONTA_EXISTENTE' | 'VINCULO_EXISTENTE' | 'VINCULO_INATIVO' | 'CONFLITO' | 'DADOS_INVALIDOS', readonly situacao: number) { super(codigo); }
}
export class PoliticaEquipe {
  static permissoesPadrao(papel: PapelVinculoEscritorio): PermissaoEquipe[] {
    return papel === 'PROPRIETARIO' || papel === 'ADMINISTRADOR' ? [...PERMISSOES_EQUIPE] : [];
  }
  static papeisPermitidos(autor: AutorEquipe): PapelVinculoEscritorio[] {
    return autor.papel === 'PROPRIETARIO' ? ['ADMINISTRADOR', 'ADVOGADO', 'ESTAGIARIO', 'SECRETARIO']
      : autor.papel === 'ADMINISTRADOR' ? ['ADVOGADO', 'ESTAGIARIO', 'SECRETARIO'] : [];
  }
  static exigir(autor: AutorEquipe, permissao: PermissaoEquipe): void {
    const permitidas = autor.papel === 'PROPRIETARIO' ? PERMISSOES_EQUIPE : autor.permissoes;
    if (!permitidas.includes(permissao) || (permissao !== 'EQUIPE_VISUALIZAR' && !['PROPRIETARIO', 'ADMINISTRADOR'].includes(autor.papel))) throw new ErroEquipe('PROIBIDO', 403);
  }
  static validarHierarquia(autor: AutorEquipe, papel: PapelVinculoEscritorio, alvo?: { idUsuario: string; papel: PapelVinculoEscritorio }): void {
    if (alvo && (alvo.idUsuario === autor.idUsuario || !this.papeisPermitidos(autor).includes(alvo.papel))) throw new ErroEquipe('PROIBIDO', 403);
    if (!this.papeisPermitidos(autor).includes(papel)) throw new ErroEquipe('PROIBIDO', 403);
  }
  static validarDestino(autor: AutorEquipe, papel: PapelVinculoEscritorio, permissoes: string[], alvo?: { idUsuario: string; papel: PapelVinculoEscritorio }): void {
    this.validarHierarquia(autor, papel, alvo);
    if (new Set(permissoes).size !== permissoes.length || permissoes.some((p) => !PERMISSOES_EQUIPE.includes(p as PermissaoEquipe))) throw new ErroEquipe('DADOS_INVALIDOS', 400);
    if (permissoes.some((p) => papel !== 'ADMINISTRADOR' && p !== 'EQUIPE_VISUALIZAR')) throw new ErroEquipe('PROIBIDO', 403);
    if (autor.papel !== 'PROPRIETARIO' && permissoes.some((p) => !autor.permissoes.includes(p))) throw new ErroEquipe('PROIBIDO', 403);
  }
}
