import { randomUUID } from 'node:crypto';
import { Prisma, type DocumentCategory, type PrismaClient } from '@prisma/client';
import type { DadosTokenAcesso } from '../../application/authentication/authentication-contracts.js';
import type { AcaoDocumento, CategoriaDocumento, Documento, MetadadosDocumento, NovaVersao, OperacoesDocumentos, RepositorioDocumentos,
  VersaoDocumento } from '../../application/documents/document-contracts.js';
import { ErroDocumentos } from '../../application/documents/document-policy.js';
import { abrirContextoDoEscritorio } from './office-access.js';
import { colunasDoVinculo, criarCatalogoVinculos, vinculoDasColunas } from './prisma-business-links.js';

export const CATEGORIAS_PRISMA: Record<CategoriaDocumento, DocumentCategory> = { CONTRATO: 'CONTRACT', PROCURACAO: 'POWER_OF_ATTORNEY', PETICAO: 'PETITION',
  DECISAO: 'DECISION', PROVA: 'EVIDENCE', DOCUMENTO_PESSOAL: 'PERSONAL_DOCUMENT', COMPROVANTE: 'RECEIPT', OUTRO: 'OTHER' };
const CATEGORIAS = Object.fromEntries(Object.entries(CATEGORIAS_PRISMA).map(([a, b]) => [b, a])) as Record<DocumentCategory, CategoriaDocumento>;
const pessoa = { select: { id: true, name: true } } as const;
const comoPessoa = (registro: { id: string; name: string }) => ({ id: registro.id, nome: registro.name });
const INCLUSAO_VERSAO = { uploader: pessoa } satisfies Prisma.DocumentVersionInclude;
const INCLUSAO_DOCUMENTO = { creator: pessoa, inactivatedBy: pessoa,
  versions: { include: INCLUSAO_VERSAO, orderBy: { number: 'desc' }, take: 1 } } satisfies Prisma.DocumentInclude;

function converterVersao(registro: Prisma.DocumentVersionGetPayload<{ include: typeof INCLUSAO_VERSAO }>): VersaoDocumento {
  return { numero: registro.number, nomeOriginal: registro.originalName, tipoConteudo: registro.contentType, tamanhoBytes: Number(registro.sizeBytes),
    sha256: registro.sha256, enviadoPor: comoPessoa(registro.uploader), criadoEm: registro.createdAt };
}
function converterDocumento(registro: Prisma.DocumentGetPayload<{ include: typeof INCLUSAO_DOCUMENTO }>): Documento {
  return { id: registro.id, nome: registro.name, descricao: registro.description, categoria: CATEGORIAS[registro.category], confidencial: registro.confidential,
    ativo: registro.active, vinculo: vinculoDasColunas(registro), versaoAtual: converterVersao(registro.versions[0]), criador: comoPessoa(registro.creator),
    inativadoEm: registro.inactivatedAt, inativadoPor: registro.inactivatedBy ? comoPessoa(registro.inactivatedBy) : null, versao: registro.version,
    criadoEm: registro.createdAt, atualizadoEm: registro.updatedAt };
}
const colunasMetadados = (metadados: MetadadosDocumento) => ({ name: metadados.nome, description: metadados.descricao, category: CATEGORIAS_PRISMA[metadados.categoria],
  confidential: metadados.confidencial, ...colunasDoVinculo(metadados.vinculo) });
const resumoMetadados = (documento: Pick<Documento, 'nome' | 'descricao' | 'categoria' | 'confidencial' | 'vinculo'>) =>
  ({ nome: documento.nome, descricao: documento.descricao, categoria: documento.categoria, confidencial: documento.confidencial, vinculo: documento.vinculo });

export class RepositorioDocumentosPrisma implements RepositorioDocumentos {
  constructor(private readonly prisma: PrismaClient) {}

