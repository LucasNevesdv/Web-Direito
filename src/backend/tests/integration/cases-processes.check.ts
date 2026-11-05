// Verificação real de Casos e Processos (RF-031 a RF-048) sobre PostgreSQL migrado.
// Execute somente em banco descartável (VERIFICACAO_BANCO_DESCARTAVEL=true).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import type { DadosTokenAcesso, TokensAcesso } from '../../src/application/authentication/authentication-contracts.js';
import { GestaoCasosProcessos } from '../../src/application/cases/manage-cases.js';
import { ErroCasoProcesso } from '../../src/application/cases/case-policy.js';
import { RepositorioCasosPrisma } from '../../src/infrastructure/prisma/prisma-cases-repository.js';
import { Processo } from '../../src/domain/cases/legal-process.js';

if (process.env.VERIFICACAO_BANCO_DESCARTAVEL !== 'true' || !process.env.DATABASE_URL) {
  console.error('Defina DATABASE_URL de um banco descartável e VERIFICACAO_BANCO_DESCARTAVEL=true.');
  process.exit(1);
}

const prisma = new PrismaClient();
const EXECUCAO = randomUUID();
const agora = new Date();

function gerarCnjValido(seq = 1, ano = 2024, j = 8, tr = 26, o = 100): string {
  const s = String(seq).padStart(7, '0');
  const a = String(ano);
  const seg = String(j);
  const tribunal = String(tr).padStart(2, '0');
  const origem = String(o).padStart(4, '0');
  const dd = Processo.calcularDigitoVerificador(s, a, seg, tribunal, origem);
  return `${s}${dd}${a}${seg}${tribunal}${origem}`;
}

function gerarCpfValido(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (base.every((d) => d === base[0])) base[8] = (base[8] + 1) % 10;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += base[i] * (10 - i);
  let d1 = (soma * 10) % 11;
  if (d1 === 10 || d1 === 11) d1 = 0;
  base.push(d1);
  soma = 0;
  for (let i = 0; i < 10; i++) soma += base[i] * (11 - i);
  let d2 = (soma * 10) % 11;
  if (d2 === 10 || d2 === 11) d2 = 0;
  base.push(d2);
  return base.join('');
}

interface MembroCriado {
  idUsuario: string;
  idVinculo: string;
  contexto: DadosTokenAcesso;
}

interface EscritorioCriado {
  id: string;
  dono: MembroCriado;
  advogado: MembroCriado;
  estagiario: MembroCriado;
}

const contextos = new Map<string, DadosTokenAcesso>();
const token = (contexto: DadosTokenAcesso): string => {
  const chave = randomUUID();
  contextos.set(chave, contexto);
  return chave;
};
const tokens: TokensAcesso = {
  criarTokenDeAcesso: async (dadosToken: DadosTokenAcesso) => token(dadosToken),
  validarTokenDeAcesso: async (chave: string): Promise<DadosTokenAcesso> => {
    const ctx = contextos.get(chave);
    if (!ctx) throw new Error('Token de verificação não encontrado');
    return ctx;
  },
};

const usuariosCriados: string[] = [];
const escritoriosCriados: string[] = [];
const clientesCriados: string[] = [];

