import type { PrismaClient } from '@prisma/client';
import { GestaoDocumentos } from '../application/documents/manage-documents.js';
import { GestaoTarefas } from '../application/tasks/manage-tasks.js';
import { LembretesDePrazos } from '../application/tasks/reminders.js';
import type { Ambiente } from '../environment.js';
import { criarEnvioEmail } from './email/email-provider.js';
import { RepositorioDocumentosPrisma } from './prisma/prisma-document-repository.js';
import { RepositorioLembretesPrisma } from './prisma/prisma-reminder-repository.js';
import { RepositorioTarefasPrisma } from './prisma/prisma-task-repository.js';
import { ProcessamentoLembretes } from './reminder-worker.js';
import { TokensAcessoJose } from './security/jose-access-tokens.js';
import { ARMAZENAMENTO_NAO_CONFIGURADO, ArmazenamentoS3 } from './storage/s3-file-storage.js';

export function comporServicosDeTrabalho(prisma: PrismaClient, ambiente: Ambiente) {
  const tokens = new TokensAcessoJose(ambiente.AUTH_JWT_SECRET, ambiente.AUTH_JWT_ISSUER, ambiente.AUTH_JWT_AUDIENCE, ambiente.AUTH_ACCESS_TTL_SECONDS);
  const configuracao = { fusoHorario: ambiente.FUSO_HORARIO, diasPrazoCritico: ambiente.PRAZO_CRITICO_DIAS };
  const armazenamento = ambiente.S3_BUCKET
    ? new ArmazenamentoS3({ endpoint: ambiente.S3_ENDPOINT, regiao: ambiente.S3_REGIAO, bucket: ambiente.S3_BUCKET, idAcesso: ambiente.S3_ID_ACESSO!,
      segredoAcesso: ambiente.S3_SEGREDO_ACESSO!, forcarPathStyle: ambiente.S3_FORCAR_PATH_STYLE })
    : ARMAZENAMENTO_NAO_CONFIGURADO;
  const limiteBytes = ambiente.DOCUMENTO_TAMANHO_MAXIMO_MB * 1024 * 1024;
  const lembretes = new LembretesDePrazos(new RepositorioLembretesPrisma(prisma), criarEnvioEmail(ambiente), ambiente.URL_FRONTEND, {
    ...configuracao, maximoTentativas: ambiente.EMAIL_FILA_MAX_TENTATIVAS, atrasoInicialSegundos: ambiente.EMAIL_FILA_ATRASO_INICIAL_SEGUNDOS,
    atrasoMaximoSegundos: ambiente.EMAIL_FILA_ATRASO_MAXIMO_SEGUNDOS,
  });
  const processamento = new ProcessamentoLembretes(lembretes, { intervaloGeracaoMs: ambiente.LEMBRETES_INTERVALO_MS, intervaloEnvioMs: ambiente.EMAIL_FILA_INTERVALO_MS,
    reservaSegundos: ambiente.EMAIL_FILA_LEASE_SEGUNDOS, prazoEncerramentoMs: ambiente.EMAIL_FILA_ENCERRAMENTO_MS },
  (evento, quantidade) => console.info(JSON.stringify({ componente: 'lembretes_prazos', evento, ...(quantidade ? { quantidade } : {}) })));
  return {
    tarefas: new GestaoTarefas(new RepositorioTarefasPrisma(prisma), tokens, configuracao),
    documentos: { gestao: new GestaoDocumentos(new RepositorioDocumentosPrisma(prisma), tokens, armazenamento, limiteBytes), limiteBytes },
    processamento,
  };
}
