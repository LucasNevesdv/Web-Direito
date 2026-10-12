import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { DadosTokenAcesso, TokensAcesso } from '../authentication/authentication-contracts.js';
import type { Vinculo } from '../links/business-links.js';
import type { ArmazenamentoArquivos, CategoriaDocumento, Documento, MetadadosDocumento, NovaVersao, OperacoesDocumentos,
  RepositorioDocumentos } from './document-contracts.js';
import { ErroDocumentos, PoliticaDocumentos } from './document-policy.js';

export interface ArquivoRecebido { nomeOriginal: string; conteudo: Readable }
export interface FiltroConsultaDocumentos { pesquisa: string; categoria?: CategoriaDocumento; ativos: boolean; vinculo?: Vinculo; pagina: number; tamanhoPagina: number }

function texto(valor: string, minimo: number, maximo: number): string {
  const normalizado = valor.trim();
  const tamanho = Array.from(normalizado).length;
  if (tamanho < minimo || tamanho > maximo) throw new ErroDocumentos('DADOS_INVALIDOS');
  return normalizado;
}

export class GestaoDocumentos {
  constructor(private readonly repositorio: RepositorioDocumentos, private readonly tokens: Pick<TokensAcesso, 'validarTokenDeAcesso'>,
    private readonly armazenamento: ArmazenamentoArquivos, private readonly limiteBytes: number) {}

  private executarNoContexto<T>(contexto: DadosTokenAcesso, operacao: (operacoes: OperacoesDocumentos) => Promise<T>): Promise<T> {
    return this.repositorio.executar(contexto, operacao);
  }
  private async executar<T>(token: string, operacao: (operacoes: OperacoesDocumentos) => Promise<T>): Promise<T> {
    return this.executarNoContexto(await this.tokens.validarTokenDeAcesso(token), operacao);
  }
  private apresentar(operacoes: OperacoesDocumentos, documento: Documento) {
    return { ...documento, podeAlterar: PoliticaDocumentos.podeAlterar(operacoes.autor, documento),
      podeAlterarSituacao: PoliticaDocumentos.podeAlterarSituacao(operacoes.autor, documento) };
  }
  private async validarMetadados(operacoes: OperacoesDocumentos, dados: MetadadosDocumento): Promise<MetadadosDocumento> {
    PoliticaDocumentos.exigirConfidencialidade(operacoes.autor, dados.confidencial);
    if (dados.vinculo && !await operacoes.vinculos.existe(dados.vinculo)) throw new ErroDocumentos('VINCULO_NAO_ENCONTRADO');
    return { ...dados, nome: texto(dados.nome, 2, 200), descricao: texto(dados.descricao, 0, 2000) };
  }
  // Envia o binário fora da transação; a gravação dos metadados revalida tudo e remove o objeto se falhar.
  private async armazenarVersao(contexto: DadosTokenAcesso, idDocumento: string, arquivo: ArquivoRecebido,
    gravar: (versao: NovaVersao) => Promise<Documento>): Promise<Documento> {
    const nomeOriginal = PoliticaDocumentos.nomeDoArquivo(arquivo.nomeOriginal);
    const tipoConteudo = PoliticaDocumentos.tipoDoArquivo(nomeOriginal);
    const chave = `escritorios/${contexto.idEscritorioAtivo}/documentos/${idDocumento}/${randomUUID()}`;
    const { tamanhoBytes, sha256 } = await this.armazenamento.armazenar(chave, arquivo.conteudo, tipoConteudo, this.limiteBytes);
    if (tamanhoBytes === 0) { await this.armazenamento.remover(chave).catch(() => undefined); throw new ErroDocumentos('ARQUIVO_VAZIO'); }
    try {
      return await gravar({ chave, nomeOriginal, tipoConteudo, tamanhoBytes, sha256 });
    } catch (erro) {
      await this.armazenamento.remover(chave).catch(() => undefined);
      throw erro;
    }
  }

