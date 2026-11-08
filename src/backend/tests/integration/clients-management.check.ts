// Verificação real de Gestão de Clientes (RF-015 a RF-030) sobre PostgreSQL migrado.
// Execute somente em banco descartável (VERIFICACAO_BANCO_DESCARTAVEL=true).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import type { DadosTokenAcesso, TokensAcesso } from '../../src/application/authentication/authentication-contracts.js';
import { GestaoClientes } from '../../src/application/clients/manage-clients.js';
import { ErroCliente } from '../../src/application/clients/client-policy.js';
import { RepositorioClientesPrisma } from '../../src/infrastructure/prisma/prisma-clients-repository.js';

if (process.env.VERIFICACAO_BANCO_DESCARTAVEL !== 'true' || !process.env.DATABASE_URL) {
  console.error('Defina DATABASE_URL de um banco descartável e VERIFICACAO_BANCO_DESCARTAVEL=true.');
  process.exit(1);
}

const prisma = new PrismaClient();
const EXECUCAO = randomUUID();
const agora = new Date();

function gerarCpfValido(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (base.every((d) => d === base[0])) {
    base[8] = (base[8] + 1) % 10;
  }
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += base[i] * (10 - i);
  }
  let d1 = (soma * 10) % 11;
  if (d1 === 10 || d1 === 11) d1 = 0;
  base.push(d1);
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += base[i] * (11 - i);
  }
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

