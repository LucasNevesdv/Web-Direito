import multipart, { type MultipartFile } from '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CATEGORIAS_DOCUMENTO } from '../application/documents/document-contracts.js';
import { ErroDocumentos } from '../application/documents/document-policy.js';
import type { GestaoDocumentos } from '../application/documents/manage-documents.js';
import { TIPOS_VINCULO } from '../application/links/business-links.js';
import { ESQUEMA_PAGINACAO, idDaRequisicao, protegerRotas, tokenDaRequisicao } from './protected-routes.js';

const VERSAO = z.number().int().nonnegative();
const BOOLEANO = z.enum(['true', 'false']).transform((valor) => valor === 'true');
const METADADOS = z.object({ nome: z.string().max(400), descricao: z.string().max(4000).default(''), categoria: z.enum(CATEGORIAS_DOCUMENTO),
  confidencial: z.boolean().default(false), vinculo: z.object({ tipo: z.enum(TIPOS_VINCULO), id: z.string().uuid() }).strict().nullable().default(null) });
const MENSAGENS: Record<string, string> = {
  PROIBIDO: 'Você não tem autorização para esta operação.', NAO_ENCONTRADO: 'Documento não encontrado neste escritório.',
  CONFLITO: 'O documento foi alterado por outra pessoa. Atualize e tente novamente.', DADOS_INVALIDOS: 'Confira os dados informados.',
  DOCUMENTO_INATIVO: 'Reative o documento antes de alterá-lo.', TIPO_NAO_PERMITIDO: 'Tipo de arquivo não permitido.',
  ARQUIVO_GRANDE: 'O arquivo excede o tamanho máximo permitido.', ARQUIVO_VAZIO: 'O arquivo está vazio.',
  VINCULO_NAO_ENCONTRADO: 'O cliente, caso ou processo informado não existe neste escritório.',
  ARMAZENAMENTO_INDISPONIVEL: 'O armazenamento de documentos está indisponível. Tente novamente mais tarde.',
};

function campos(parte: MultipartFile): Record<string, string> {
  return Object.fromEntries(Object.entries(parte.fields).flatMap(([nome, campo]) =>
    campo && !Array.isArray(campo) && campo.type === 'field' ? [[nome, String(campo.value)]] : []));
}
// Metadados chegam antes do arquivo no multipart; o arquivo é repassado em fluxo ao armazenamento.
async function arquivoDaRequisicao(requisicao: FastifyRequest): Promise<{ parte: MultipartFile; campos: Record<string, string> }> {
  if (!requisicao.isMultipart()) throw new ErroDocumentos('DADOS_INVALIDOS');
  const parte = await requisicao.file();
  if (!parte || parte.fieldname !== 'arquivo') { parte?.file.resume(); throw new ErroDocumentos('DADOS_INVALIDOS'); }
  return { parte, campos: campos(parte) };
}
async function consumirEmFalha<T>(parte: MultipartFile, operacao: () => Promise<T>): Promise<T> {
  try { return await operacao(); } catch (erro) { parte.file.resume(); throw erro; }
}
const nomeParaCabecalho = (nome: string) => nome.replace(/[^\x20-\x7e]/g, '_').replace(/[\\"]/g, '_');

export function registrarRotasDocumentos(aplicacao: FastifyInstance, documentos: GestaoDocumentos, origemFrontend: string, limiteBytes: number): void {
  aplicacao.register(async (rotas) => {
    protegerRotas(rotas, origemFrontend, (erro): erro is ErroDocumentos => erro instanceof ErroDocumentos, MENSAGENS);
    await rotas.register(multipart, { limits: { fileSize: limiteBytes + 1, files: 1, fields: 10, fieldSize: 8192, parts: 11 } });
    const token = tokenDaRequisicao, id = idDaRequisicao;

    rotas.get('/api/v1/documentos', (requisicao) => {
      const consulta = z.object({ ...ESQUEMA_PAGINACAO, pesquisa: z.string().max(200).default(''), categoria: z.enum(CATEGORIAS_DOCUMENTO).optional(),
        situacao: z.enum(['ATIVOS', 'INATIVOS']).default('ATIVOS'), vinculoTipo: z.enum(TIPOS_VINCULO).optional(), vinculoId: z.string().uuid().optional() })
        .strict().refine((valor) => !valor.vinculoTipo === !valor.vinculoId).parse(requisicao.query);
      return documentos.listar(token(requisicao), { pesquisa: consulta.pesquisa, categoria: consulta.categoria, ativos: consulta.situacao === 'ATIVOS',
        vinculo: consulta.vinculoTipo && consulta.vinculoId ? { tipo: consulta.vinculoTipo, id: consulta.vinculoId } : undefined,
        pagina: consulta.pagina, tamanhoPagina: consulta.tamanhoPagina });
    });
    rotas.post('/api/v1/documentos', async (requisicao, resposta) => {
      const { parte, campos: dados } = await arquivoDaRequisicao(requisicao);
      const documento = await consumirEmFalha(parte, () => {
        const metadados = METADADOS.parse({ nome: dados.nome, descricao: dados.descricao, categoria: dados.categoria,
          confidencial: dados.confidencial === undefined ? undefined : BOOLEANO.parse(dados.confidencial),
          vinculo: dados.vinculoTipo || dados.vinculoId ? { tipo: dados.vinculoTipo, id: dados.vinculoId } : null });
        return documentos.enviar(token(requisicao), metadados, { nomeOriginal: parte.filename, conteudo: parte.file });
      });
      return resposta.status(201).send(documento);
    });
    rotas.get('/api/v1/documentos/:id', (requisicao) => documentos.consultar(token(requisicao), id(requisicao)));
    rotas.patch('/api/v1/documentos/:id', { bodyLimit: 16384 }, (requisicao) =>
      documentos.alterarMetadados(token(requisicao), id(requisicao), METADADOS.extend({ versao: VERSAO }).strict().parse(requisicao.body)));
    rotas.post('/api/v1/documentos/:id/versoes', async (requisicao, resposta) => {
      const idDocumento = id(requisicao);
      const { parte, campos: dados } = await arquivoDaRequisicao(requisicao);
      const documento = await consumirEmFalha(parte, () => documentos.substituir(token(requisicao), idDocumento,
        z.coerce.number().int().nonnegative().parse(dados.versao), { nomeOriginal: parte.filename, conteudo: parte.file }));
      return resposta.status(201).send(documento);
    });
    for (const ativo of [true, false]) rotas.post(`/api/v1/documentos/:id/${ativo ? 'reativar' : 'inativar'}`, { bodyLimit: 1024 }, (requisicao) =>
      documentos.definirSituacao(token(requisicao), id(requisicao), ativo, z.object({ versao: VERSAO }).strict().parse(requisicao.body).versao));
    rotas.get('/api/v1/documentos/:id/eventos', (requisicao) => documentos.eventos(token(requisicao), id(requisicao)));
    rotas.get('/api/v1/documentos/:id/download', async (requisicao, resposta) => {
      const { versao } = z.object({ versao: z.coerce.number().int().min(1).optional() }).strict().parse(requisicao.query);
      const arquivo = await documentos.baixar(token(requisicao), id(requisicao), versao);
      return resposta.header('Content-Type', arquivo.versao.tipoConteudo).header('Content-Length', String(arquivo.versao.tamanhoBytes))
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `attachment; filename="${nomeParaCabecalho(arquivo.versao.nomeOriginal)}"; filename*=UTF-8''${encodeURIComponent(arquivo.versao.nomeOriginal)}`)
        .send(arquivo.conteudo);
    });
  });
}
