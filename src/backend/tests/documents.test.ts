import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { ArmazenamentoArquivos, Documento, OperacoesDocumentos, VersaoDocumento } from '../src/application/documents/document-contracts.js';
import { ErroDocumentos } from '../src/application/documents/document-policy.js';
import { GestaoDocumentos } from '../src/application/documents/manage-documents.js';
import type { PapelVinculoEscritorio } from '../src/domain/memberships/membership.js';
import { registrarRotasDocumentos } from '../src/presentation/document-routes.js';

const ORIGEM = 'http://localhost:5173';
const idCriador = randomUUID(), idOutro = randomUUID();

// Armazenamento em memória que consome o fluxo de verdade e aplica o limite de bytes.
function armazenamentoEmMemoria() {
  const objetos = new Map<string, Buffer>();
  const armazenamento: ArmazenamentoArquivos = {
    armazenar: async (chave, conteudo, _tipo, limite) => {
      const partes: Buffer[] = []; let total = 0;
      for await (const parte of conteudo) { total += (parte as Buffer).length; if (total > limite) throw new ErroDocumentos('ARQUIVO_GRANDE'); partes.push(parte as Buffer); }
      const dados = Buffer.concat(partes); objetos.set(chave, dados);
      return { tamanhoBytes: dados.length, sha256: createHash('sha256').update(dados).digest('hex') };
    },
    abrir: async (chave) => Readable.from([objetos.get(chave)!]),
    remover: vi.fn(async (chave: string) => { objetos.delete(chave); }),
  };
  return { objetos, armazenamento };
}

function preparar(papel: PapelVinculoEscritorio = 'ADVOGADO', idUsuario = idCriador, opcoes: { falharGravacao?: boolean } = {}) {
  const documentos = new Map<string, Documento>(), versoes = new Map<string, Array<VersaoDocumento & { chave: string }>>(), eventos: string[] = [];
  const { objetos, armazenamento } = armazenamentoEmMemoria();
  const pessoa = (id: string) => ({ id, nome: 'Pessoa' });
  const operacoes = (): OperacoesDocumentos => ({
    autor: { idUsuario, papel },
    vinculos: { existe: async () => false, pesquisar: async () => [] },
    listar: async (filtro) => { const lista = [...documentos.values()].filter((d) => d.ativo === filtro.ativos && (filtro.verConfidenciais || !d.confidencial || d.criador.id === idUsuario)); return { documentos: lista, total: lista.length }; },
    consultar: async (id) => { const documento = documentos.get(id); if (!documento) throw new ErroDocumentos('NAO_ENCONTRADO'); return documento; },
    versoes: async (id) => [...(versoes.get(id) ?? [])].reverse(),
    chaveDaVersao: async (id, numero) => versoes.get(id)!.find((versao) => versao.numero === numero)!.chave,
    eventos: async () => [],
    criar: async (id, metadados, versao) => {
      if (opcoes.falharGravacao) throw new Error('banco indisponível');
      const atual = { ...versao, numero: 1, enviadoPor: pessoa(idUsuario), criadoEm: new Date() };
      versoes.set(id, [atual]); eventos.push('CRIADO');
      const documento: Documento = { id, ...metadados, ativo: true, versaoAtual: atual, criador: pessoa(idUsuario), inativadoEm: null, inativadoPor: null, versao: 0, criadoEm: new Date(), atualizadoEm: new Date() };
      documentos.set(id, documento); return documento;
    },
    adicionarVersao: async (anterior, versao) => {
      const atual = { ...versao, numero: anterior.versaoAtual.numero + 1, enviadoPor: pessoa(idUsuario), criadoEm: new Date() };
      versoes.get(anterior.id)!.push(atual); eventos.push('NOVA_VERSAO');
      const documento = { ...anterior, versaoAtual: atual, versao: anterior.versao + 1 }; documentos.set(anterior.id, documento); return documento;
    },
    alterarMetadados: async (anterior, metadados) => { const documento = { ...anterior, ...metadados, versao: anterior.versao + 1 }; documentos.set(anterior.id, documento); eventos.push('ALTERADO'); return documento; },
    definirSituacao: async (anterior, ativo) => { const documento = { ...anterior, ativo, versao: anterior.versao + 1 }; documentos.set(anterior.id, documento); eventos.push(ativo ? 'REATIVADO' : 'INATIVADO'); return documento; },
    registrarEvento: async (_id, acao) => { eventos.push(acao); },
  });
  const gestao = new GestaoDocumentos({ executar: async (_contexto, operacao) => operacao(operacoes()) },
    { validarTokenDeAcesso: async () => ({ idUsuario, idSessao: randomUUID(), idEscritorioAtivo: randomUUID(), papel }) }, armazenamento, 1024);
  return { gestao, documentos, objetos, armazenamento, eventos };
}
const arquivo = (conteudo: string, nomeOriginal = 'contrato.pdf') => ({ nomeOriginal, conteudo: Readable.from([Buffer.from(conteudo)]) });
const METADADOS = { nome: ' Contrato de honorários ', descricao: '', categoria: 'CONTRATO' as const, confidencial: false, vinculo: null };

