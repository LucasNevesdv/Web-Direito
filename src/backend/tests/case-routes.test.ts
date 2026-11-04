import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarAplicacao } from '../src/app.js';
import { GestaoCasosProcessos } from '../src/application/cases/manage-cases.js';
import { ErroCasoProcesso } from '../src/application/cases/case-policy.js';
import type { TokensAcesso } from '../src/application/authentication/authentication-contracts.js';
import type { ServicosRotasAutenticacao } from '../src/presentation/authentication-routes.js';
import type {
  CasoDetalheDto,
  CasoResumoDto,
  EventoLinhaTempoCasoDto,
  OperacoesCasosProcessos,
  ParteEnvolvidaDto,
  RepositorioCasosProcessos,
} from '../src/application/cases/case-contracts.js';

const aplicacoes: ReturnType<typeof criarAplicacao>[] = [];
afterEach(async () => {
  await Promise.all(aplicacoes.splice(0).map((app) => app.close()));
});

function prepararCenarioRotas(casoInicial?: Partial<CasoDetalheDto>) {
  const idCaso = randomUUID();
  const idCliente = randomUUID();
  const idParte = randomUUID();
  const idEscritorio = randomUUID();
  const idUsuario = randomUUID();

  const parteMock: ParteEnvolvidaDto = {
    id: idParte,
    idEscritorio,
    idCaso,
    tipoParticipacao: 'PARTE_CONTRARIA',
    nome: 'Empresa Oposta S/A',
    documento: '11222333000181',
    oab: null,
    contato: 'juridico@oposta.test',
    observacao: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  };

  const casoResumo: CasoResumoDto = {
    id: idCaso,
    idEscritorio,
    titulo: 'Ação de Cobrança Extrajudicial',
    natureza: 'EXTRAJUDICIAL',
    areaJuridica: 'CIVEL',
    prioridade: 'MEDIA',
    situacao: 'ATIVO',
    idVinculoResponsavel: null,
    nomeResponsavel: null,
    valorCausaCentavos: 1000000,
    valorEnvolvidoCentavos: 1200000,
    clientes: [
      {
        id: idCliente,
        nome: 'Cliente Autor',
        documento: '11144477735',
        tipoPessoa: 'PESSOA_FISICA',
      },
    ],
    quantidadeProcessos: 0,
    versao: 0,
    ultimaAtividadeEm: new Date(),
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  };

  const casoDetalhe: CasoDetalheDto = {
    ...casoResumo,
    descricao: 'Descrição detalhada do caso.',
    equipe: [],
    partes: [parteMock],
    processos: [],
    ...casoInicial,
  };

  const eventoLinhaTempo: EventoLinhaTempoCasoDto = {
    id: randomUUID(),
    idEscritorio,
    idCaso,
    idProcesso: null,
    idAutor: idUsuario,
    nomeAutor: 'Dr. Autor',
    acao: 'CASO_CRIADO',
    anterior: null,
    atual: { titulo: casoResumo.titulo },
    criadoEm: new Date(),
  };

  const repositorioMock: RepositorioCasosProcessos = {
    executar: vi.fn(async (_contexto, operacao) => {
      const operacoes: OperacoesCasosProcessos = {
        autor: {
          idUsuario,
          idEscritorio,
          papel: 'ADVOGADO',
          permissoes: [
            'CASO_VISUALIZAR',
            'CASO_CADASTRAR',
            'CASO_EDITAR',
            'CASO_ARQUIVAR_REABRIR',
            'CASO_REGISTRAR_MOVIMENTACAO',
          ],
        },
        listarCasos: vi.fn(async () => ({ casos: [casoResumo], total: 1 })),
        buscarCasoPorId: vi.fn(async (id: string) => {
          if (id === idCaso) return casoDetalhe;
          throw new ErroCasoProcesso('NAO_ENCONTRADO', 404);
        }),
        validarClientesNoEscritorio: vi.fn(async () => [
          {
            id: idCliente,
            nome: 'Cliente Autor',
            documento: '11144477735',
            tipoPessoa: 'PESSOA_FISICA',
            status: 'ACTIVE',
          },
        ]),
        validarVinculoEquipeNoEscritorio: vi.fn(async () => ({
          id: randomUUID(),
          idUsuario: randomUUID(),
          nome: 'Advogado Teste',
          papel: 'ADVOGADO' as const,
          ativo: true,
        })),
        criarCaso: vi.fn(async () => casoDetalhe),
        atualizarCaso: vi.fn(async () => ({ ...casoDetalhe, versao: 1 })),
        arquivarCaso: vi.fn(async () => ({ ...casoDetalhe, situacao: 'ARQUIVADO' as const, versao: 1 })),
        reabrirCaso: vi.fn(async () => ({ ...casoDetalhe, situacao: 'ATIVO' as const, versao: 2 })),
        adicionarParte: vi.fn(async () => parteMock),
        atualizarParte: vi.fn(async () => parteMock),
        removerParte: vi.fn(async () => undefined),
        listarLinhaDoTempoCaso: vi.fn(async () => [eventoLinhaTempo]),
      };
      return operacao(operacoes);
    }),
  };

  const tokensMock: TokensAcesso = {
    validarTokenDeAcesso: vi.fn(async () => ({
      idSessao: randomUUID(),
      idUsuario,
      idEscritorioAtivo: idEscritorio,
      papel: 'ADVOGADO' as const,
    })),
    criarTokenDeAcesso: vi.fn(async () => 'token-simulado'),
  };

  const gestao = new GestaoCasosProcessos(repositorioMock, tokensMock);

  const autenticacaoMock = {
    origemFrontend: 'http://localhost:5173',
  } as ServicosRotasAutenticacao;

  const verificadorSaudeMock = {
    verificarConexaoComBanco: vi.fn(async () => undefined),
  };

  const app = criarAplicacao(
    verificadorSaudeMock,
    undefined,
    autenticacaoMock,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    gestao,
  );
  aplicacoes.push(app);

  return { app, idCaso, idCliente, idParte, origem: 'http://localhost:5173' };
}

