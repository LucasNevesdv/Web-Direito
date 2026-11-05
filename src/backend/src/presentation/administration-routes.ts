import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TIPOS_ENTIDADE_AUDITORIA } from '../application/administration/administration-contracts.js';
import { ErroAdministracao, type GestaoAdministracao } from '../application/administration/manage-administration.js';
import { ESQUEMA_PAGINACAO, protegerRotas, tokenDaRequisicao } from './protected-routes.js';

const MENSAGENS = {
  PROIBIDO: 'Você não tem autorização para esta operação.',
  DADOS_INVALIDOS: 'Confira os dados informados.',
};
const DATA = z.string().datetime({ offset: true }).transform((valor) => new Date(valor));
const FILTRO_AUDITORIA = z.object({
  ...ESQUEMA_PAGINACAO,
  idUsuario: z.string().uuid().optional(),
  tipoEntidade: z.enum(TIPOS_ENTIDADE_AUDITORIA).optional(),
  acao: z.string().regex(/^[A-Z_]{1,48}$/).optional(),
  de: DATA.optional(),
  ate: DATA.optional(),
}).strict();

export function registrarRotasAdministracao(aplicacao: FastifyInstance, administracao: GestaoAdministracao, origemFrontend: string): void {
  aplicacao.register(async (rotas) => {
    protegerRotas(rotas, origemFrontend, (erro): erro is ErroAdministracao => erro instanceof ErroAdministracao, MENSAGENS);
    rotas.get('/api/v1/administracao/escritorio', (requisicao) => administracao.consultarEscritorio(tokenDaRequisicao(requisicao)));
    rotas.patch('/api/v1/administracao/escritorio', { bodyLimit: 1024 }, (requisicao) =>
      administracao.renomearEscritorio(tokenDaRequisicao(requisicao), z.object({ nome: z.string().max(256) }).strict().parse(requisicao.body).nome));
    rotas.get('/api/v1/administracao/auditoria', (requisicao) =>
      administracao.listarAuditoria(tokenDaRequisicao(requisicao), FILTRO_AUDITORIA.parse(requisicao.query)));
    rotas.get('/api/v1/administracao/exportacao', async (requisicao, resposta) => {
      const exportacao = await administracao.exportarDados(tokenDaRequisicao(requisicao));
      const dia = exportacao.geradoEm.toISOString().slice(0, 10);
      return resposta.header('Content-Disposition', `attachment; filename="webdireito-exportacao-${dia}.json"`)
        .type('application/json; charset=utf-8').send(JSON.stringify(exportacao));
    });
  });
}