describe('documentos', () => {
  it('envia, substitui criando versão e mantém histórico de versões e eventos', async () => {
    const c = preparar();
    const criado = await c.gestao.enviar('token', METADADOS, arquivo('versão 1'));
    expect(criado).toMatchObject({ nome: 'Contrato de honorários', versaoAtual: { numero: 1, tipoConteudo: 'application/pdf', tamanhoBytes: 9 } });
    expect(criado.versaoAtual.sha256).toBe(createHash('sha256').update('versão 1').digest('hex'));
    const substituido = await c.gestao.substituir('token', criado.id, criado.versao, arquivo('versão 2 maior', 'contrato-v2.pdf'));
    expect(substituido.versaoAtual).toMatchObject({ numero: 2, nomeOriginal: 'contrato-v2.pdf' });
    const consulta = await c.gestao.consultar('token', criado.id);
    expect(consulta.versoes.map((versao) => versao.numero)).toEqual([2, 1]);
    const antigo = await c.gestao.baixar('token', criado.id, 1);
    expect(Buffer.concat(await antigo.conteudo.toArray()).toString()).toBe('versão 1');
    expect(c.objetos.size).toBe(2);
    expect(c.eventos).toEqual(['CRIADO', 'NOVA_VERSAO', 'VISUALIZADO', 'BAIXADO']);
  });
  it.each([
    [arquivo('x', 'script.exe'), 'TIPO_NAO_PERMITIDO'], [arquivo('x'.repeat(1025)), 'ARQUIVO_GRANDE'], [arquivo(''), 'ARQUIVO_VAZIO'],
  ])('rejeita arquivo inválido sem deixar objeto armazenado (%#)', async (enviado, codigo) => {
    const c = preparar();
    await expect(c.gestao.enviar('token', METADADOS, enviado)).rejects.toMatchObject({ codigo });
    expect(c.objetos.size).toBe(0); expect(c.documentos.size).toBe(0);
  });
  it('remove o objeto quando a gravação dos metadados falha', async () => {
    const c = preparar('ADVOGADO', idCriador, { falharGravacao: true });
    await expect(c.gestao.enviar('token', METADADOS, arquivo('conteúdo'))).rejects.toThrow('banco indisponível');
    expect(c.armazenamento.remover).toHaveBeenCalledOnce(); expect(c.objetos.size).toBe(0);
  });
  it('confidencial: somente papéis jurídicos marcam; demais não veem nem baixam', async () => {
    const estagiario = preparar('ESTAGIARIO', idOutro);
    await expect(estagiario.gestao.enviar('token', { ...METADADOS, confidencial: true }, arquivo('x'))).rejects.toMatchObject({ codigo: 'PROIBIDO' });
    const advogado = preparar();
    const criado = await advogado.gestao.enviar('token', { ...METADADOS, confidencial: true }, arquivo('sigiloso'));
    estagiario.documentos.set(criado.id, criado);
    expect((await estagiario.gestao.listar('token', { pesquisa: '', ativos: true, pagina: 1, tamanhoPagina: 20 })).total).toBe(0);
    await expect(estagiario.gestao.baixar('token', criado.id)).rejects.toMatchObject({ codigo: 'NAO_ENCONTRADO' });
  });
  it('inativa sem apagar versões e impede alteração até reativar', async () => {
    const c = preparar();
    const criado = await c.gestao.enviar('token', METADADOS, arquivo('conteúdo'));
    const inativo = await c.gestao.definirSituacao('token', criado.id, false, criado.versao);
    expect(inativo.ativo).toBe(false); expect(c.objetos.size).toBe(1);
    await expect(c.gestao.substituir('token', criado.id, inativo.versao, arquivo('novo'))).rejects.toMatchObject({ codigo: 'DOCUMENTO_INATIVO' });
    await expect(c.gestao.definirSituacao('token', criado.id, false, inativo.versao)).rejects.toMatchObject({ codigo: 'CONFLITO' });
    const outro = preparar('ESTAGIARIO', idOutro); outro.documentos.set(criado.id, inativo);
    await expect(outro.gestao.definirSituacao('token', criado.id, true, inativo.versao)).rejects.toMatchObject({ codigo: 'PROIBIDO' });
  });
});