  async executar<T>(contexto: DadosTokenAcesso, operacao: (operacoes: OperacoesDocumentos) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(async (transacao) => {
        const autor = await abrirContextoDoEscritorio(transacao, contexto);
        const idEscritorio = contexto.idEscritorioAtivo;
        async function consultar(id: string) {
          const registro = await transacao.document.findFirst({ where: { id, officeId: idEscritorio }, include: INCLUSAO_DOCUMENTO });
          if (!registro) throw new ErroDocumentos('NAO_ENCONTRADO');
          return converterDocumento(registro);
        }
        async function registrarEvento(id: string, acao: AcaoDocumento, numeroVersao: number | null, detalhes?: unknown) {
          await transacao.documentEvent.create({ data: { id: randomUUID(), documentId: id, actorId: autor.idUsuario, action: acao, versionNumber: numeroVersao,
            details: detalhes === undefined ? Prisma.DbNull : detalhes as Prisma.InputJsonValue, createdAt: new Date() } });
        }
        async function avancarVersao(anterior: Documento, dados: Prisma.DocumentUncheckedUpdateManyInput) {
          const alterou = await transacao.document.updateMany({ where: { id: anterior.id, officeId: idEscritorio, version: anterior.versao },
            data: { ...dados, version: { increment: 1 }, updatedAt: new Date() } });
          if (alterou.count !== 1) throw new ErroDocumentos('CONFLITO');
        }
        async function gravarVersao(idDocumento: string, numero: number, versao: NovaVersao) {
          await transacao.documentVersion.create({ data: { id: randomUUID(), documentId: idDocumento, number: numero, storageKey: versao.chave,
            originalName: versao.nomeOriginal, contentType: versao.tipoConteudo, sizeBytes: BigInt(versao.tamanhoBytes), sha256: versao.sha256,
            uploaderId: autor.idUsuario, createdAt: new Date() } });
        }
        return operacao({
          autor,
          vinculos: criarCatalogoVinculos(transacao, idEscritorio),
          consultar,
          registrarEvento: (id, acao, numeroVersao) => registrarEvento(id, acao, numeroVersao),
          listar: async (filtro) => {
            const where: Prisma.DocumentWhereInput = { officeId: idEscritorio, active: filtro.ativos,
              ...(filtro.categoria ? { category: CATEGORIAS_PRISMA[filtro.categoria] } : {}),
              ...(filtro.vinculo ? colunasDoVinculo(filtro.vinculo) : {}),
              AND: [
                ...(filtro.pesquisa ? [{ OR: [{ name: { contains: filtro.pesquisa, mode: 'insensitive' as const } }, { description: { contains: filtro.pesquisa, mode: 'insensitive' as const } }] }] : []),
                ...(filtro.verConfidenciais ? [] : [{ OR: [{ confidential: false }, { creatorId: autor.idUsuario }] }]),
              ] };
            const registros = await transacao.document.findMany({ where, include: INCLUSAO_DOCUMENTO, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
              skip: (filtro.pagina - 1) * filtro.tamanhoPagina, take: filtro.tamanhoPagina });
            return { documentos: registros.map(converterDocumento), total: await transacao.document.count({ where }) };
          },
          versoes: async (id) => (await transacao.documentVersion.findMany({ where: { documentId: id, document: { officeId: idEscritorio } },
            include: INCLUSAO_VERSAO, orderBy: { number: 'desc' } })).map(converterVersao),
          chaveDaVersao: async (id, numero) => {
            const registro = await transacao.documentVersion.findFirst({ where: { documentId: id, number: numero, document: { officeId: idEscritorio } }, select: { storageKey: true } });
            if (!registro) throw new ErroDocumentos('NAO_ENCONTRADO');
            return registro.storageKey;
          },
          eventos: async (id) => (await transacao.documentEvent.findMany({ where: { documentId: id, document: { officeId: idEscritorio } },
            include: { actor: pessoa }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200 }))
            .map((registro) => ({ id: registro.id, autor: comoPessoa(registro.actor), acao: registro.action as AcaoDocumento, numeroVersao: registro.versionNumber,
              detalhes: registro.details, criadoEm: registro.createdAt })),
          criar: async (id, metadados, versao) => {
            const agora = new Date();
            await transacao.document.create({ data: { id, officeId: idEscritorio, creatorId: autor.idUsuario, currentVersion: 1, createdAt: agora, updatedAt: agora,
              ...colunasMetadados(metadados) } });
            await gravarVersao(id, 1, versao);
            await registrarEvento(id, 'CRIADO', 1, resumoMetadados(metadados));
            return consultar(id);
          },
          adicionarVersao: async (anterior, versao) => {
            const numero = anterior.versaoAtual.numero + 1;
            await avancarVersao(anterior, { currentVersion: numero });
            await gravarVersao(anterior.id, numero, versao);
            await registrarEvento(anterior.id, 'NOVA_VERSAO', numero, { nomeOriginal: versao.nomeOriginal, tamanhoBytes: versao.tamanhoBytes });
            return consultar(anterior.id);
          },
          alterarMetadados: async (anterior, metadados) => {
            await avancarVersao(anterior, colunasMetadados(metadados));
            await registrarEvento(anterior.id, 'ALTERADO', anterior.versaoAtual.numero, { anterior: resumoMetadados(anterior), atual: resumoMetadados(metadados) });
            return consultar(anterior.id);
          },
          definirSituacao: async (anterior, ativo) => {
            await avancarVersao(anterior, { active: ativo, inactivatedAt: ativo ? null : new Date(), inactivatedById: ativo ? null : autor.idUsuario });
            await registrarEvento(anterior.id, ativo ? 'REATIVADO' : 'INATIVADO', anterior.versaoAtual.numero);
            return consultar(anterior.id);
          },
        });
      }, { maxWait: 5000, timeout: 10000 });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(erro.code)) throw new ErroDocumentos('CONFLITO');
      throw erro;
    }
  }
}
