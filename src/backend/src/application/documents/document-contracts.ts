import type { Readable } from 'node:stream';
import type { DadosTokenAcesso } from '../authentication/authentication-contracts.js';
import type { CatalogoVinculos, Vinculo } from '../links/business-links.js';
import type { AutorEscritorio, Pessoa } from '../tasks/task-contracts.js';

export const CATEGORIAS_DOCUMENTO = ['CONTRATO', 'PROCURACAO', 'PETICAO', 'DECISAO', 'PROVA', 'DOCUMENTO_PESSOAL', 'COMPROVANTE', 'OUTRO'] as const;
export type CategoriaDocumento = typeof CATEGORIAS_DOCUMENTO[number];
export type AcaoDocumento = 'CRIADO' | 'VISUALIZADO' | 'BAIXADO' | 'NOVA_VERSAO' | 'ALTERADO' | 'INATIVADO' | 'REATIVADO';

export interface VersaoDocumento { numero: number; nomeOriginal: string; tipoConteudo: string; tamanhoBytes: number; sha256: string; enviadoPor: Pessoa; criadoEm: Date }
export interface Documento {
  id: string; nome: string; descricao: string; categoria: CategoriaDocumento; confidencial: boolean; ativo: boolean; vinculo: Vinculo | null;
  versaoAtual: VersaoDocumento; criador: Pessoa; inativadoEm: Date | null; inativadoPor: Pessoa | null; versao: number; criadoEm: Date; atualizadoEm: Date;
}
export interface MetadadosDocumento { nome: string; descricao: string; categoria: CategoriaDocumento; confidencial: boolean; vinculo: Vinculo | null }
export interface NovaVersao { chave: string; nomeOriginal: string; tipoConteudo: string; tamanhoBytes: number; sha256: string }
export interface EventoDocumento { id: string; autor: Pessoa; acao: AcaoDocumento; numeroVersao: number | null; detalhes: unknown; criadoEm: Date }
export interface FiltroDocumentos {
  pesquisa: string; categoria?: CategoriaDocumento; ativos: boolean; vinculo?: Vinculo; verConfidenciais: boolean; pagina: number; tamanhoPagina: number;
}

export interface OperacoesDocumentos {
  autor: AutorEscritorio;
  vinculos: CatalogoVinculos;
  listar(filtro: FiltroDocumentos): Promise<{ documentos: Documento[]; total: number }>;
  consultar(id: string): Promise<Documento>;
  versoes(id: string): Promise<VersaoDocumento[]>;
  chaveDaVersao(id: string, numero: number): Promise<string>;
  eventos(id: string): Promise<EventoDocumento[]>;
  criar(id: string, metadados: MetadadosDocumento, versao: NovaVersao): Promise<Documento>;
  adicionarVersao(anterior: Documento, versao: NovaVersao): Promise<Documento>;
  alterarMetadados(anterior: Documento, metadados: MetadadosDocumento): Promise<Documento>;
  definirSituacao(anterior: Documento, ativo: boolean): Promise<Documento>;
  registrarEvento(id: string, acao: AcaoDocumento, numeroVersao: number | null): Promise<void>;
}
export interface RepositorioDocumentos {
  executar<T>(contexto: DadosTokenAcesso, operacao: (operacoes: OperacoesDocumentos) => Promise<T>): Promise<T>;
}

// Armazenamento de objetos (S3 compatível); o PostgreSQL guarda somente metadados e a chave.
export interface ArmazenamentoArquivos {
  armazenar(chave: string, conteudo: Readable, tipoConteudo: string, limiteBytes: number): Promise<{ tamanhoBytes: number; sha256: string }>;
  abrir(chave: string): Promise<Readable>;
  remover(chave: string): Promise<void>;
}