describe('rotas de documentos', () => {
  async function aplicacao() {
    const c = preparar();
    const servidor = Fastify();
    registrarRotasDocumentos(servidor, c.gestao, ORIGEM, 1024);
    await servidor.ready();
    return { ...c, servidor };
  }
  function multipart(campos: Record<string, string>, conteudo: string, nome = 'contrato.pdf') {
    const limite = `----limite${randomUUID()}`;
    const partes = Object.entries(campos).map(([campo, valor]) => `--${limite}\r\nContent-Disposition: form-data; name="${campo}"\r\n\r\n${valor}\r\n`);
    partes.push(`--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="${nome}"\r\nContent-Type: application/pdf\r\n\r\n${conteudo}\r\n--${limite}--\r\n`);
    return { payload: partes.join(''), headers: { 'content-type': `multipart/form-data; boundary=${limite}`, authorization: 'Bearer token', origin: ORIGEM } };
  }
  it('recebe multipart, devolve 201 e baixa como anexo sem cache', async () => {
    const { servidor } = await aplicacao();
    const envio = await servidor.inject({ method: 'POST', url: '/api/v1/documentos', ...multipart({ nome: 'Procuração', categoria: 'PROCURACAO' }, 'conteúdo pdf', 'procuração final.pdf') });
    expect(envio.statusCode).toBe(201);
    const { id } = envio.json();
    const download = await servidor.inject({ method: 'GET', url: `/api/v1/documentos/${id}/download`, headers: { authorization: 'Bearer token' } });
    expect(download.statusCode).toBe(200); expect(download.body).toBe('conteúdo pdf');
    expect(download.headers['content-disposition']).toBe(`attachment; filename="procura__o final.pdf"; filename*=UTF-8''${encodeURIComponent('procuração final.pdf')}`);
    expect(download.headers['x-content-type-options']).toBe('nosniff'); expect(download.headers['cache-control']).toBe('no-store');
  });
  it.each([
    [{ origin: 'https://malicioso.example' }, 403], [{ authorization: '' }, 401],
  ])('rejeita origem ou token inválidos (%#)', async (cabecalhos, situacao) => {
    const { servidor } = await aplicacao();
    const requisicao = multipart({ nome: 'Contrato', categoria: 'CONTRATO' }, 'x');
    const resposta = await servidor.inject({ method: 'POST', url: '/api/v1/documentos', payload: requisicao.payload, headers: { ...requisicao.headers, ...cabecalhos } });
    expect(resposta.statusCode).toBe(situacao);
  });
  it.each([
    [{ nome: 'Contrato', categoria: 'INVALIDA' }, 'x', 'contrato.pdf', 400],
    [{ nome: 'Contrato', categoria: 'CONTRATO' }, 'x'.repeat(2000), 'contrato.pdf', 413],
    [{ nome: 'Contrato', categoria: 'CONTRATO' }, 'x', 'virus.exe', 415],
  ])('mapeia falhas de envio sem armazenar (%#)', async (campos, conteudo, nome, situacao) => {
    const { servidor, objetos } = await aplicacao();
    const resposta = await servidor.inject({ method: 'POST', url: '/api/v1/documentos', ...multipart(campos, conteudo, nome) });
    expect(resposta.statusCode).toBe(situacao); expect(objetos.size).toBe(0);
  });
});
