import type { AutorEscritorio } from '../tasks/task-contracts.js';
import type { Documento } from './document-contracts.js';

export type CodigoErroDocumentos = 'PROIBIDO' | 'NAO_ENCONTRADO' | 'CONFLITO' | 'DADOS_INVALIDOS' | 'DOCUMENTO_INATIVO'
  | 'TIPO_NAO_PERMITIDO' | 'ARQUIVO_GRANDE' | 'ARQUIVO_VAZIO' | 'VINCULO_NAO_ENCONTRADO' | 'ARMAZENAMENTO_INDISPONIVEL';
const SITUACOES_HTTP: Record<CodigoErroDocumentos, number> = { PROIBIDO: 403, NAO_ENCONTRADO: 404, CONFLITO: 409, DADOS_INVALIDOS: 400,
  DOCUMENTO_INATIVO: 409, TIPO_NAO_PERMITIDO: 415, ARQUIVO_GRANDE: 413, ARQUIVO_VAZIO: 400, VINCULO_NAO_ENCONTRADO: 422, ARMAZENAMENTO_INDISPONIVEL: 503 };
export class ErroDocumentos extends Error {
  readonly situacao: number;
  constructor(readonly codigo: CodigoErroDocumentos) { super(codigo); this.situacao = SITUACOES_HTTP[codigo]; }
}

export const TIPOS_ARQUIVO: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', rtf: 'application/rtf',
  txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
};
const GESTORES = ['PROPRIETARIO', 'ADMINISTRADOR'];
const JURIDICOS = ['PROPRIETARIO', 'ADMINISTRADOR', 'ADVOGADO'];

export const PoliticaDocumentos = {
  verConfidenciais: (autor: AutorEscritorio) => JURIDICOS.includes(autor.papel),
  // Documento confidencial invisível é tratado como inexistente para não revelar sua existência.
  exigirAcesso(autor: AutorEscritorio, documento: Documento): void {
    if (documento.confidencial && !this.verConfidenciais(autor) && documento.criador.id !== autor.idUsuario) throw new ErroDocumentos('NAO_ENCONTRADO');
  },
  podeAlterar: (autor: AutorEscritorio, documento: Documento) => JURIDICOS.includes(autor.papel) || documento.criador.id === autor.idUsuario,
  exigirAlteracao(autor: AutorEscritorio, documento: Documento): void {
    this.exigirAcesso(autor, documento);
    if (!this.podeAlterar(autor, documento)) throw new ErroDocumentos('PROIBIDO');
    if (!documento.ativo) throw new ErroDocumentos('DOCUMENTO_INATIVO');
  },
  podeAlterarSituacao: (autor: AutorEscritorio, documento: Documento) => GESTORES.includes(autor.papel) || documento.criador.id === autor.idUsuario,
  // Somente quem pode ver confidenciais consegue marcar um documento como confidencial.
  exigirConfidencialidade(autor: AutorEscritorio, confidencial: boolean): void {
    if (confidencial && !this.verConfidenciais(autor)) throw new ErroDocumentos('PROIBIDO');
  },
  tipoDoArquivo(nomeOriginal: string): string {
    const extensao = /\.([a-z0-9]{1,5})$/i.exec(nomeOriginal)?.[1]?.toLowerCase();
    const tipo = extensao ? TIPOS_ARQUIVO[extensao] : undefined;
    if (!tipo) throw new ErroDocumentos('TIPO_NAO_PERMITIDO');
    return tipo;
  },
  nomeDoArquivo(nomeInformado: string): string {
    // eslint-disable-next-line no-control-regex
    const nome = (nomeInformado.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f"]/g, '').trim();
    if (!nome || nome.length > 255) throw new ErroDocumentos('DADOS_INVALIDOS');
    return nome;
  },
};