describe('Rotas de Casos e Processos (/api/v1/casos)', () => {
  it('rejeita requisições sem Bearer token com 401', async () => {
    const { app } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'GET',
      url: '/api/v1/casos',
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ erro: 'NAO_AUTORIZADO' });
  });

  it('lista casos com 200 e aplica Cache-Control: no-store', async () => {
    const { app } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'GET',
      url: '/api/v1/casos?pagina=1&tamanhoPagina=10',
      headers: {
        authorization: 'Bearer token-valido',
      },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['cache-control']).toBe('no-store');
    const corpo = resposta.json();
    expect(corpo.casos).toHaveLength(1);
    expect(corpo.total).toBe(1);
    expect(corpo.casos[0].titulo).toBe('Ação de Cobrança Extrajudicial');
  });

  it('rejeita mutação POST sem Origin válido com 403', async () => {
    const { app, idCliente } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/v1/casos',
      headers: {
        authorization: 'Bearer token-valido',
        origin: 'http://hacker.test',
      },
      payload: {
        titulo: 'Caso Malicioso',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente],
      },
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ erro: 'PROIBIDO' });
  });

  it('cadastra caso com 201 ao enviar payload válido', async () => {
    const { app, idCliente, origem } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/v1/casos',
      headers: {
        authorization: 'Bearer token-valido',
        origin: origem,
      },
      payload: {
        titulo: 'Ação Rescisória de Contrato',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        prioridade: 'ALTA',
        valorCausaCentavos: 2500000,
        idsClientes: [idCliente],
      },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.headers['cache-control']).toBe('no-store');
    expect(resposta.json()).toHaveProperty('id');
  });

  it('rejeita criação com payload inválido ou campos adicionais (.strict)', async () => {
    const { app, idCliente, origem } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/v1/casos',
      headers: {
        authorization: 'Bearer token-valido',
        origin: origem,
      },
      payload: {
        titulo: 'Ação Rescisória',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente],
        campoInesperado: 'mass_assignment_attack',
      },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ erro: 'DADOS_INVALIDOS' });
  });

  it('consulta caso por ID com 200', async () => {
    const { app, idCaso } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'GET',
      url: `/api/v1/casos/${idCaso}`,
      headers: {
        authorization: 'Bearer token-valido',
      },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().id).toBe(idCaso);
  });

  it('retorna 404 para caso não encontrado', async () => {
    const { app } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'GET',
      url: `/api/v1/casos/${randomUUID()}`,
      headers: {
        authorization: 'Bearer token-valido',
      },
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toMatchObject({ erro: 'NAO_ENCONTRADO' });
  });

  it('edita caso via PATCH com 200 exigindo versão', async () => {
    const { app, idCaso, origem } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'PATCH',
      url: `/api/v1/casos/${idCaso}`,
      headers: {
        authorization: 'Bearer token-valido',
        origin: origem,
      },
      payload: {
        titulo: 'Título Atualizado',
        versao: 0,
      },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().versao).toBe(1);
  });

  it('arquiva caso com 200 (RF-046)', async () => {
    const { app, idCaso, origem } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'POST',
      url: `/api/v1/casos/${idCaso}/arquivar`,
      headers: {
        authorization: 'Bearer token-valido',
        origin: origem,
      },
      payload: {
        versao: 0,
        motivo: 'Processo encerrado com cumprimento de acordo.',
      },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().situacao).toBe('ARQUIVADO');
  });

  it('reabre caso com 200 (RF-046)', async () => {
    const { app, idCaso, origem } = prepararCenarioRotas({
      situacao: 'ARQUIVADO',
      versao: 1,
    });
    const resposta = await app.inject({
      method: 'POST',
      url: `/api/v1/casos/${idCaso}/reabrir`,
      headers: {
        authorization: 'Bearer token-valido',
        origin: origem,
      },
      payload: {
        versao: 1,
        motivo: 'Execução de cláusula penal.',
      },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().situacao).toBe('ATIVO');
  });

  it('adiciona parte contrária com 201 (RF-036)', async () => {
    const { app, idCaso, origem } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'POST',
      url: `/api/v1/casos/${idCaso}/partes`,
      headers: {
        authorization: 'Bearer token-valido',
        origin: origem,
      },
      payload: {
        tipoParticipacao: 'ADVOGADO_CONTRARIO',
        nome: 'Dr. Lucas Ribeiro',
        oab: 'MG-123456',
      },
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().nome).toBe('Empresa Oposta S/A');
  });

  it('remove parte com 204 (RF-036)', async () => {
    const { app, idCaso, idParte, origem } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'DELETE',
      url: `/api/v1/casos/${idCaso}/partes/${idParte}`,
      headers: {
        authorization: 'Bearer token-valido',
        origin: origem,
      },
    });

    expect(resposta.statusCode).toBe(204);
  });

  it('consulta linha do tempo do caso com 200 (RF-044)', async () => {
    const { app, idCaso } = prepararCenarioRotas();
    const resposta = await app.inject({
      method: 'GET',
      url: `/api/v1/casos/${idCaso}/linha-do-tempo`,
      headers: {
        authorization: 'Bearer token-valido',
      },
    });

    expect(resposta.statusCode).toBe(200);
    const eventos = resposta.json();
    expect(eventos).toHaveLength(1);
    expect(eventos[0].acao).toBe('CASO_CRIADO');
  });
});