async function criarEscritorio(prefixo: string): Promise<EscritorioCriado> {
  const escritorio = await prisma.office.create({
    data: {
      id: randomUUID(),
      name: `Verif Clientes ${EXECUCAO} ${prefixo}`,
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
          email: `clientes-${EXECUCAO}-${prefixo}-${papelPrisma.toLowerCase()}@verificacao.test`,
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
                'CLIENTE_VISUALIZAR',
                'CLIENTE_VISUALIZAR_OBSERVACOES',
                'CLIENTE_CADASTRAR',
                'CLIENTE_EDITAR',
                'CLIENTE_ATIVAR_INATIVAR',
              ]
            : ['CLIENTE_VISUALIZAR'];

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
          refreshTokenHash: 'e'.repeat(64),
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

  const repositorio = new RepositorioClientesPrisma(prisma);
  const clientes = new GestaoClientes(repositorio, tokens);

  // --------------------------------------------------------------------------
  // Cenário 1: Unicidade de CPF por escritório (RF-028)
  // --------------------------------------------------------------------------
  const cpf1 = gerarCpfValido();

  const cliente1A = await clientes.cadastrarCliente(token(escritorioA.dono.contexto), {
    tipoPessoa: 'PESSOA_FISICA',
    nome: 'Carlos Eduardo Silva',
    documento: cpf1,
    email: 'carlos.eduardo@exemplo.test',
    telefone: '11987654321',
    idVinculoResponsavel: escritorioA.advogado.idVinculo,
    observacoesInternas: 'Observações confidenciais do cliente 1',
  });

  assert.ok(cliente1A.id);
  assert.equal(cliente1A.documento, cpf1);
  assert.equal(cliente1A.situacao, 'ATIVO');
  assert.equal(cliente1A.versao, 0);

  // Tentativa de duplicar CPF no mesmo Escritório A -> rejeitado pela aplicação com 409
  await assert.rejects(
    clientes.cadastrarCliente(token(escritorioA.advogado.contexto), {
      tipoPessoa: 'PESSOA_FISICA',
      nome: 'Carlos Eduardo Segundo',
      documento: cpf1,
    }),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCliente);
      assert.equal(erro.codigo, 'DOCUMENTO_JA_CADASTRADO');
      assert.equal(erro.situacao, 409);
      return true;
    },
  );

  // Tentativa direta no banco violando unique (office_id, document_number)
  await assert.rejects(
    prisma.client.create({
      data: {
        id: randomUUID(),
        officeId: escritorioA.id,
        type: 'INDIVIDUAL',
        name: 'Carlos Conflito Direto SQL',
        documentNumber: cpf1,
        status: 'ACTIVE',
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
  // Cenário 2: Mesma titularidade de CPF em escritórios distintos (RF-028, RNF-001)
  // --------------------------------------------------------------------------
  const cliente1B = await clientes.cadastrarCliente(token(escritorioB.dono.contexto), {
    tipoPessoa: 'PESSOA_FISICA',
    nome: 'Carlos Eduardo Silva no Escritorio B',
    documento: cpf1,
    email: 'carlos.b@exemplo.test',
  });

  assert.ok(cliente1B.id);
  assert.notEqual(cliente1B.id, cliente1A.id);
  assert.equal(cliente1B.documento, cpf1);
  assert.equal(cliente1B.idEscritorio, escritorioB.id);

  const totalComMesmoCpf = await prisma.client.count({ where: { documentNumber: cpf1 } });
  assert.equal(totalComMesmoCpf, 2, 'CPF deve coabitar escritórios diferentes');

  // --------------------------------------------------------------------------
  // Cenário 3: Inativação e reativação com eventos gravados na linha do tempo
  // --------------------------------------------------------------------------
  const inativado = await clientes.definirSituacaoCliente(
    token(escritorioA.dono.contexto),
    cliente1A.id,
    false,
    cliente1A.versao,
    'Cliente encerrou o contrato',
  );
  assert.equal(inativado.situacao, 'INATIVO');
  assert.equal(inativado.versao, cliente1A.versao + 1);

  const reativado = await clientes.definirSituacaoCliente(
    token(escritorioA.dono.contexto),
    cliente1A.id,
    true,
    inativado.versao,
    'Cliente reabriu nova demanda',
  );
  assert.equal(reativado.situacao, 'ATIVO');
  assert.equal(reativado.versao, inativado.versao + 1);

  const timelineCliente = await clientes.consultarLinhaDoTempo(token(escritorioA.dono.contexto), cliente1A.id);
  const acoesTimeline = timelineCliente.map((e) => e.acao);
  assert.ok(acoesTimeline.includes('CLIENTE_CRIADO'));
  assert.ok(acoesTimeline.includes('CLIENTE_INATIVADO'));
  assert.ok(acoesTimeline.includes('CLIENTE_REATIVADO'));

  const timelineNoBanco = await prisma.clientTimelineEvent.findMany({
    where: { officeId: escritorioA.id, clientId: cliente1A.id },
  });
  assert.ok(timelineNoBanco.length >= 3);

  // --------------------------------------------------------------------------
  // Cenário 4: Concorrência Otimista (CAS)
  // --------------------------------------------------------------------------
  await assert.rejects(
    clientes.editarCliente(token(escritorioA.dono.contexto), cliente1A.id, {
      versao: 0, // Versão desatualizada (atual é 2)
      nome: 'Tentativa Concorrente Desatualizada',
      documento: cpf1,
    }),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCliente);
      assert.equal(erro.codigo, 'CONFLITO');
      assert.equal(erro.situacao, 409);
      return true;
    },
  );

  // --------------------------------------------------------------------------
  // Cenário 5: Contatos e Vínculos Relacionados
  // --------------------------------------------------------------------------
  const contato = await clientes.adicionarContato(token(escritorioA.dono.contexto), cliente1A.id, {
    nome: 'Dra. Advogada Parceira',
    cargoOuRelacao: 'Correspondente',
    email: 'parceira@exemplo.test',
    telefone: '11988887777',
    observacao: 'Contato de audiências',
  });
  assert.ok(contato.id);

  const vinculos = await clientes.consultarVinculos(token(escritorioA.dono.contexto), cliente1A.id);
  assert.ok(Array.isArray(vinculos.documentos));
  assert.ok(Array.isArray(vinculos.tarefas));
  assert.ok(Array.isArray(vinculos.compromissos));
  assert.ok(Array.isArray(vinculos.processos));
  assert.ok(Array.isArray(vinculos.casos));

  // --------------------------------------------------------------------------
  // Cenário 6: Isolamento Estrito entre Escritório A e Escritório B
  // --------------------------------------------------------------------------
  // Listagem do Escritório B retorna apenas clientes de B
  const listagemB = await clientes.listarClientes(token(escritorioB.dono.contexto), {
    pagina: 1,
    tamanhoPagina: 20,
    pesquisa: '',
  });
  assert.equal(listagemB.total, 1);
  assert.equal(listagemB.clientes[0].id, cliente1B.id);

  // Usuário de B tenta consultar cliente de A -> 404
  await assert.rejects(
    clientes.consultarCliente(token(escritorioB.dono.contexto), cliente1A.id),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCliente);
      assert.equal(erro.codigo, 'NAO_ENCONTRADO');
      assert.equal(erro.situacao, 404);
      return true;
    },
  );

  // Usuário de B tenta editar cliente de A -> 404
  await assert.rejects(
    clientes.editarCliente(token(escritorioB.dono.contexto), cliente1A.id, {
      versao: reativado.versao,
      nome: 'Tentativa Invasão Cross-Tenant',
      documento: cpf1,
    }),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCliente);
      assert.equal(erro.codigo, 'NAO_ENCONTRADO');
      assert.equal(erro.situacao, 404);
      return true;
    },
  );

  // Usuário de B tenta alterar situação de cliente de A -> 404
  await assert.rejects(
    clientes.definirSituacaoCliente(token(escritorioB.dono.contexto), cliente1A.id, false, reativado.versao),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCliente);
      assert.equal(erro.codigo, 'NAO_ENCONTRADO');
      assert.equal(erro.situacao, 404);
      return true;
    },
  );

  // Usuário de B tenta ver linha do tempo de cliente de A -> 404
  await assert.rejects(
    clientes.consultarLinhaDoTempo(token(escritorioB.dono.contexto), cliente1A.id),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCliente);
      assert.equal(erro.codigo, 'NAO_ENCONTRADO');
      assert.equal(erro.situacao, 404);
      return true;
    },
  );

  // Usuário de B tenta adicionar contato a cliente de A -> 404
  await assert.rejects(
    clientes.adicionarContato(token(escritorioB.dono.contexto), cliente1A.id, {
      nome: 'Invasor B',
    }),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCliente);
      assert.equal(erro.codigo, 'NAO_ENCONTRADO');
      assert.equal(erro.situacao, 404);
      return true;
    },
  );

  // Tentativa de atribuir responsável de outro escritório no cadastro de cliente -> 400
  await assert.rejects(
    clientes.cadastrarCliente(token(escritorioA.dono.contexto), {
      tipoPessoa: 'PESSOA_FISICA',
      nome: 'Cliente Responsável Alheio',
      documento: gerarCpfValido(),
      idVinculoResponsavel: escritorioB.advogado.idVinculo,
    }),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroCliente);
      assert.equal(erro.codigo, 'RESPONSAVEL_INVALIDO');
      assert.equal(erro.situacao, 400);
      return true;
    },
  );

  // --------------------------------------------------------------------------
  // Cenário 7: Controle de Acesso e Observações Restritas (RN-009, ADR-002)
  // --------------------------------------------------------------------------
  const consultaEstagiario = await clientes.consultarCliente(token(escritorioA.estagiario.contexto), cliente1A.id);
  assert.equal(consultaEstagiario.observacoesInternas, null, 'Estagiário não visualiza observações confidenciais');

  const consultaDono = await clientes.consultarCliente(token(escritorioA.dono.contexto), cliente1A.id);
  assert.equal(consultaDono.observacoesInternas, 'Observações confidenciais do cliente 1');

  console.info(JSON.stringify({ verificacao: 'gestao_clientes', resultado: 'ok', escritórios: 2 }));
} finally {
  try {
    if (escritoriosCriados.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.clientTimelineEvent.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.clientContact.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.client.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.session.deleteMany({ where: { activeOfficeId: { in: escritoriosCriados } } });
        await tx.membership.deleteMany({ where: { officeId: { in: escritoriosCriados } } });
        await tx.user.deleteMany({ where: { id: { in: usuariosCriados } } });
        await tx.office.deleteMany({ where: { id: { in: escritoriosCriados } } });
      });

      // Validação de resíduo zero
      const eventosRestantes = await prisma.clientTimelineEvent.count({ where: { officeId: { in: escritoriosCriados } } });
      const contatosRestantes = await prisma.clientContact.count({ where: { officeId: { in: escritoriosCriados } } });
      const clientesRestantes = await prisma.client.count({ where: { officeId: { in: escritoriosCriados } } });
      const escritoriosRestantes = await prisma.office.count({ where: { id: { in: escritoriosCriados } } });
      const usuariosRestantes = await prisma.user.count({ where: { id: { in: usuariosCriados } } });

      assert.equal(eventosRestantes, 0);
      assert.equal(contatosRestantes, 0);
      assert.equal(clientesRestantes, 0);
      assert.equal(escritoriosRestantes, 0);
      assert.equal(usuariosRestantes, 0);
    }
  } catch (erroLimpeza) {
    console.error('Falha na limpeza dos dados de verificação de clientes:', erroLimpeza);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
