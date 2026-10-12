import { createHash } from 'node:crypto';
import { PassThrough, Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { ArmazenamentoArquivos } from '../../application/documents/document-contracts.js';
import { ErroDocumentos } from '../../application/documents/document-policy.js';

export interface ConfiguracaoS3 { endpoint?: string; regiao: string; bucket: string; idAcesso: string; segredoAcesso: string; forcarPathStyle: boolean }

// Armazenamento compatível com S3 (AWS S3, MinIO, Cloudflare R2). O conteúdo nunca passa pelo PostgreSQL.
export class ArmazenamentoS3 implements ArmazenamentoArquivos {
  private readonly cliente: S3Client;
  constructor(private readonly configuracao: ConfiguracaoS3) {
    this.cliente = new S3Client({ region: configuracao.regiao, endpoint: configuracao.endpoint, forcePathStyle: configuracao.forcarPathStyle,
      credentials: { accessKeyId: configuracao.idAcesso, secretAccessKey: configuracao.segredoAcesso } });
  }

  async armazenar(chave: string, conteudo: Readable, tipoConteudo: string, limiteBytes: number) {
    const hash = createHash('sha256');
    let tamanhoBytes = 0;
    const medidor = new Transform({ transform(trecho: Buffer, _codificacao, concluir) {
      tamanhoBytes += trecho.length;
      if (tamanhoBytes > limiteBytes) { concluir(new ErroDocumentos('ARQUIVO_GRANDE')); return; }
      hash.update(trecho);
      concluir(null, trecho);
    } });
    const corpo = new PassThrough();
    const envio = new Upload({ client: this.cliente, params: { Bucket: this.configuracao.bucket, Key: chave, Body: corpo, ContentType: tipoConteudo } });
    // Se o S3 falhar, destruir o corpo libera a leitura que, de outro modo, ficaria parada por contrapressão.
    const envioConcluido = envio.done().catch((erro: unknown) => { corpo.destroy(erro as Error); throw erro; });
    const resultados = await Promise.allSettled([pipeline(conteudo, medidor, corpo), envioConcluido]);
    const falhas = resultados.flatMap((resultado) => resultado.status === 'rejected' ? [resultado.reason as unknown] : []);
    if (falhas.length) {
      await envio.abort().catch(() => undefined);
      await this.remover(chave).catch(() => undefined);
      // A falha da leitura (limite, conexão do cliente) explica a falha do envio e tem prioridade.
      if (falhas.some((falha) => falha instanceof ErroDocumentos && falha.codigo === 'ARQUIVO_GRANDE')) throw new ErroDocumentos('ARQUIVO_GRANDE');
      throw new ErroDocumentos('ARMAZENAMENTO_INDISPONIVEL');
    }
    return { tamanhoBytes, sha256: hash.digest('hex') };
  }

  async abrir(chave: string): Promise<Readable> {
    try {
      const resposta = await this.cliente.send(new GetObjectCommand({ Bucket: this.configuracao.bucket, Key: chave }));
      if (!resposta.Body) throw new Error('Objeto sem conteúdo.');
      return resposta.Body as Readable;
    } catch {
      throw new ErroDocumentos('ARMAZENAMENTO_INDISPONIVEL');
    }
  }

  async remover(chave: string): Promise<void> {
    await this.cliente.send(new DeleteObjectCommand({ Bucket: this.configuracao.bucket, Key: chave }));
  }
}

export const ARMAZENAMENTO_NAO_CONFIGURADO: ArmazenamentoArquivos = {
  armazenar: async () => { throw new ErroDocumentos('ARMAZENAMENTO_INDISPONIVEL'); },
  abrir: async () => { throw new ErroDocumentos('ARMAZENAMENTO_INDISPONIVEL'); },
  remover: async () => undefined,
};