async function criarEscritorio(prefixo: string): Promise<EscritorioCriado> {
  const escritorio = await prisma.office.create({
    data: {
      id: randomUUID(),
      name: `Verif Casos ${EXECUCAO} ${prefixo}`,
      createdAt: agora,
      updatedAt: agora,
    },
  });
  escritoriosCriados.push(escritorio.id);

  const papeis = ['OWNER', 'LAWYER', 'INTERN'] as const;
  const membros = await Promise.all(
    papeis.map(async (papelPrisma) => {
      const usuario = await prisma.user.create({
        data: {
          id: randomUUID(),
          name: `${papelPrisma} ${prefixo} ${EXECUCAO}`,
          email: `casos-${EXECUCAO}-${prefixo}-${papelPrisma.toLowerCase()}@verificacao.test`,
          passwordHash: 'argon2id_placeholder',
          status: 'ACTIVE',
          mustChangePassword: false,
          createdAt: agora,
          updatedAt: agora,
        },
      });
      usuariosCriados.push(usuario.id);

      const papelDominio = ({
        OWNER: 'PROPRIETARIO',
        LAWYER: 'ADVOGADO',
        INTERN: 'ESTAGIARIO',
      } as const)[papelPrisma];

      const permissoes =
        papelPrisma === 'OWNER'
          ? []
          : papelPrisma === 'LAWYER'
            ? [
                'CASO_VISUALIZAR',
                'CASO_CADASTRAR',
                'CASO_EDITAR',
                'CASO_ARQUIVAR_REABRIR',
                'CASO_REGISTRAR_MOVIMENTACAO',
              ]
            : ['CASO_VISUALIZAR'];

      const vinculo = await prisma.membership.create({
        data: {
          id: randomUUID(),
          officeId: escritorio.id,
          userId: usuario.id,
          role: papelPrisma,
          active: true,
          permissions: permissoes,
          createdAt: agora,
          updatedAt: agora,
        },
      });

      const sessao = await prisma.session.create({
        data: {
          id: randomUUID(),
          userId: usuario.id,
          activeOfficeId: escritorio.id,
          refreshTokenHash: 'f'.repeat(64),
          restricted: false,
          expiresAt: new Date(Date.now() + 3600000),
          createdAt: agora,
          updatedAt: agora,
        },
      });

      const contexto: DadosTokenAcesso = {
        idUsuario: usuario.id,
        idSessao: sessao.id,
        idEscritorioAtivo: escritorio.id,
        papel: papelDominio,
      };

      return {
        idUsuario: usuario.id,
        idVinculo: vinculo.id,
        contexto,
      };
    }),
  );

  return {
    id: escritorio.id,
    dono: membros[0],
    advogado: membros[1],
    estagiario: membros[2],
  };
}

