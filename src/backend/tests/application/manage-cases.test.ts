import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GestaoCasosProcessos } from '../../src/application/cases/manage-cases.js';
import { RepositorioCasosEmMemoria } from '../support/in-memory-cases-repository.js';
import { Processo } from '../../src/domain/cases/legal-process.js';
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
        'CASO_REGISTRAR_MOVIMENTACAO',
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

  describe('Processos Vinculados (1:N) e Movimentações Manuais (Slice 2 — RF-038..RF-044, RF-045)', () => {
    function gerarCnj(seq: number): string {
      const s = String(seq).padStart(7, '0');
      const dd = Processo.calcularDigitoVerificador(s, 2024, 8, 26, 100);
      return `${s}-${dd}.2024.8.26.0100`;
    }

    it('cadastra processo vinculado a um caso ativo com sucesso (RF-038..RF-042)', async () => {
      const caso = await gestao.cadastrarCaso(tokenAdvogadoA, {
        titulo: 'Ação Ordinária de Reparação',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente1A],
      });

      const cnj = gerarCnj(101);
      const processo = await gestao.cadastrarProcessoNoCaso(tokenAdvogadoA, caso.id, {
        numeroCnj: cnj,
        relacaoComCaso: 'PRINCIPAL',
        tribunal: 'TJSP',
        comarca: 'São Paulo',
        vara: '2ª Vara Cível',
        instancia: 'PRIMEIRA_INSTANCIA',
        faseProcessual: 'CONHECIMENTO',
      });

      expect(processo.id).toBeDefined();
      expect(processo.idCaso).toBe(caso.id);
      expect(processo.numeroCnj).toBe(Processo.normalizarNumeroCnj(cnj));
      expect(processo.numeroCnjFormatado).toBe(cnj);
      expect(processo.tribunal).toBe('TJSP');
      expect(processo.comarca).toBe('São Paulo');
      expect(processo.vara).toBe('2ª Vara Cível');

      // Verifica que o caso detalhado agora tem o processo e a quantidade é 1
      const casoAtualizado = await gestao.consultarCasoPorId(tokenAdvogadoA, caso.id);
      expect(casoAtualizado.processos).toHaveLength(1);
      expect(casoAtualizado.quantidadeProcessos).toBe(1);
      expect(casoAtualizado.processos[0].numeroCnj).toBe(Processo.normalizarNumeroCnj(cnj));

      // Verifica que evento PROCESSO_CADASTRADO foi gravado na linha do tempo
      const timeline = await gestao.consultarLinhaDoTempo(tokenAdvogadoA, caso.id);
      expect(timeline.some((e) => e.acao === 'PROCESSO_CADASTRADO' && e.idProcesso === processo.id)).toBe(true);
    });

    it('permite múltiplos processos relacionados ao mesmo caso (1:N — RF-042)', async () => {
      const caso = await gestao.cadastrarCaso(tokenAdvogadoA, {
        titulo: 'Caso com Múltiplas Instâncias',
        natureza: 'JUDICIAL',
        areaJuridica: 'TRABALHISTA',
        idsClientes: [idCliente1A],
      });

      const cnj1 = gerarCnj(201);
      const cnj2 = gerarCnj(202);

      await gestao.cadastrarProcessoNoCaso(tokenAdvogadoA, caso.id, {
        numeroCnj: cnj1,
        relacaoComCaso: 'PRINCIPAL',
        tribunal: 'TRT-2',
        instancia: 'PRIMEIRA_INSTANCIA',
        faseProcessual: 'CONHECIMENTO',
      });

      await gestao.cadastrarProcessoNoCaso(tokenAdvogadoA, caso.id, {
        numeroCnj: cnj2,
        relacaoComCaso: 'RECURSO',
        tribunal: 'TRT-2 - 1ª Turma',
        instancia: 'SEGUNDA_INSTANCIA',
        faseProcessual: 'RECURSAL',
      });

      const casoComProcs = await gestao.consultarCasoPorId(tokenAdvogadoA, caso.id);
      expect(casoComProcs.processos).toHaveLength(2);
      expect(casoComProcs.quantidadeProcessos).toBe(2);
      expect(casoComProcs.processos.map((p) => p.relacaoComCaso)).toEqual(
        expect.arrayContaining(['PRINCIPAL', 'RECURSO']),
      );
    });

    it('impede cadastrar o mesmo CNJ duas vezes no mesmo caso (409 CNJ_JA_VINCULADO_NO_CASO)', async () => {
      const caso = await gestao.cadastrarCaso(tokenAdvogadoA, {
        titulo: 'Caso Duplicação CNJ',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente1A],
      });

      const cnj = gerarCnj(301);
      await gestao.cadastrarProcessoNoCaso(tokenAdvogadoA, caso.id, {
        numeroCnj: cnj,
        tribunal: 'TJSP',
        instancia: 'PRIMEIRA_INSTANCIA',
        faseProcessual: 'CONHECIMENTO',
      });

      await expect(
        gestao.cadastrarProcessoNoCaso(tokenAdvogadoA, caso.id, {
          numeroCnj: cnj,
          tribunal: 'TJSP',
          instancia: 'PRIMEIRA_INSTANCIA',
          faseProcessual: 'CONHECIMENTO',
        }),
      ).rejects.toMatchObject({
        codigo: 'CNJ_JA_VINCULADO_NO_CASO',
        situacao: 409,
      });
    });

    it('bloqueia inclusão de processo em caso arquivado (409 CASO_ARQUIVADO_SOMENTE_LEITURA)', async () => {
      const caso = await gestao.cadastrarCaso(tokenAdvogadoA, {
        titulo: 'Caso a Arquivar',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente1A],
      });

      await gestao.arquivarCaso(tokenAdvogadoA, caso.id, { versao: caso.versao });

      const cnj = gerarCnj(401);
      await expect(
        gestao.cadastrarProcessoNoCaso(tokenAdvogadoA, caso.id, {
          numeroCnj: cnj,
          tribunal: 'TJSP',
          instancia: 'PRIMEIRA_INSTANCIA',
          faseProcessual: 'CONHECIMENTO',
        }),
      ).rejects.toMatchObject({
        codigo: 'CASO_ARQUIVADO_SOMENTE_LEITURA',
        situacao: 409,
      });
    });

    it('edita processo e atualiza fase processual com CAS (RF-040..RF-042)', async () => {
      const caso = await gestao.cadastrarCaso(tokenAdvogadoA, {
        titulo: 'Caso Edição Processual',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente1A],
      });

      const cnj = gerarCnj(501);
      const proc = await gestao.cadastrarProcessoNoCaso(tokenAdvogadoA, caso.id, {
        numeroCnj: cnj,
        tribunal: 'TJSP',
        instancia: 'PRIMEIRA_INSTANCIA',
        faseProcessual: 'CONHECIMENTO',
      });

      // Conflito de versão CAS
      await expect(
        gestao.editarProcessoDoCaso(tokenAdvogadoA, caso.id, proc.id, {
          tribunal: 'TJSP - Modificado',
          versao: 99,
        }),
      ).rejects.toMatchObject({
        codigo: 'CONFLITO',
        situacao: 409,
      });

      // Edição bem-sucedida mudando de fase
      const editado = await gestao.editarProcessoDoCaso(tokenAdvogadoA, caso.id, proc.id, {
        faseProcessual: 'RECURSAL',
        instancia: 'SEGUNDA_INSTANCIA',
        versao: proc.versao,
      });

      expect(editado.versao).toBe(1);
      expect(editado.faseProcessual).toBe('RECURSAL');
      expect(editado.instancia).toBe('SEGUNDA_INSTANCIA');

      const timeline = await gestao.consultarLinhaDoTempo(tokenAdvogadoA, caso.id);
      expect(timeline.some((e) => e.acao === 'FASE_PROCESSUAL_ALTERADA')).toBe(true);
    });

    it('registra movimentação manual e lista histórico (RF-043)', async () => {
      const caso = await gestao.cadastrarCaso(tokenAdvogadoA, {
        titulo: 'Caso com Andamentos',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente1A],
      });

      const cnj = gerarCnj(601);
      const proc = await gestao.cadastrarProcessoNoCaso(tokenAdvogadoA, caso.id, {
        numeroCnj: cnj,
        tribunal: 'TJSP',
        instancia: 'PRIMEIRA_INSTANCIA',
        faseProcessual: 'CONHECIMENTO',
      });

      const dataMov = new Date('2024-06-15T10:00:00Z');
      const mov = await gestao.registrarMovimentacaoManual(tokenAdvogadoA, caso.id, proc.id, {
        ocorridaEm: dataMov,
        descricao: 'Sentença proferida julgando o pedido procedente.',
      });

      expect(mov.id).toBeDefined();
      expect(mov.idProcesso).toBe(proc.id);
      expect(mov.descricao).toBe('Sentença proferida julgando o pedido procedente.');

      // Listar movimentações
      const listagem = await gestao.listarMovimentacoesProcesso(tokenAdvogadoA, caso.id, proc.id);
      expect(listagem.movimentacoes).toHaveLength(1);
      expect(listagem.total).toBe(1);
      expect(listagem.movimentacoes[0].descricao).toBe(mov.descricao);

      // Linha do tempo registra MOVIMENTACAO_REGISTRADA
      const timeline = await gestao.consultarLinhaDoTempo(tokenAdvogadoA, caso.id);
      expect(timeline.some((e) => e.acao === 'MOVIMENTACAO_REGISTRADA')).toBe(true);
    });

    it('busca casos por número CNJ na listagem (RF-045)', async () => {
      const caso = await gestao.cadastrarCaso(tokenAdvogadoA, {
        titulo: 'Caso de Teste Busca CNJ',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente1A],
      });

      const cnj = gerarCnj(701);
      await gestao.cadastrarProcessoNoCaso(tokenAdvogadoA, caso.id, {
        numeroCnj: cnj,
        tribunal: 'TJSP',
        instancia: 'PRIMEIRA_INSTANCIA',
        faseProcessual: 'CONHECIMENTO',
      });

      // Busca por CNJ com filtro dedicado
      const buscaPorCnj = await gestao.listarCasos(tokenAdvogadoA, {
        pagina: 1,
        tamanhoPagina: 20,
        numeroCnj: cnj,
      });
      expect(buscaPorCnj.casos).toHaveLength(1);
      expect(buscaPorCnj.casos[0].id).toBe(caso.id);

      // Busca por CNJ no campo de pesquisa textual geral
      const buscaPesquisa = await gestao.listarCasos(tokenAdvogadoA, {
        pagina: 1,
        tamanhoPagina: 20,
        pesquisa: cnj,
      });
      expect(buscaPesquisa.casos).toHaveLength(1);
      expect(buscaPesquisa.casos[0].id).toBe(caso.id);
    });

    it('garante isolamento multi-tenant intransponível em processos e movimentações (RNF-001, RN-004)', async () => {
      const casoA = await gestao.cadastrarCaso(tokenAdvogadoA, {
        titulo: 'Caso Isolado Escritório A',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente1A],
      });

      const cnjA = gerarCnj(801);
      const procA = await gestao.cadastrarProcessoNoCaso(tokenAdvogadoA, casoA.id, {
        numeroCnj: cnjA,
        tribunal: 'TJSP',
        instancia: 'PRIMEIRA_INSTANCIA',
        faseProcessual: 'CONHECIMENTO',
      });

      // Escritório B tenta adicionar processo ao caso do Escritório A -> 404
      const cnjB = gerarCnj(802);
      await expect(
        gestao.cadastrarProcessoNoCaso(tokenAdvogadoB, casoA.id, {
          numeroCnj: cnjB,
          tribunal: 'TJSP',
          instancia: 'PRIMEIRA_INSTANCIA',
          faseProcessual: 'CONHECIMENTO',
        }),
      ).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });

      // Escritório B tenta consultar processo do Escritório A -> 404
      await expect(
        gestao.consultarProcessoPorId(tokenAdvogadoB, casoA.id, procA.id),
      ).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });

      // Escritório B tenta editar processo do Escritório A -> 404
      await expect(
        gestao.editarProcessoDoCaso(tokenAdvogadoB, casoA.id, procA.id, {
          tribunal: 'Hacked',
          versao: procA.versao,
        }),
      ).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });

      // Escritório B tenta registrar movimentação no processo do Escritório A -> 404
      await expect(
        gestao.registrarMovimentacaoManual(tokenAdvogadoB, casoA.id, procA.id, {
          ocorridaEm: new Date(),
          descricao: 'Movimentação indevida',
        }),
      ).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });

      // Escritório B busca por CNJ de A na listagem -> 0 resultados
      const buscaB = await gestao.listarCasos(tokenAdvogadoB, {
        pagina: 1,
        tamanhoPagina: 10,
        numeroCnj: cnjA,
      });
      expect(buscaB.casos).toHaveLength(0);
    });
  });
});
