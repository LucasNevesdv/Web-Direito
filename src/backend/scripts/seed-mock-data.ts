// Script de Mock / Seed de Dados para Desenvolvimento (Web-Direito)
// Popula de forma não-destrutiva o escritório ativo com Clientes, Casos, Processos, Prazos e Tarefas.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  PrismaClient,
  ClientType,
  ClientStatus,
  CaseNature,
  CasePriority,
  CaseStatus,
  ProcessInstance,
  TaskStatus,
  TaskPriority,
  DeadlineStatus,
  DeadlineSource,
  NotificationKind,
  NotificationEmailStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

function calcularDigitoVerificadorCnj(seq: number, ano: number, j: number, tr: number, o: number): string {
  const s = String(seq).padStart(7, '0');
  const a = String(ano).padStart(4, '0');
  const seg = String(j).slice(0, 1);
  const tribunal = String(tr).padStart(2, '0');
  const origem = String(o).padStart(4, '0');
  const bloco = `${s}${a}${seg}${tribunal}${origem}00`;
  const resto = BigInt(bloco) % 97n;
  const dd = (98n - resto).toString().padStart(2, '0');
  return `${s}${dd}${a}${seg}${tribunal}${origem}`;
}

async function main() {
  console.log('🌱 Iniciando injeção de Mocks de Desenvolvimento...');

  // 1. Identificar escritório e membros
  const escritorio = await prisma.office.findFirst({
    where: { status: 'ACTIVE' },
    include: {
      memberships: {
        include: { user: true },
      },
    },
  });

  if (!escritorio) {
    console.error('❌ Nenhum escritório ativo encontrado no banco. Crie um escritório antes de rodar o seed.');
    throw new Error('Nenhum escritório ativo encontrado no banco.');
  }

  console.log(`🏢 Escritório Selecionado: "${escritorio.name}" (${escritorio.id})`);

  const membroProprietario = escritorio.memberships.find((m) => m.role === 'OWNER') ?? escritorio.memberships[0];
  if (!membroProprietario) {
    console.error('❌ Nenhum membro encontrado no escritório.');
    throw new Error('Nenhum membro encontrado no escritório.');
  }

  const membroAdvogado =
    escritorio.memberships.find((m) => m.role === 'LAWYER' && m.user.name.includes('Cocada')) ??
    escritorio.memberships.find((m) => m.role === 'LAWYER') ??
    membroProprietario;

  console.log(`👤 Proprietário: ${membroProprietario.user.name} (${membroProprietario.id})`);
  console.log(`⚖️ Advogado Responsável: ${membroAdvogado.user.name} (${membroAdvogado.id})`);

  const agora = new Date();

  // 2. Clientes Mocks
  const clientesParaCriar = [
    {
      tipo: ClientType.INDIVIDUAL,
      nome: 'Dona Paçoca Caseira de Amendoim',
      nomeSocial: 'Dona Paçoca',
      documento: '01234567890',
      email: 'pacoca@confeitaria.com.br',
      telefone: '(11) 98765-1111',
      cep: '14000000',
      logradouro: 'Rua do Doce de Leite',
      numero: '123',
      complemento: 'Casa dos Doces',
      bairro: 'Farofa Doce',
      cidade: 'Ribeirão Preto',
      uf: 'SP',
      observacoes: 'Cliente fiel com histórico de alergia severa a queijo prato e processos de cobrança rápida.',
      idVinculoResponsavel: membroAdvogado.id,
    },
    {
      tipo: ClientType.INDIVIDUAL,
      nome: 'Capitão Pipoca Manteiga Salgada',
      nomeSocial: 'Capitão Pipoca',
      documento: '98765432100',
      email: 'pipoca@manteiga.com.br',
      telefone: '(21) 99887-2222',
      cep: '20000000',
      logradouro: 'Avenida Beira Milho',
      numero: '500',
      complemento: 'Bloco B, Apto 101',
      bairro: 'Pipocando',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
      observacoes: 'Vítima de explosão sonora de pipoqueira em sala de cinema com som surround.',
      idVinculoResponsavel: membroAdvogado.id,
    },
    {
      tipo: ClientType.INDIVIDUAL,
      nome: 'Barão do Quindim Imperial',
      nomeSocial: 'Barão Quindim',
      documento: '11122233396',
      email: 'quindim@imperial.com.br',
      telefone: '(53) 99111-3333',
      cep: '96000000',
      logradouro: 'Alameda das Gemas Moles',
      numero: '1888',
      complemento: 'Solar dos Doces',
      bairro: 'Centro Histórico',
      cidade: 'Pelotas',
      uf: 'RS',
      observacoes: 'Tradicional confeiteiro da corte com litígios sucessórios de receitas centenárias.',
      idVinculoResponsavel: membroProprietario.id,
    },
    {
      tipo: ClientType.LEGAL_ENTITY,
      nome: 'Pastelaria Vento, Queijo & Mistério Ltda',
      nomeSocial: 'Pastel de Vento 100% Puro',
      documento: '12345678000195',
      email: 'contato@pasteldevento.com.br',
      telefone: '(11) 3200-4444',
      cep: '01500000',
      logradouro: 'Rua das Frigideiras Fumegantes',
      numero: '42',
      complemento: 'Galpão 1',
      bairro: 'Liberdade',
      cidade: 'São Paulo',
      uf: 'SP',
      observacoes: 'Empresa do setor alimentício especializada em frituras rápidas e recheio de ar comprimido.',
      idVinculoResponsavel: membroAdvogado.id,
    },
    {
      tipo: ClientType.LEGAL_ENTITY,
      nome: 'Sorveteria Caloria Congelada ME',
      nomeSocial: 'Picolé de Banha',
      documento: '98765432000198',
      email: 'sac@caloriacongelada.com.br',
      telefone: '(54) 3286-5555',
      cep: '95670000',
      logradouro: 'Rua do Gelo Seco',
      numero: '77',
      complemento: 'Loja 2',
      bairro: 'Polo Norte',
      cidade: 'Gramado',
      uf: 'RS',
      observacoes: 'Fabricante de sobremesas geladas ultracalóricas com 0% água e 100% gordura vegetal.',
      idVinculoResponsavel: membroProprietario.id,
    },
    {
      tipo: ClientType.LEGAL_ENTITY,
      nome: 'Distribuidora de Açúcar Mascavo & Torcicolo S/A',
      nomeSocial: 'Açúcar Explosivo',
      documento: '45678901000175',
      email: 'juridico@acucarmascavo.com.br',
      telefone: '(81) 3456-6666',
      cep: '50000000',
      logradouro: 'Estrada do Canavial Doce',
      numero: '1000',
      complemento: 'Engenho Velho',
      bairro: 'Zona Rural',
      cidade: 'Recife',
      uf: 'PE',
      observacoes: 'Fornecedora atacadista de sacarose concentrada para padarias e docerias industriais.',
      idVinculoResponsavel: membroProprietario.id,
    },
  ];

  const mapaClientes = new Map<string, string>(); // documento -> id

  for (const c of clientesParaCriar) {
    let cliente = await prisma.client.findFirst({
      where: { officeId: escritorio.id, documentNumber: c.documento },
    });

    if (!cliente) {
      cliente = await prisma.client.create({
        data: {
          id: randomUUID(),
          officeId: escritorio.id,
          type: c.tipo,
          name: c.nome,
          socialName: c.nomeSocial,
          documentNumber: c.documento,
          email: c.email,
          phone: c.telefone,
          addressZipCode: c.cep,
          addressStreet: c.logradouro,
          addressNumber: c.numero,
          addressComplement: c.complemento,
          addressNeighborhood: c.bairro,
          addressCity: c.cidade,
          addressState: c.uf,
          internalNotes: c.observacoes,
          responsibleMembershipId: c.idVinculoResponsavel,
          status: ClientStatus.ACTIVE,
          createdAt: agora,
          updatedAt: agora,
        },
      });

      // Linha do tempo do cliente
      await prisma.clientTimelineEvent.create({
        data: {
          id: randomUUID(),
          officeId: escritorio.id,
          clientId: cliente.id,
          actorId: membroProprietario.userId,
          action: 'CLIENTE_CRIADO',
          current: { nome: c.nome, documento: c.documento },
          createdAt: agora,
        },
      });
      console.log(`  + Cliente cadastrado: ${c.nome} (${c.documento})`);
    } else {
      console.log(`  ✓ Cliente já existia: ${c.nome}`);
    }
    mapaClientes.set(c.documento, cliente.id);
  }

  // 3. Casos Mocks
  const cnj1 = calcularDigitoVerificadorCnj(2345, 2024, 8, 26, 100); // 00023459020248260100
  const cnj2 = calcularDigitoVerificadorCnj(3456, 2024, 5, 2, 1);    // 00034563620245020001
  const cnj3 = calcularDigitoVerificadorCnj(4567, 2024, 8, 21, 22);  // 00045671220248210022

  const casosParaCriar = [
    {
      titulo: 'Ação de Reparação por Explosão de Pipoca Doce em Cinema 4D',
      descricao:
        'Ação cominatória cumulada com danos morais e materiais por estouro em cadeia de milho transgênico açucarado durante a estreia de filme de ação, causando perfuração de tímpano e chuva de caramelo a 200°C sobre o autor.',
      natureza: CaseNature.JUDICIAL,
      areaJuridica: 'CIVEL',
      prioridade: CasePriority.HIGH,
      situacao: CaseStatus.ACTIVE,
      idResponsavel: membroAdvogado.id,
      valorCausa: 15000000n, // R$ 150.000,00
      valorEnvolvido: 20000000n,
      docCliente: '98765432100', // Capitão Pipoca
      parteContraria: {
        nome: 'Cineplex Som Estourado & Caramelo Quente S/A',
        doc: '03490528000184',
        papel: 'PARTE_CONTRARIA',
        obs: 'Alega que o milho de pipoca tinha certificação aeroespacial e que a culpa foi da umidade do ar.',
      },
      processo: {
        cnj: cnj1,
        tribunal: 'TJSP',
        comarca: 'São Paulo - Foro Central Cível',
        vara: '12ª Vara Cível',
        instancia: ProcessInstance.FIRST_INSTANCE,
        fase: 'CONHECIMENTO',
        movimentacoes: [
          'Despacho saneador determinando perícia técnica no milho transgênico e na pipoqueira do cinema.',
          'Juntada de laudo pericial atestando decibéis de detonação equivalentes a decolagem de caça supersônico.',
        ],
      },
    },
    {
      titulo: 'Reclamação Trabalhista por Adicional de Periculosidade em Fritadeira Quádrupla',
      descricao:
        'Reclamante exercia a função de mestre pasteleiro operando 4 tachos de gordura hidrogenada simultâneos a 220°C sem fornecimento de óculos protetores ou escudo térmico balístico.',
      natureza: CaseNature.JUDICIAL,
      areaJuridica: 'TRABALHISTA',
      prioridade: CasePriority.URGENT,
      situacao: CaseStatus.ACTIVE,
      idResponsavel: membroAdvogado.id,
      valorCausa: 8500000n, // R$ 85.000,00
      valorEnvolvido: 12000000n,
      docCliente: '01234567890', // Dona Paçoca
      parteContraria: {
        nome: 'Pastelaria Vento, Queijo & Mistério Ltda',
        doc: '12345678000195',
        papel: 'PARTE_CONTRARIA',
        obs: 'Alega que o calor excessivo é benéfico para a circulação e forneceu óleo de qualidade superior.',
      },
      processo: {
        cnj: cnj2,
        tribunal: 'TRT-2',
        comarca: 'São Paulo - Fórum Ruy Barbosa',
        vara: '3ª Vara do Trabalho',
        instancia: ProcessInstance.FIRST_INSTANCE,
        fase: 'CONHECIMENTO',
        movimentacoes: [
          'Audiência Una realizada. Proposta de conciliação com pagamento em pasteis de vento recusada.',
          'Apresentada contestação tempestiva pela reclamada.',
        ],
      },
    },
    {
      titulo: 'Notificação Extrajudicial por Venda de Pastel com 99% de Oxigênio Envasado',
      descricao:
        'Procedimento pré-litigioso instaurado perante a Câmara de Mediação Alimentícia pleiteando indenização por engano ao consumidor na compra de 1.000 unidades de salgados com ausência de recheio sólido.',
      natureza: CaseNature.EXTRAJUDICIAL,
      areaJuridica: 'CONSUMIDOR',
      prioridade: CasePriority.MEDIUM,
      situacao: CaseStatus.ACTIVE,
      idResponsavel: membroProprietario.id,
      valorCausa: 2500000n, // R$ 25.000,00
      valorEnvolvido: 3500000n,
      docCliente: '98765432000198', // Sorveteria Caloria Congelada
      parteContraria: {
        nome: 'Pastelaria Vento, Queijo & Mistério Ltda',
        doc: '12345678000195',
        papel: 'PARTE_CONTRARIA',
        obs: 'Notificada extrajudicialmente por carta registrada com aviso de recebimento.',
      },
      processo: null,
    },
    {
      titulo: 'Dissolução Parcial de Sociedade Culinária e Partilha de Receitas Secretas',
      descricao:
        'Ação de dissolução contenciosa de sociedade com disputa pela patente do Quindim sem cheiro de ovo e do Açúcar Mascavo instantâneo.',
      natureza: CaseNature.JUDICIAL,
      areaJuridica: 'EMPRESARIAL',
      prioridade: CasePriority.LOW,
      situacao: CaseStatus.ARCHIVED,
      idResponsavel: membroProprietario.id,
      valorCausa: 50000000n, // R$ 500.000,00
      valorEnvolvido: 100000000n,
      docCliente: '11122233396', // Barão do Quindim
      parteContraria: {
        nome: 'Confraria dos Doces de Tacho Tradicionais',
        doc: '45678901000175',
        papel: 'PARTE_CONTRARIA',
        obs: 'Acordo firmado em audiência arbitral com divisão meio a meio das colheres de pau históricas.',
      },
      processo: {
        cnj: cnj3,
        tribunal: 'TJRS',
        comarca: 'Pelotas - Foro Central',
        vara: '1ª Vara Cível Especializada',
        instancia: ProcessInstance.FIRST_INSTANCE,
        fase: 'ARQUIVADO',
        movimentacoes: [
          'Sentença homologatória de acordo entre os herdeiros gastronômicos transitada em julgado.',
          'Baixa definitiva e arquivamento dos autos ordenados pelo juízo.',
        ],
      },
    },
  ];

  for (const c of casosParaCriar) {
    let caso = await prisma.legalCase.findFirst({
      where: { officeId: escritorio.id, title: c.titulo },
    });

    const idCliente = mapaClientes.get(c.docCliente);

    if (!caso) {
      caso = await prisma.legalCase.create({
        data: {
          id: randomUUID(),
          officeId: escritorio.id,
          title: c.titulo,
          description: c.descricao,
          nature: c.natureza,
          legalArea: c.areaJuridica,
          priority: c.prioridade,
          status: c.situacao,
          responsibleMembershipId: c.idResponsavel,
          claimAmountCents: c.valorCausa,
          involvedAmountCents: c.valorEnvolvido,
          lastActivityAt: agora,
          createdAt: agora,
          updatedAt: agora,
        },
      });

      // Vincular cliente
      if (idCliente) {
        await prisma.caseClient.create({
          data: {
            officeId: escritorio.id,
            caseId: caso.id,
            clientId: idCliente,
            createdAt: agora,
          },
        });
      }

      // Adicionar parte contrária
      await prisma.caseParty.create({
        data: {
          id: randomUUID(),
          officeId: escritorio.id,
          caseId: caso.id,
          partyRole: c.parteContraria.papel,
          name: c.parteContraria.nome,
          documentNumber: c.parteContraria.doc,
          notes: c.parteContraria.obs,
          createdAt: agora,
          updatedAt: agora,
        },
      });

      // Timeline do caso
      await prisma.caseTimelineEvent.create({
        data: {
          id: randomUUID(),
          officeId: escritorio.id,
          caseId: caso.id,
          actorId: membroProprietario.userId,
          action: 'CASO_CRIADO',
          current: { titulo: c.titulo, natureza: c.natureza },
          createdAt: agora,
        },
      });

      // Se tiver processo judicial, criar
      if (c.processo) {
        const proc = await prisma.legalProcess.create({
          data: {
            id: randomUUID(),
            officeId: escritorio.id,
            caseId: caso.id,
            cnjNumber: c.processo.cnj,
            court: c.processo.tribunal,
            district: c.processo.comarca,
            chamber: c.processo.vara,
            instance: c.processo.instancia,
            proceduralPhase: c.processo.fase,
            createdAt: agora,
            updatedAt: agora,
          },
        });

        // Movimentações
        for (let i = 0; i < c.processo.movimentacoes.length; i++) {
          const movDesc = c.processo.movimentacoes[i]!;
          const dataMov = new Date(Date.now() - (c.processo.movimentacoes.length - i) * 86400000);
          await prisma.processMovement.create({
            data: {
              id: randomUUID(),
              officeId: escritorio.id,
              caseId: caso.id,
              processId: proc.id,
              actorId: membroAdvogado.userId,
              occurredAt: dataMov,
              description: movDesc,
              createdAt: dataMov,
            },
          });
        }
      }

      console.log(`  + Caso cadastrado: "${c.titulo}" [${c.areaJuridica}]`);
    } else {
      console.log(`  ✓ Caso já existia: "${c.titulo}"`);
    }
  }

  // 4. Prazos Judiciais e Notificações (para alimentar /painel e /prazos)
  const prazosParaCriar = [
    {
      descricao: 'Manifestar sobre laudo pericial de espessura da casquinha de pastel',
      dias: 0, // Hoje!
      status: DeadlineStatus.PENDING,
      tipoNotif: NotificationKind.DEADLINE_CRITICAL,
      idResponsavel: membroAdvogado.userId,
    },
    {
      descricao: 'Interpor Agravo de Instrumento contra decisão que negou liminar nas fritadeiras',
      dias: -2, // Vencido há 2 dias!
      status: DeadlineStatus.PENDING,
      tipoNotif: NotificationKind.DEADLINE_OVERDUE,
      idResponsavel: membroAdvogado.userId,
    },
    {
      descricao: 'Juntar comprovante de depósito judicial de 500 caixas de paçoca',
      dias: 5, // Daqui a 5 dias
      status: DeadlineStatus.PENDING,
      tipoNotif: null,
      idResponsavel: membroProprietario.userId,
    },
  ];

  for (const p of prazosParaCriar) {
    const dataLimite = new Date(Date.now() + p.dias * 86400000);
    const dataLimiteDia = new Date(dataLimite.toISOString().slice(0, 10));

    let prazo = await prisma.judicialDeadline.findFirst({
      where: { officeId: escritorio.id, description: p.descricao },
    });

    if (!prazo) {
      prazo = await prisma.judicialDeadline.create({
        data: {
          id: randomUUID(),
          officeId: escritorio.id,
          description: p.descricao,
          dueDate: dataLimiteDia,
          source: DeadlineSource.INTIMATION,
          sourceDetails: 'DJEN - Publicação Oficial',
          status: p.status,
          responsibleId: p.idResponsavel,
          confirmedById: membroProprietario.userId,
          confirmedAt: agora,
          createdAt: agora,
          updatedAt: agora,
        },
      });

      if (p.tipoNotif) {
        await prisma.notification.create({
          data: {
            id: randomUUID(),
            officeId: escritorio.id,
            userId: p.idResponsavel,
            kind: p.tipoNotif,
            deadlineId: prazo.id,
            targetId: prazo.id,
            referenceDate: dataLimiteDia,
            title: p.descricao,
            dueDate: dataLimiteDia,
            emailStatus: NotificationEmailStatus.SENT,
            nextAttemptAt: agora,
            createdAt: agora,
          },
        });
      }

      console.log(`  + Prazo criado: "${p.descricao}" (Data: ${dataLimiteDia.toISOString().slice(0, 10)})`);
    } else {
      console.log(`  ✓ Prazo já existia: "${p.descricao}"`);
    }
  }

  // 5. Tarefas (para alimentar /painel e /tarefas)
  const tarefasParaCriar = [
    {
      titulo: 'Revisar petição inicial de danos morais por queimação estomacal',
      descricao: 'Conferir os comprovantes médicos de azia e pedidos de metformina.',
      status: TaskStatus.PENDING,
      prioridade: TaskPriority.HIGH,
      dias: 0, // Hoje
      idResponsavel: membroAdvogado.userId,
    },
    {
      titulo: 'Ligar para Dona Paçoca e solicitar notas fiscais do lote de amendoim',
      descricao: 'Verificar se o fornecedor emitiu nota com descrição detalhada de pureza.',
      status: TaskStatus.PENDING,
      prioridade: TaskPriority.URGENT,
      dias: -3, // Atrasada!
      idResponsavel: membroAdvogado.userId,
    },
    {
      titulo: 'Preparar quesitos para perícia no óleo de soja e teste balístico de gotículas',
      descricao: 'Elaborar 10 quesitos pontuais para a perícia química das frigideiras.',
      status: TaskStatus.IN_PROGRESS,
      prioridade: TaskPriority.MEDIUM,
      dias: 7, // Futura
      idResponsavel: membroProprietario.userId,
    },
    {
      titulo: 'Instalar extintores de incêndio à base de pó de canela no arquivo do escritório',
      descricao: 'Adequação predial às normas de segurança contra combustão açucarada.',
      status: TaskStatus.DONE,
      prioridade: TaskPriority.LOW,
      dias: -10, // Concluída no passado
      idResponsavel: membroProprietario.userId,
    },
  ];

  for (const t of tarefasParaCriar) {
    const dataLimite = new Date(Date.now() + t.dias * 86400000);
    const dataLimiteDia = new Date(dataLimite.toISOString().slice(0, 10));

    let tarefa = await prisma.task.findFirst({
      where: { officeId: escritorio.id, title: t.titulo },
    });

    if (!tarefa) {
      tarefa = await prisma.task.create({
        data: {
          id: randomUUID(),
          officeId: escritorio.id,
          title: t.titulo,
          description: t.descricao,
          status: t.status,
          priority: t.prioridade,
          responsibleId: t.idResponsavel,
          creatorId: membroProprietario.userId,
          internalDueDate: dataLimiteDia,
          completedAt: t.status === TaskStatus.DONE ? agora : null,
          completedById: t.status === TaskStatus.DONE ? membroProprietario.userId : null,
          completionNote: t.status === TaskStatus.DONE ? 'Extintores devidamente testados com canela em pó.' : null,
          createdAt: agora,
          updatedAt: agora,
        },
      });

      console.log(`  + Tarefa criada: "${t.titulo}" [${t.status}]`);
    } else {
      console.log(`  ✓ Tarefa já existia: "${t.titulo}"`);
    }
  }

  console.log('\n✨ Seed de desenvolvimento concluído com sucesso total!');
  console.log('🎉 O banco de dados agora possui Clientes, Casos, Processos com CNJ, Prazos Críticos e Tarefas operacionais prontos para testes visuais!');
}

main()
  .catch((e) => {
    console.error('❌ Erro ao executar seed:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
