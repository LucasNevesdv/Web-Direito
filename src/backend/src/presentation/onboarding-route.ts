import type { FastifyInstance } from 'fastify';
import type { LimitadorRequisicoes } from '../application/security/rate-limiter.js';
import { criarTratadorDeLimiteDeRequisicoes } from './rate-limit-hook.js';
import { z } from 'zod';
import { ErroEmailJaCadastrado } from '../application/onboarding/email-already-registered-error.js';
import { ErroCadastroInvalido } from '../application/onboarding/invalid-registration-error.js';
import type { CadastroDeEscritorioComProprietario } from '../application/onboarding/register-office-with-owner.js';

const ESQUEMA_NOME = z.string().trim().refine((valor) => {
  const tamanho = Array.from(valor).length;
  return tamanho >= 2 && tamanho <= 120;
});

const ESQUEMA_CADASTRO = z.object({
  nomeEscritorio: ESQUEMA_NOME,
  nomeAdministrador: ESQUEMA_NOME,
  email: z.string().trim().toLowerCase().max(254).email(),
  senha: z.string().refine((valor) => {
    const tamanho = Array.from(valor).length;
    return tamanho >= 12 && tamanho <= 128;
  }),
}).strict();

const MENSAGENS_CAMPOS = {
  nomeEscritorio: 'Informe um nome de escritório entre 2 e 120 caracteres.',
  nomeAdministrador: 'Informe um nome de responsável entre 2 e 120 caracteres.',
  email: 'Informe um e-mail válido.',
  senha: 'Informe uma senha entre 12 e 128 caracteres.',
} as const;

type CampoCadastro = keyof typeof MENSAGENS_CAMPOS;

function estaEntreCamposDoCadastro(valor: unknown): valor is CampoCadastro {
  return typeof valor === 'string'
    && Object.prototype.hasOwnProperty.call(MENSAGENS_CAMPOS, valor);
}

function criarRespostaDeCadastroInvalido(campos?: Partial<Record<CampoCadastro, string>>) {
  return {
    erro: 'ERRO_VALIDACAO',
    mensagem: 'Confira os dados do cadastro.',
    ...(campos && Object.keys(campos).length > 0 ? { campos } : {}),
  };
}

const ESQUEMA_RESPOSTA_PUBLICA = {
  type: 'object',
  additionalProperties: false,
  required: ['escritorio', 'usuario', 'papel'],
  properties: {
    escritorio: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'nome', 'situacao', 'criadoEm', 'atualizadoEm'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        nome: { type: 'string' },
        situacao: { type: 'string', enum: ['ATIVO', 'INATIVO'] },
        criadoEm: { type: 'string', format: 'date-time' },
        atualizadoEm: { type: 'string', format: 'date-time' },
      },
    },
    usuario: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'nome', 'email'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        nome: { type: 'string' },
        email: { type: 'string' },
      },
    },
    papel: { type: 'string', enum: ['PROPRIETARIO'] },
  },
} as const;

const ESQUEMA_RESPOSTA_ERRO = {
  type: 'object',
  additionalProperties: false,
  required: ['erro', 'mensagem'],
  properties: {
    erro: { type: 'string' },
    mensagem: { type: 'string' },
    campos: {
      type: 'object',
      additionalProperties: false,
      properties: {
        nomeEscritorio: { type: 'string' },
        nomeAdministrador: { type: 'string' },
        email: { type: 'string' },
        senha: { type: 'string' },
      },
    },
  },
} as const;

export function registrarRotaCadastro(
  aplicacao: FastifyInstance,
  cadastro: Pick<CadastroDeEscritorioComProprietario, 'cadastrarEscritorioComProprietario'>,
  limitador: LimitadorRequisicoes,
): void {
  aplicacao.register(async (cadastroInicial) => {
    cadastroInicial.setErrorHandler((erro, _requisicao, respostaHttp) => {
      if (erro instanceof ErroEmailJaCadastrado) {
        return respostaHttp.status(409).send({
          erro: 'EMAIL_JA_CADASTRADO',
          mensagem: 'Este e-mail já está cadastrado.',
        });
      }

      if (erro instanceof ErroCadastroInvalido) {
        const campos = estaEntreCamposDoCadastro(erro.campo)
          ? { [erro.campo]: MENSAGENS_CAMPOS[erro.campo] }
          : undefined;
        return respostaHttp.status(400).send(criarRespostaDeCadastroInvalido(campos));
      }

      // Parser errors can include request fragments. Never send their messages.
      const statusCode = typeof erro === 'object' && erro !== null && 'statusCode' in erro
        ? erro.statusCode
        : undefined;
      if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
        return respostaHttp.status(400).send(criarRespostaDeCadastroInvalido());
      }

      return respostaHttp.status(500).send({
        erro: 'ERRO_INTERNO',
        mensagem: 'Não foi possível concluir o cadastro. Tente novamente.',
      });
    });

    cadastroInicial.post('/api/v1/onboarding', {
      onRequest: criarTratadorDeLimiteDeRequisicoes(limitador, 'onboarding-ip'),
      bodyLimit: 16 * 1024,
      schema: {
        response: {
          201: ESQUEMA_RESPOSTA_PUBLICA,
          400: ESQUEMA_RESPOSTA_ERRO,
          409: ESQUEMA_RESPOSTA_ERRO,
          500: ESQUEMA_RESPOSTA_ERRO,
        },
      },
    }, async (requisicao, respostaHttp) => {
      const interpretado = ESQUEMA_CADASTRO.safeParse(requisicao.body);

      if (!interpretado.success) {
        const campos: Partial<Record<CampoCadastro, string>> = {};
        for (const problema of interpretado.error.issues) {
          const campo = problema.path[0];
          if (estaEntreCamposDoCadastro(campo)) {
            campos[campo] = MENSAGENS_CAMPOS[campo];
          }
        }
        return respostaHttp.status(400).send(criarRespostaDeCadastroInvalido(campos));
      }

      const resultado = await cadastro.cadastrarEscritorioComProprietario(interpretado.data);

      return respostaHttp.status(201).send({
        escritorio: {
          id: resultado.escritorio.id,
          nome: resultado.escritorio.nome,
          situacao: resultado.escritorio.situacao,
          criadoEm: resultado.escritorio.criadoEm,
          atualizadoEm: resultado.escritorio.atualizadoEm,
        },
        usuario: {
          id: resultado.usuario.id,
          nome: resultado.usuario.nome,
          email: resultado.usuario.email,
        },
        papel: resultado.papel,
      });
    });
  });
}
