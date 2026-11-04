import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GestaoCasosProcessos } from '../../src/application/cases/manage-cases.js';
import { RepositorioCasosEmMemoria } from '../support/in-memory-cases-repository.js';
import type { TokensAcesso, DadosTokenAcesso } from '../../src/application/authentication/authentication-contracts.js';

class TokensAcessoSimulado implements TokensAcesso {
  readonly contextos = new Map<string, DadosTokenAcesso>();

  async criarTokenDeAcesso(contexto: DadosTokenAcesso): Promise<string> {
    const token = `token-${contexto.idUsuario}-${contexto.idEscritorioAtivo}`;
    this.contextos.set(token, contexto);
    return token;
  }

  async validarTokenDeAcesso(token: string): Promise<DadosTokenAcesso> {
    const contexto = this.contextos.get(token);
    if (!contexto) {
      throw new Error('Token inválido');
    }
    return contexto;
  }
}

describe('Gestão de Casos e Processos — Application (Slice 1)', () => {
  let repositorio: RepositorioCasosEmMemoria;
  let tokens: TokensAcessoSimulado;
  let gestao: GestaoCasosProcessos;

  const idEscritorioA = randomUUID();
  const idEscritorioB = randomUUID();

  const idUsuarioAdvogadoA = randomUUID();
  const idVinculoAdvogadoA = randomUUID();

  const idUsuarioEstagiarioA = randomUUID();
  const idVinculoEstagiarioA = randomUUID();

  const idCliente1A = randomUUID();
  const idCliente2A = randomUUID();

  const idUsuarioAdvogadoB = randomUUID();
  const idVinculoAdvogadoB = randomUUID();
  const idClienteB = randomUUID();

  let tokenAdvogadoA: string;
  let tokenEstagiarioA: string;
  let tokenAdvogadoB: string;

  beforeEach(async () => {
    repositorio = new RepositorioCasosEmMemoria();
    tokens = new TokensAcessoSimulado();
    gestao = new GestaoCasosProcessos(repositorio, tokens);

    // Escritório A: Membros
    repositorio.membros.push(
      {
        id: idVinculoAdvogadoA,
        idEscritorio: idEscritorioA,
        idUsuario: idUsuarioAdvogadoA,
        nome: 'Dra. Alice Advogada',
        papel: 'ADVOGADO',
        ativo: true,
        permissoes: [
          'CASO_VISUALIZAR',
          'CASO_CADASTRAR',
          'CASO_EDITAR',
          'CASO_ARQUIVAR_REABRIR',
          'CASO_REGISTRAR_MOVIMENTACAO',
        ],
      },
      {
        id: idVinculoEstagiarioA,
        idEscritorio: idEscritorioA,
        idUsuario: idUsuarioEstagiarioA,
        nome: 'Bruno Estagiário',
        papel: 'ESTAGIARIO',
        ativo: true,
        permissoes: ['CASO_VISUALIZAR', 'CASO_CADASTRAR', 'CASO_EDITAR'],
      },
    );

    // Escritório A: Clientes
    repositorio.clientes.push(
      {
        id: idCliente1A,
        idEscritorio: idEscritorioA,
        nome: 'Cliente Alpha Ltda',
        documento: '11222333000181',
        tipoPessoa: 'PESSOA_JURIDICA',
        status: 'ACTIVE',
      },
      {
        id: idCliente2A,
        idEscritorio: idEscritorioA,
        nome: 'Bernardo Silva',
        documento: '11144477735',
        tipoPessoa: 'PESSOA_FISICA',
        status: 'ACTIVE',
      },
    );

    // Escritório B: Membros e Clientes
    repositorio.membros.push({
      id: idVinculoAdvogadoB,
      idEscritorio: idEscritorioB,
      idUsuario: idUsuarioAdvogadoB,
      nome: 'Dr. Roberto B',
      papel: 'ADVOGADO',
      ativo: true,
      permissoes: [
        'CASO_VISUALIZAR',
        'CASO_CADASTRAR',
        'CASO_EDITAR',
        'CASO_ARQUIVAR_REABRIR',
      ],
    });

    repositorio.clientes.push({
      id: idClienteB,
      idEscritorio: idEscritorioB,
      nome: 'Cliente Escritório B',
      documento: '22233344455',
      tipoPessoa: 'PESSOA_FISICA',
      status: 'ACTIVE',
    });

    tokenAdvogadoA = await tokens.criarTokenDeAcesso({
      idSessao: randomUUID(),
      idUsuario: idUsuarioAdvogadoA,
      idEscritorioAtivo: idEscritorioA,
      papel: 'ADVOGADO',
    });

    tokenEstagiarioA = await tokens.criarTokenDeAcesso({
      idSessao: randomUUID(),
      idUsuario: idUsuarioEstagiarioA,
      idEscritorioAtivo: idEscritorioA,
      papel: 'ESTAGIARIO',
    });

    tokenAdvogadoB = await tokens.criarTokenDeAcesso({
      idSessao: randomUUID(),
      idUsuario: idUsuarioAdvogadoB,
      idEscritorioAtivo: idEscritorioB,
      papel: 'ADVOGADO',
    });
  });

  it('cadastra caso com sucesso com clientes, responsável, valores e partes iniciais (RF-031 a RF-037)', async () => {
    const caso = await gestao.cadastrarCaso(tokenAdvogadoA, {
      titulo: 'Execução de Título Extrajudicial',
      descricao: 'Cobrança de duplicatas mercantis inadimplidas.',
      natureza: 'JUDICIAL',
      areaJuridica: 'CIVEL',
      prioridade: 'ALTA',
      idVinculoResponsavel: idVinculoAdvogadoA,
      valorCausaCentavos: 15000000, // R$ 150.000,00
      valorEnvolvidoCentavos: 18000000,
      idsClientes: [idCliente1A, idCliente2A],
      idsVinculosEquipe: [idVinculoEstagiarioA],
      partesIniciais: [
        {
          tipoParticipacao: 'PARTE_CONTRARIA',
          nome: 'Devedora Comércio e Indústria Ltda',
          documento: '11222333000181',
          contato: 'financeiro@devedora.test',
        },
      ],
    });

    expect(caso.id).toBeTruthy();
    expect(caso.titulo).toBe('Execução de Título Extrajudicial');
    expect(caso.natureza).toBe('JUDICIAL');
    expect(caso.areaJuridica).toBe('CIVEL');
    expect(caso.prioridade).toBe('ALTA');
    expect(caso.situacao).toBe('ATIVO');
    expect(caso.nomeResponsavel).toBe('Dra. Alice Advogada');
    expect(caso.valorCausaCentavos).toBe(15000000);
    expect(caso.valorEnvolvidoCentavos).toBe(18000000);
    expect(caso.clientes).toHaveLength(2);
    expect(caso.equipe).toHaveLength(1);
    expect(caso.partes).toHaveLength(1);
    expect(caso.partes[0]!.nome).toBe('Devedora Comércio e Indústria Ltda');

    // Sincronização atômica na timeline dos clientes (RF-026 / RF-032)
    const eventosCliente1 = repositorio.linhaTempoClientes.filter((e) => e.clientId === idCliente1A);
    const eventosCliente2 = repositorio.linhaTempoClientes.filter((e) => e.clientId === idCliente2A);
    expect(eventosCliente1).toHaveLength(1);
    expect(eventosCliente1[0]!.action).toBe('CASO_VINCULADO');
    expect(eventosCliente2).toHaveLength(1);
    expect(eventosCliente2[0]!.action).toBe('CASO_VINCULADO');

    // Linha do tempo do caso (RF-044)
    const timelineCaso = await gestao.consultarLinhaDoTempo(tokenAdvogadoA, caso.id);
    expect(timelineCaso).toHaveLength(1);
    expect(timelineCaso[0]!.acao).toBe('CASO_CRIADO');
  });

  it('permite cadastrar caso sem responsável para triagem posterior (RF-047, DP-09)', async () => {
    const caso = await gestao.cadastrarCaso(tokenAdvogadoA, {
      titulo: 'Consulta Trabalhista Inicial',
      natureza: 'CONSULTIVO',
      areaJuridica: 'TRABALHISTA',
      idsClientes: [idCliente2A],
      idVinculoResponsavel: null,
    });

    expect(caso.idVinculoResponsavel).toBeNull();
    expect(caso.nomeResponsavel).toBeNull();

    // Filtro rápido semResponsavel=true
    const listaSemResp = await gestao.listarCasos(tokenAdvogadoA, {
      pagina: 1,
      tamanhoPagina: 10,
      semResponsavel: true,
    });

    expect(listaSemResp.casos.some((c) => c.id === caso.id)).toBe(true);
  });

  it('filtro semAtividadeDesdeDias retorna casos inativos há N dias (RF-048)', async () => {
    const caso = await gestao.cadastrarCaso(tokenAdvogadoA, {
      titulo: 'Caso Sem Movimento Antigo',
      natureza: 'ADMINISTRATIVO',
      areaJuridica: 'TRIBUTARIO',
      idsClientes: [idCliente1A],
    });

    // Simula última atividade há 35 dias
    const casoNoRepo = repositorio.casos.find((c) => c.id === caso.id)!;
    casoNoRepo.ultimaAtividadeEm = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

    const resultadoInativos = await gestao.listarCasos(tokenAdvogadoA, {
      pagina: 1,
      tamanhoPagina: 10,
      semAtividadeDesdeDias: 30,
    });

    expect(resultadoInativos.casos.some((c) => c.id === caso.id)).toBe(true);
  });

  it('rejeita estagiário como responsável principal do caso (ADR-001 / DP-04)', async () => {
    await expect(
      gestao.cadastrarCaso(tokenAdvogadoA, {
        titulo: 'Caso Com Responsável Inválido',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente1A],
        idVinculoResponsavel: idVinculoEstagiarioA,
      }),
    ).rejects.toMatchObject({
      codigo: 'RESPONSAVEL_INVALIDO',
      situacao: 400,
    });
  });

  it('rejeita cliente inexistente ou inativo no escritório (RN-003, RF-032)', async () => {
    await expect(
      gestao.cadastrarCaso(tokenAdvogadoA, {
        titulo: 'Caso Cliente Inexistente',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [randomUUID()],
      }),
    ).rejects.toMatchObject({
      codigo: 'CLIENTE_INVALIDO',
      situacao: 400,
    });
  });

  it('edita caso com sucesso aplicando CAS na versão', async () => {
    const caso = await gestao.cadastrarCaso(tokenAdvogadoA, {
      titulo: 'Título Original do Caso',
      natureza: 'JUDICIAL',
      areaJuridica: 'CIVEL',
      prioridade: 'BAIXA',
      idsClientes: [idCliente1A],
    });

    const editado = await gestao.editarCaso(tokenAdvogadoA, caso.id, {
      titulo: 'Título Atualizado do Caso',
      prioridade: 'URGENTE',
      versao: caso.versao,
    });

    expect(editado.titulo).toBe('Título Atualizado do Caso');
    expect(editado.prioridade).toBe('URGENTE');
    expect(editado.versao).toBe(1);

    // Tentativa concorrente com versão antiga sofre conflito (409)
    await expect(
      gestao.editarCaso(tokenAdvogadoA, caso.id, {
        titulo: 'Outro Título Concorrente',
        versao: caso.versao, // versão 0 desatualizada
      }),
    ).rejects.toMatchObject({
      codigo: 'CONFLITO',
      situacao: 409,
    });
  });

  it('arquiva e reabre caso com CAS, bloqueando edições enquanto arquivado (RF-046, DP-08)', async () => {
    const caso = await gestao.cadastrarCaso(tokenAdvogadoA, {
      titulo: 'Caso Para Arquivamento Operacional',
      natureza: 'EXTRAJUDICIAL',
      areaJuridica: 'EMPRESARIAL',
      idsClientes: [idCliente1A],
    });

    // Estagiário tenta arquivar sem permissão CASO_ARQUIVAR_REABRIR
    await expect(
      gestao.arquivarCaso(tokenEstagiarioA, caso.id, { versao: caso.versao }),
    ).rejects.toMatchObject({
      codigo: 'PROIBIDO',
      situacao: 403,
    });

    // Advogado A arquiva com sucesso
    const arquivado = await gestao.arquivarCaso(tokenAdvogadoA, caso.id, {
      versao: caso.versao,
      motivo: 'Acordo firmado e quitado integralmente.',
    });
    expect(arquivado.situacao).toBe('ARQUIVADO');
    expect(arquivado.versao).toBe(1);

    // Tentativa de editar caso arquivado é rejeitada (DP-08)
    await expect(
      gestao.editarCaso(tokenAdvogadoA, caso.id, {
        titulo: 'Alteração em Caso Arquivado',
        versao: arquivado.versao,
      }),
    ).rejects.toMatchObject({
      codigo: 'CASO_ARQUIVADO_SOMENTE_LEITURA',
      situacao: 409,
    });

    // Tentativa de adicionar parte em caso arquivado é rejeitada
    await expect(
      gestao.adicionarParte(tokenAdvogadoA, caso.id, {
        tipoParticipacao: 'OUTRO',
        nome: 'Terceiro Novo',
      }),
    ).rejects.toMatchObject({
      codigo: 'CASO_ARQUIVADO_SOMENTE_LEITURA',
      situacao: 409,
    });

    // Reabrir caso
    const reaberto = await gestao.reabrirCaso(tokenAdvogadoA, caso.id, {
      versao: arquivado.versao,
      motivo: 'Descumprimento de cláusula de garantia.',
    });
    expect(reaberto.situacao).toBe('ATIVO');
    expect(reaberto.versao).toBe(2);

    // Agora edição é novamente permitida
    const reeditado = await gestao.editarCaso(tokenAdvogadoA, caso.id, {
      titulo: 'Caso Reaberto e Atualizado',
      versao: reaberto.versao,
    });
    expect(reeditado.titulo).toBe('Caso Reaberto e Atualizado');
  });

  it('gerencia partes contrárias e envolvidos do caso (RF-036)', async () => {
    const caso = await gestao.cadastrarCaso(tokenAdvogadoA, {
      titulo: 'Caso Com Partes Contrárias',
      natureza: 'JUDICIAL',
      areaJuridica: 'CIVEL',
      idsClientes: [idCliente1A],
    });

    // Adiciona parte
    const parte = await gestao.adicionarParte(tokenAdvogadoA, caso.id, {
      tipoParticipacao: 'ADVOGADO_CONTRARIO',
      nome: 'Dr. Severino Souza',
      oab: 'RJ-998877',
      contato: 'severino@adv.test',
    });
    expect(parte.id).toBeTruthy();
    expect(parte.nome).toBe('Dr. Severino Souza');

    // Edita parte
    const editada = await gestao.editarParte(tokenAdvogadoA, caso.id, parte.id, {
      nome: 'Dr. Severino Souza Filho',
    });
    expect(editada.nome).toBe('Dr. Severino Souza Filho');

    // Remove parte
    await gestao.removerParte(tokenAdvogadoA, caso.id, parte.id);

    const detalheAposRemover = await gestao.consultarCasoPorId(tokenAdvogadoA, caso.id);
    expect(detalheAposRemover.partes.some((p) => p.id === parte.id)).toBe(false);
  });

  describe('Isolamento Estrito Multi-Tenant (RNF-001, RN-001..RN-004)', () => {
    it('impede Escritório A de cadastrar caso com cliente do Escritório B (RN-003)', async () => {
      await expect(
        gestao.cadastrarCaso(tokenAdvogadoA, {
          titulo: 'Caso Invasão de Tenant',
          natureza: 'JUDICIAL',
          areaJuridica: 'CIVEL',
          idsClientes: [idClienteB], // Cliente do Escritório B!
        }),
      ).rejects.toMatchObject({
        codigo: 'CLIENTE_INVALIDO',
        situacao: 400,
      });
    });

    it('impede Escritório A de atribuir responsável do Escritório B (RN-003)', async () => {
      await expect(
        gestao.cadastrarCaso(tokenAdvogadoA, {
          titulo: 'Caso Invasão Responsável',
          natureza: 'JUDICIAL',
          areaJuridica: 'CIVEL',
          idsClientes: [idCliente1A],
          idVinculoResponsavel: idVinculoAdvogadoB, // Vínculo do Escritório B!
        }),
      ).rejects.toMatchObject({
        codigo: 'MEMBRO_EQUIPE_INVALIDO',
        situacao: 400,
      });
    });

    it('retorna 404 sem vazar existência se Escritório B tentar acessar caso do Escritório A (RN-004)', async () => {
      const casoA = await gestao.cadastrarCaso(tokenAdvogadoA, {
        titulo: 'Segredo Jurídico Escritório A',
        natureza: 'JUDICIAL',
        areaJuridica: 'PENAL',
        idsClientes: [idCliente1A],
      });

      // Consulta direta por ID
      await expect(gestao.consultarCasoPorId(tokenAdvogadoB, casoA.id)).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });

      // Edição
      await expect(
        gestao.editarCaso(tokenAdvogadoB, casoA.id, {
          titulo: 'Tentativa de Hack',
          versao: casoA.versao,
        }),
      ).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });

      // Arquivamento
      await expect(
        gestao.arquivarCaso(tokenAdvogadoB, casoA.id, { versao: casoA.versao }),
      ).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });

      // Linha do tempo
      await expect(
        gestao.consultarLinhaDoTempo(tokenAdvogadoB, casoA.id),
      ).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });
    });

    it('listagem de casos do Escritório B nunca inclui casos do Escritório A (RF-045, RNF-001)', async () => {
      await gestao.cadastrarCaso(tokenAdvogadoA, {
        titulo: 'Caso Privado do Escritório A',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente1A],
      });

      const listagemB = await gestao.listarCasos(tokenAdvogadoB, {
        pagina: 1,
        tamanhoPagina: 50,
      });

      expect(listagemB.casos).toHaveLength(0);
      expect(listagemB.total).toBe(0);
    });
  });
});