try {
  const escritorioA = await criarEscritorio('A');
  const escritorioB = await criarEscritorio('B');

  // Criação dos clientes para os casos
  const clienteA1 = await prisma.client.create({
    data: {
      id: randomUUID(),
      officeId: escritorioA.id,
      type: 'INDIVIDUAL',
      name: 'Cliente Alpha 1',
      documentNumber: gerarCpfValido(),
      status: 'ACTIVE',
      createdAt: agora,
      updatedAt: agora,
    },
  });
  clientesCriados.push(clienteA1.id);

  const clienteA2 = await prisma.client.create({
    data: {
      id: randomUUID(),
      officeId: escritorioA.id,
      type: 'INDIVIDUAL',
      name: 'Cliente Alpha 2',
      documentNumber: gerarCpfValido(),
      status: 'ACTIVE',
      createdAt: agora,
      updatedAt: agora,
    },
  });
  clientesCriados.push(clienteA2.id);

  const clienteB1 = await prisma.client.create({
    data: {
      id: randomUUID(),
      officeId: escritorioB.id,
      type: 'INDIVIDUAL',
      name: 'Cliente Beta 1',
      documentNumber: gerarCpfValido(),
      status: 'ACTIVE',
      createdAt: agora,
      updatedAt: agora,
    },
  });
  clientesCriados.push(clienteB1.id);

  const repositorio = new RepositorioCasosPrisma(prisma);
  const casos = new GestaoCasosProcessos(repositorio, tokens);

  // --------------------------------------------------------------------------
  // Cenário 1: Cadastro atômico de caso com multi-cliente (1:N), equipe, partes e timeline
  // --------------------------------------------------------------------------
  const casoA = await casos.cadastrarCaso(token(escritorioA.dono.contexto), {
    titulo: 'Ação Revisional de Cláusulas Contratuais',
    descricao: 'Revisão judicial com pedido liminar',
    natureza: 'JUDICIAL',
    areaJuridica: 'Cível',
    prioridade: 'ALTA',
    idsClientes: [clienteA1.id, clienteA2.id],
    idVinculoResponsavel: escritorioA.advogado.idVinculo,
    idsVinculosEquipe: [escritorioA.estagiario.idVinculo],
    partesIniciais: [
      {
        tipoParticipacao: 'PARTE_CONTRARIA',
        nome: 'Banco Cobrador Nacional S/A',
        documento: '00000000000191',
        contato: 'contencioso@banco.test',
      },
    ],
    valorCausaCentavos: 12000000,
    valorEnvolvidoCentavos: 15000000,
  });

  assert.ok(casoA.id);
  assert.equal(casoA.clientes.length, 2, 'Deve conter 2 clientes vinculados');
  assert.equal(casoA.equipe.length, 1, 'Deve conter 1 membro adicional de equipe');
  assert.equal(casoA.partes.length, 1, 'Deve conter 1 parte contrária');
  assert.equal(casoA.situacao, 'ATIVO');
  assert.equal(casoA.versao, 0);

  // Linha do tempo do caso gravada no banco
  const timelineCaso = await casos.consultarLinhaDoTempo(token(escritorioA.dono.contexto), casoA.id);
  assert.ok(timelineCaso.some((e) => e.acao === 'CASO_CRIADO'));

  // Sincronização atômica bidirecional na linha do tempo de cada cliente vinculado (RF-026/RF-032)
  const timelineCliente1 = await prisma.clientTimelineEvent.findMany({
    where: { officeId: escritorioA.id, clientId: clienteA1.id, action: 'CASO_VINCULADO' },
  });
  const timelineCliente2 = await prisma.clientTimelineEvent.findMany({
    where: { officeId: escritorioA.id, clientId: clienteA2.id, action: 'CASO_VINCULADO' },
  });
  assert.equal(timelineCliente1.length, 1);
  assert.equal(timelineCliente2.length, 1);

  // --------------------------------------------------------------------------
  // Cenário 2: Concorrência Otimista (CAS) no PostgreSQL
  // --------------------------------------------------------------------------
  const casoAtualizado = await casos.editarCaso(token(escritorioA.dono.contexto), casoA.id, {
    versao: 0,
    titulo: 'Ação Revisional — Fase Postulatória',
    natureza: 'JUDICIAL',
    areaJuridica: 'Cível',
    prioridade: 'URGENTE',
    idsClientes: [clienteA1.id, clienteA2.id],
  });
  assert.equal(casoAtualizado.versao, 1);

  // Tentativa de edição concorrente com versão obsoleta (0) resulta em 409 CONFLITO
  await assert.rejects(
    casos.editarCaso(token(escritorioA.advogado.contexto), casoA.id, {
      versao: 0,
      titulo: 'Edição concorrente que deve conflitar',
      natureza: 'JUDICIAL',
      areaJuridica: 'Cível',
      prioridade: 'MEDIA',
      idsClientes: [clienteA1.id, clienteA2.id],
    }),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCasoProcesso);
      assert.equal(erro.codigo, 'CONFLITO');
      assert.equal(erro.situacao, 409);
      return true;
    },
  );

  // --------------------------------------------------------------------------
  // Cenário 3: Vínculo de Múltiplos Processos Judiciais (1:N) com CNJ Válido
  // --------------------------------------------------------------------------
  const cnj1 = gerarCnjValido(1001, 2024, 8, 26, 100);
  const cnj2 = gerarCnjValido(1002, 2024, 8, 26, 100);

  const processo1 = await casos.cadastrarProcessoNoCaso(token(escritorioA.dono.contexto), casoA.id, {
    numeroCnj: cnj1,
    relacaoComCaso: 'PRINCIPAL',
    tribunal: 'TJSP',
    comarca: 'São Paulo',
    vara: '5ª Vara Cível Central',
    instancia: 'PRIMEIRA_INSTANCIA',
    faseProcessual: 'CONHECIMENTO',
  });
  assert.equal(processo1.numeroCnj, cnj1);
  assert.equal(processo1.versao, 0);

  const processo2 = await casos.cadastrarProcessoNoCaso(token(escritorioA.advogado.contexto), casoA.id, {
    numeroCnj: cnj2,
    relacaoComCaso: 'INCIDENTE',
    tribunal: 'TJSP',
    comarca: 'São Paulo',
    vara: '5ª Vara Cível Central',
    instancia: 'PRIMEIRA_INSTANCIA',
    faseProcessual: 'CUMPRIMENTO_SENTENCA',
  });
  assert.equal(processo2.numeroCnj, cnj2);

  const processosNoBanco = await prisma.legalProcess.count({ where: { caseId: casoA.id } });
  assert.equal(processosNoBanco, 2, 'O caso deve possuir 2 processos 1:N vinculados');

  // --------------------------------------------------------------------------
  // Cenário 4: Bloqueio de Cadastro de Processo com CNJ Duplicado no Mesmo Caso
  // --------------------------------------------------------------------------
  await assert.rejects(
    casos.cadastrarProcessoNoCaso(token(escritorioA.dono.contexto), casoA.id, {
      numeroCnj: cnj1,
      relacaoComCaso: 'RECURSO',
      tribunal: 'TJSP',
      instancia: 'PRIMEIRA_INSTANCIA',
      faseProcessual: 'RECURSAL',
    }),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCasoProcesso);
      assert.equal(erro.codigo, 'CNJ_JA_VINCULADO_NO_CASO');
      assert.equal(erro.situacao, 409);
      return true;
    },
  );

  // Validação direta da constraint unique (office_id, case_id, cnj_number) no PostgreSQL
  await assert.rejects(
    prisma.legalProcess.create({
      data: {
        id: randomUUID(),
        officeId: escritorioA.id,
        caseId: casoA.id,
        cnjNumber: cnj1,
        court: 'TJSP',
        instance: 'FIRST_INSTANCE',
        proceduralPhase: 'INICIAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }),
    (erro: unknown) => {
      assert.ok(erro instanceof Prisma.PrismaClientKnownRequestError);
      assert.equal(erro.code, 'P2002');
      return true;
    },
  );

  // --------------------------------------------------------------------------
  // Cenário 5: Registro de Movimentação Manual e Atualização de last_activity_at
  // --------------------------------------------------------------------------
  const casoAntesMov = await prisma.legalCase.findUniqueOrThrow({ where: { id: casoA.id } });
  const tempoAntes = casoAntesMov.lastActivityAt.getTime();

  await new Promise((r) => setTimeout(r, 20));

  const mov = await casos.registrarMovimentacaoManual(token(escritorioA.advogado.contexto), casoA.id, processo1.id, {
    ocorridaEm: new Date(),
    descricao: 'Juntada de petição com pedido de tutela de urgência.',
  });
  assert.ok(mov.id);
  assert.equal(mov.idProcesso, processo1.id);

  const casoAposMov = await prisma.legalCase.findUniqueOrThrow({ where: { id: casoA.id } });
  assert.ok(casoAposMov.lastActivityAt.getTime() > tempoAntes, 'lastActivityAt deve avançar após movimentação');

  const listaMov = await casos.listarMovimentacoesProcesso(token(escritorioA.dono.contexto), casoA.id, processo1.id);
  assert.equal(listaMov.total, 1);
  assert.equal(listaMov.movimentacoes[0].id, mov.id);

  // --------------------------------------------------------------------------
  // Cenário 6: Arquivamento, Bloqueio de Novas Modificações e Reabertura
  // --------------------------------------------------------------------------
  const casoAntesArq = await casos.consultarCasoPorId(token(escritorioA.dono.contexto), casoA.id);
  const arquivado = await casos.arquivarCaso(token(escritorioA.dono.contexto), casoA.id, {
    versao: casoAntesArq.versao,
    motivo: 'Acordo homologado em audiência de conciliação',
  });
  assert.equal(arquivado.situacao, 'ARQUIVADO');

  // Bloqueio de nova movimentação manual em caso arquivado
  await assert.rejects(
    casos.registrarMovimentacaoManual(token(escritorioA.advogado.contexto), casoA.id, processo1.id, {
      ocorridaEm: new Date(),
      descricao: 'Movimentação em caso arquivado deve ser rejeitada',
    }),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCasoProcesso);
      assert.equal(erro.codigo, 'CASO_ARQUIVADO_SOMENTE_LEITURA');
      assert.equal(erro.situacao, 409);
      return true;
    },
  );

  // Bloqueio de vincular processo em caso arquivado
  await assert.rejects(
    casos.cadastrarProcessoNoCaso(token(escritorioA.dono.contexto), casoA.id, {
      numeroCnj: gerarCnjValido(9999, 2024, 8, 26, 100),
      tribunal: 'TJSP',
      instancia: 'PRIMEIRA_INSTANCIA',
      faseProcessual: 'CONHECIMENTO',
    }),
    { codigo: 'CASO_ARQUIVADO_SOMENTE_LEITURA', situacao: 409 },
  );

  // Reabertura do caso
  const reaberto = await casos.reabrirCaso(token(escritorioA.dono.contexto), casoA.id, {
    versao: arquivado.versao,
    motivo: 'Descumprimento de obrigação de fazer pelo réu',
  });
  assert.equal(reaberto.situacao, 'ATIVO');

  // Movimentação passa com sucesso após reabertura
  const mov2 = await casos.registrarMovimentacaoManual(token(escritorioA.advogado.contexto), casoA.id, processo1.id, {
    ocorridaEm: new Date(),
    descricao: 'Petição requerendo aplicação de astreintes por descumprimento.',
  });
  assert.ok(mov2.id);

  // --------------------------------------------------------------------------
  // Cenário 7: Prova de Isolamento Multi-Tenant Estrito
  // --------------------------------------------------------------------------
  // Escritório B não visualiza nenhum caso do Escritório A
  const listagemB = await casos.listarCasos(token(escritorioB.dono.contexto), { pagina: 1, tamanhoPagina: 20 });
  assert.equal(listagemB.total, 0);

  // Usuário de B tenta consultar caso de A -> 404
  await assert.rejects(
    casos.consultarCasoPorId(token(escritorioB.dono.contexto), casoA.id),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCasoProcesso);
      assert.equal(erro.codigo, 'NAO_ENCONTRADO');
      assert.equal(erro.situacao, 404);
      return true;
    },
  );

  // Usuário de B tenta editar caso de A -> 404
  await assert.rejects(
    casos.editarCaso(token(escritorioB.dono.contexto), casoA.id, {
      versao: reaberto.versao,
      titulo: 'Invasão Cross-Tenant de Caso',
      idsClientes: [clienteB1.id],
    }),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCasoProcesso);
      assert.equal(erro.codigo, 'NAO_ENCONTRADO');
      assert.equal(erro.situacao, 404);
      return true;
    },
  );

  // Usuário de B tenta vincular processo em caso de A -> 404
  await assert.rejects(
    casos.cadastrarProcessoNoCaso(token(escritorioB.dono.contexto), casoA.id, {
      numeroCnj: gerarCnjValido(8888, 2024, 8, 26, 100),
      tribunal: 'TJSP',
      instancia: 'PRIMEIRA_INSTANCIA',
      faseProcessual: 'CONHECIMENTO',
    }),
    { codigo: 'NAO_ENCONTRADO', situacao: 404 },
  );

  // Usuário de B tenta registrar movimentação em processo de A -> 404
  await assert.rejects(
    casos.registrarMovimentacaoManual(token(escritorioB.dono.contexto), casoA.id, processo1.id, {
      ocorridaEm: new Date(),
      descricao: 'Movimentação fraudulenta',
    }),
    { codigo: 'NAO_ENCONTRADO', situacao: 404 },
  );

  // Rejeição ao tentar criar caso em A com cliente pertencente a B -> 400 CLIENTE_INVALIDO
  await assert.rejects(
    casos.cadastrarCaso(token(escritorioA.dono.contexto), {
      titulo: 'Tentativa de caso com cliente alheio',
      natureza: 'JUDICIAL',
      areaJuridica: 'Cível',
      prioridade: 'MEDIA',
      idsClientes: [clienteB1.id],
    }),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCasoProcesso);
      assert.equal(erro.codigo, 'CLIENTE_INVALIDO');
      assert.equal(erro.situacao, 400);
      return true;
    },
  );

  // Rejeição ao tentar vincular membro de equipe pertencente ao Escritório B -> 400 MEMBRO_EQUIPE_INVALIDO
  await assert.rejects(
    casos.cadastrarCaso(token(escritorioA.dono.contexto), {
      titulo: 'Tentativa de caso com membro alheio',
      natureza: 'JUDICIAL',
      areaJuridica: 'Cível',
      prioridade: 'MEDIA',
      idsClientes: [clienteA1.id],
      idVinculoResponsavel: escritorioB.advogado.idVinculo,
    }),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCasoProcesso);
      assert.equal(erro.codigo, 'MEMBRO_EQUIPE_INVALIDO');
      assert.equal(erro.situacao, 400);
      return true;
    },
  );

  console.info(JSON.stringify({ verificacao: 'casos_processos', resultado: 'ok', escritórios: 2 }));
} finally {
  try {
    if (escritoriosCriados.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.processMovement.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.caseTimelineEvent.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.clientTimelineEvent.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.legalProcess.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.caseParty.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.caseTeamMember.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.caseClient.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.legalCase.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.clientContact.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.client.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.session.deleteMany({ where: { activeOfficeId: { in: escritoriosCriados } } });
        await tx.membership.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.user.deleteMany({ where: { id: { in: usuariosCriados } } });
        await tx.office.deleteMany({ where: { id: { in: escritoriosCriados } } });
      });

      // Validação de resíduo zero
      const movsRestantes = await prisma.processMovement.count({ where: { officeId: { in: escritoriosCriados } } });
      const timelineCasosRestantes = await prisma.caseTimelineEvent.count({ where: { officeId: { in: escritoriosCriados } } });
      const timelineClientesRestantes = await prisma.clientTimelineEvent.count({ where: { officeId: { in: escritoriosCriados } } });
      const processosRestantes = await prisma.legalProcess.count({ where: { officeId: { in: escritoriosCriados } } });
      const partesRestantes = await prisma.caseParty.count({ where: { officeId: { in: escritoriosCriados } } });
      const equipeRestantes = await prisma.caseTeamMember.count({ where: { officeId: { in: escritoriosCriados } } });
      const casoClientesRestantes = await prisma.caseClient.count({ where: { officeId: { in: escritoriosCriados } } });
      const casosRestantes = await prisma.legalCase.count({ where: { officeId: { in: escritoriosCriados } } });
      const clientesRestantes = await prisma.client.count({ where: { officeId: { in: escritoriosCriados } } });
      const escritoriosRestantes = await prisma.office.count({ where: { id: { in: escritoriosCriados } } });
      const usuariosRestantes = await prisma.user.count({ where: { id: { in: usuariosCriados } } });

      assert.equal(movsRestantes, 0);
      assert.equal(timelineCasosRestantes, 0);
      assert.equal(timelineClientesRestantes, 0);
      assert.equal(processosRestantes, 0);
      assert.equal(partesRestantes, 0);
      assert.equal(equipeRestantes, 0);
      assert.equal(casoClientesRestantes, 0);
      assert.equal(casosRestantes, 0);
      assert.equal(clientesRestantes, 0);
      assert.equal(escritoriosRestantes, 0);
      assert.equal(usuariosRestantes, 0);
    }
  } catch (erroLimpeza) {
    console.error('Falha na limpeza dos dados de verificação de casos e processos:', erroLimpeza);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
