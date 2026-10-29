import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarAplicacao } from '../src/app.js';
import { GestaoClientes } from '../src/application/clients/manage-clients.js';
import { ErroCliente } from '../src/application/clients/client-policy.js';
import { ErroPrimeiroAcessoObrigatorio } from '../src/application/authentication/authentication-errors.js';
import type { ServicosRotasAutenticacao } from '../src/presentation/authentication-routes.js';
import type {
  ClienteDetalheDto,
  ClienteResumoDto,
  EventoLinhaTempoClienteDto,
  OperacoesClientes,
  RepositorioClientes,
} from '../src/application/clients/client-contracts.js';

const aplicacoes: ReturnType<typeof criarAplicacao>[] = [];
afterEach(async () => {
  await Promise.all(aplicacoes.splice(0).map((app) => app.close()));
});

function prepararCenarioRotas() {
  const idCliente = randomUUID();
  const idEscritorio = randomUUID();
  const idUsuario = randomUUID();

  const clienteResumo: ClienteResumoDto = {
    id: idCliente,
    idEscritorio,
    tipoPessoa: 'PESSOA_FISICA',
    nome: 'Ana Paula Souza',
    nomeSocial: null,
    documento: '11144477735',
    email: 'ana@example.test',
    telefone: '11988887777',
    situacao: 'ATIVO',
    idVinculoResponsavel: null,
    versao: 0,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  };

  const clienteDetalhe: ClienteDetalheDto = {
    ...clienteResumo,
    endereco: null,
    observacoesInternas: 'Observação teste',
    contatos: [],
  };

  const eventoLinhaTempo: EventoLinhaTempoClienteDto = {
    id: randomUUID(),
    idEscritorio,
    idCliente,
    idAutor: idUsuario,
    acao: 'CLIENTE_CRIADO',
    anterior: null,
    atual: { id: idCliente, nome: 'Ana Paula Souza' },
    criadoEm: new Date(),
  };

  const operacoes: OperacoesClientes = {
    autor: {
      idUsuario,
      idEscritorio,
      papel: 'PROPRIETARIO',
      permissoes: ['CLIENTE_VISUALIZAR', 'CLIENTE_CADASTRAR', 'CLIENTE_EDITAR', 'CLIENTE_ATIVAR_INATIVAR', 'CLIENTE_VISUALIZAR_OBSERVACOES'],
    },
    listarClientes: vi.fn(async () => ({ clientes: [clienteResumo], total: 1 })),
    buscarClientePorId: vi.fn(async (id) => {
      if (id !== idCliente) throw new ErroCliente('NAO_ENCONTRADO', 404);
      return clienteDetalhe;
    }),
    verificarDuplicidades: vi.fn(async () => []),
    validarVinculoResponsavelNoEscritorio: vi.fn(async (id) => ({ id, nome: 'Advogado', papel: 'ADVOGADO' as const })),
    criarCliente: vi.fn(async () => clienteDetalhe),
    atualizarCliente: vi.fn(async (ant, at) => ({ ...clienteDetalhe, nome: at.nome, versao: ant.versao + 1 })),
    definirSituacao: vi.fn(async (_ant, sit) => {
      clienteDetalhe.situacao = sit;
      clienteDetalhe.versao += 1;
      return { ...clienteDetalhe };
    }),
    listarLinhaDoTempoCliente: vi.fn(async () => [eventoLinhaTempo]),
  };

  const repositorio: RepositorioClientes = {
    executar: vi.fn(async (_ctx, fn) => fn(operacoes)),
  };

  const tokens = {
    validarTokenDeAcesso: vi.fn(async () => ({
      idUsuario,
      idEscritorioAtivo: idEscritorio,
      idSessao: randomUUID(),
      papel: 'PROPRIETARIO' as const,
    })),
    criarTokenDeAcesso: vi.fn(async () => 'novo-token'),
  };

  const clientes = new GestaoClientes(repositorio, tokens);
  const app = criarAplicacao(
    { verificarConexaoComBanco: async () => {} },
    undefined,
    { origemFrontend: 'http://localhost:5173' } as ServicosRotasAutenticacao,
    undefined,
    undefined,
    undefined,
    undefined,
    clientes,
  );
  aplicacoes.push(app);

  return { idCliente, idEscritorio, operacoes, repositorio, tokens, clientes, app };
}