  async listar(token: string, filtro: FiltroConsultaDocumentos) {
    return this.executar(token, async (operacoes) => {
      const resultado = await operacoes.listar({ ...filtro, pesquisa: filtro.pesquisa.trim(), verConfidenciais: PoliticaDocumentos.verConfidenciais(operacoes.autor) });
      return { documentos: resultado.documentos.map((documento) => this.apresentar(operacoes, documento)), total: resultado.total, pagina: filtro.pagina, tamanhoPagina: filtro.tamanhoPagina };
    });
  }
  async consultar(token: string, id: string) {
    return this.executar(token, async (operacoes) => {
      const documento = await operacoes.consultar(id);
      PoliticaDocumentos.exigirAcesso(operacoes.autor, documento);
      await operacoes.registrarEvento(id, 'VISUALIZADO', documento.versaoAtual.numero);
      return { ...this.apresentar(operacoes, documento), versoes: await operacoes.versoes(id) };
    });
  }
  async eventos(token: string, id: string) {
    return this.executar(token, async (operacoes) => {
      PoliticaDocumentos.exigirAcesso(operacoes.autor, await operacoes.consultar(id));
      return operacoes.eventos(id);
    });
  }
  async enviar(token: string, metadados: MetadadosDocumento, arquivo: ArquivoRecebido) {
    const contexto = await this.tokens.validarTokenDeAcesso(token);
    const id = randomUUID();
    await this.executarNoContexto(contexto, (operacoes) => this.validarMetadados(operacoes, metadados));
    return this.armazenarVersao(contexto, id, arquivo, (versao) => this.executarNoContexto(contexto, async (operacoes) =>
      this.apresentar(operacoes, await operacoes.criar(id, await this.validarMetadados(operacoes, metadados), versao))));
  }
  async substituir(token: string, id: string, versaoEsperada: number, arquivo: ArquivoRecebido) {
    const contexto = await this.tokens.validarTokenDeAcesso(token);
    const autorizar = async (operacoes: OperacoesDocumentos) => {
      const anterior = await operacoes.consultar(id);
      PoliticaDocumentos.exigirAlteracao(operacoes.autor, anterior);
      if (anterior.versao !== versaoEsperada) throw new ErroDocumentos('CONFLITO');
      return anterior;
    };
    await this.executarNoContexto(contexto, autorizar);
    return this.armazenarVersao(contexto, id, arquivo, (versao) => this.executarNoContexto(contexto, async (operacoes) =>
      this.apresentar(operacoes, await operacoes.adicionarVersao(await autorizar(operacoes), versao))));
  }
  async alterarMetadados(token: string, id: string, dados: MetadadosDocumento & { versao: number }) {
    return this.executar(token, async (operacoes) => {
      const anterior = await operacoes.consultar(id);
      PoliticaDocumentos.exigirAlteracao(operacoes.autor, anterior);
      if (anterior.versao !== dados.versao) throw new ErroDocumentos('CONFLITO');
      return this.apresentar(operacoes, await operacoes.alterarMetadados(anterior, await this.validarMetadados(operacoes, dados)));
    });
  }
  async definirSituacao(token: string, id: string, ativo: boolean, versao: number) {
    return this.executar(token, async (operacoes) => {
      const anterior = await operacoes.consultar(id);
      PoliticaDocumentos.exigirAcesso(operacoes.autor, anterior);
      if (!PoliticaDocumentos.podeAlterarSituacao(operacoes.autor, anterior)) throw new ErroDocumentos('PROIBIDO');
      if (anterior.versao !== versao || anterior.ativo === ativo) throw new ErroDocumentos('CONFLITO');
      return this.apresentar(operacoes, await operacoes.definirSituacao(anterior, ativo));
    });
  }
  async baixar(token: string, id: string, numero?: number) {
    const { versao, chave } = await this.executar(token, async (operacoes) => {
      const documento = await operacoes.consultar(id);
      PoliticaDocumentos.exigirAcesso(operacoes.autor, documento);
      const alvo = numero ?? documento.versaoAtual.numero;
      const versao = alvo === documento.versaoAtual.numero ? documento.versaoAtual : (await operacoes.versoes(id)).find((item) => item.numero === alvo);
      if (!versao) throw new ErroDocumentos('NAO_ENCONTRADO');
      const chave = await operacoes.chaveDaVersao(id, alvo);
      await operacoes.registrarEvento(id, 'BAIXADO', alvo);
      return { versao, chave };
    });
    return { versao, conteudo: await this.armazenamento.abrir(chave) };
  }
}
