export const TIPOS_VINCULO = ['CLIENTE', 'CASO', 'PROCESSO'] as const;
export type TipoVinculo = typeof TIPOS_VINCULO[number];
export interface Vinculo { tipo: TipoVinculo; id: string }
export interface OpcaoVinculo extends Vinculo { rotulo: string }

// Resolve vínculos somente dentro do escritório da sessão e da transação em curso.
export interface CatalogoVinculos {
  existe(vinculo: Vinculo): Promise<boolean>;
  pesquisar(tipo: TipoVinculo, pesquisa: string, limite: number): Promise<OpcaoVinculo[]>;
}