describe('Rotas HTTP de Clientes (/api/v1/clientes)', () => {
  it('aplica Cache-Control: no-store em todas as respostas', async () => {
    const { app } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'GET',
      url: '/api/v1/clientes',
      headers: { authorization: 'Bearer token-valido' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['cache-control']).toBe('no-store');
  });

  it('exige Bearer token (401 quando ausente)', async () => {
    const { app } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'GET',
      url: '/api/v1/clientes',
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ erro: 'NAO_AUTORIZADO' });
  });

  it('valida cabeçalho Origin em mutações POST/PATCH (403 quando incorreto)', async () => {
    const { app } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/v1/clientes',
      headers: {
        authorization: 'Bearer token-valido',
        origin: 'http://origem-maliciosa.com',
      },
      payload: {
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Teste',
        documento: '11144477735',
      },
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ erro: 'PROIBIDO' });
  });

  it('rejeita mass assignment com campos extras (.strict() -> 400)', async () => {
    const { app } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/v1/clientes',
      headers: {
        authorization: 'Bearer token-valido',
        origin: 'http://localhost:5173',
      },
      payload: {
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Teste',
        documento: '11144477735',
        officeId: randomUUID(), // campo proibido
        status: 'ACTIVE',       // campo proibido
      },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ erro: 'DADOS_INVALIDOS' });
  });

  it('cadastra cliente com sucesso (201)', async () => {
    const { app } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/v1/clientes',
      headers: {
        authorization: 'Bearer token-valido',
        origin: 'http://localhost:5173',
      },
      payload: {
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Ana Paula Souza',
        documento: '11144477735',
        email: 'ana@example.test',
      },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      nome: 'Ana Paula Souza',
      documento: '11144477735',
    });
  });

  it('inativa cliente com sucesso e aceita motivo (200)', async () => {
    const { app, idCliente } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'POST',
      url: `/api/v1/clientes/${idCliente}/inativar`,
      headers: {
        authorization: 'Bearer token-valido',
        origin: 'http://localhost:5173',
      },
      payload: {
        versao: 0,
        motivo: 'Contrato encerrado',
      },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().situacao).toBe('INATIVO');
  });

  it('reativa cliente com sucesso (200)', async () => {
    const { app, idCliente, operacoes } = prepararCenarioRotas();
    const clienteInativo = await operacoes.buscarClientePorId(idCliente);
    clienteInativo.situacao = 'INATIVO';

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/v1/clientes/${idCliente}/ativar`,
      headers: {
        authorization: 'Bearer token-valido',
        origin: 'http://localhost:5173',
      },
      payload: {
        versao: 0,
        motivo: 'Cliente retornou',
      },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().situacao).toBe('ATIVO');
  });

  it('consulta linha do tempo do cliente (200)', async () => {
    const { app, idCliente } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'GET',
      url: `/api/v1/clientes/${idCliente}/linha-do-tempo`,
      headers: { authorization: 'Bearer token-valido' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(Array.isArray(resposta.json())).toBe(true);
    expect(resposta.json()[0].acao).toBe('CLIENTE_CRIADO');
  });

  it('sanitiza erros internos e não expõe detalhes de infraestrutura (503)', async () => {
    const { app, repositorio } = prepararCenarioRotas();
    vi.mocked(repositorio.executar).mockRejectedValue(new Error('Falha de conexão com PostgreSQL'));

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/v1/clientes',
      headers: { authorization: 'Bearer token-valido' },
    });

    expect(resposta.statusCode).toBe(503);
    expect(resposta.body).not.toContain('PostgreSQL');
    expect(resposta.json()).toMatchObject({ erro: 'INDISPONIVEL' });
  });

  it('rejeita acesso de sessão com primeiro acesso pendente (403)', async () => {
    const { app, repositorio } = prepararCenarioRotas();
    vi.mocked(repositorio.executar).mockRejectedValue(new ErroPrimeiroAcessoObrigatorio());

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/v1/clientes',
      headers: { authorization: 'Bearer token-valido' },
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ erro: 'PRIMEIRO_ACESSO_OBRIGATORIO' });
  });
});
