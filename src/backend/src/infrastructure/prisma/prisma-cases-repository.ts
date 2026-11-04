import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { DadosTokenAcesso } from '../../application/authentication/authentication-contracts.js';
import {
  ErroTokenAcessoInvalido,
  ErroPrimeiroAcessoObrigatorio,
} from '../../application/authentication/authentication-errors.js';
import { validarContextoDoEscritorio } from '../../application/authentication/office-context.js';
import { registrarAtividadeDaSessao } from './session-activity.js';
import { PAPEIS_DOMINIO } from './team-mapper.js';
import type {
  CasoDetalheDto,
  CasoResumoDto,
  EventoLinhaTempoCasoDto,
  FiltroCasos,
  OperacoesCasosProcessos,
  ParteEnvolvidaDto,
  RepositorioCasosProcessos,
} from '../../application/cases/case-contracts.js';
import { ErroCasoProcesso, PERMISSOES_CASO, type AutorCaso, type PermissaoCaso } from '../../application/cases/case-policy.js';
import type { Caso } from '../../domain/cases/legal-case.js';
import type { ParteEnvolvidaCaso } from '../../domain/cases/case-party.js';
import {
  converterRegistroPrismaEmCasoDetalhe,
  converterRegistroPrismaEmCasoResumo,
  converterRegistroPrismaEmEventoLinhaTempoCaso,
  converterRegistroPrismaEmParteEnvolvida,
  NATUREZAS_CASO_PRISMA,
  PRIORIDADES_CASO_PRISMA,
  SITUACOES_CASO_PRISMA,
} from './case-mapper.js';

export class RepositorioCasosPrisma implements RepositorioCasosProcessos {
  constructor(private readonly prisma: PrismaClient) {}

  async executar<T>(
    contexto: DadosTokenAcesso,
    operacao: (casos: OperacoesCasosProcessos) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (transacao) => {
          validarContextoDoEscritorio(contexto);
          await transacao.$executeRaw`SET LOCAL statement_timeout = '5s'`;

          const sessao = await transacao.session.findFirst({
            where: {
              id: contexto.idSessao,
              userId: contexto.idUsuario,
              activeOfficeId: contexto.idEscritorioAtivo,
              revokedAt: null,
              expiresAt: { gt: new Date() },
              user: { status: 'ACTIVE' },
              office: { status: 'ACTIVE' },
              membership: { active: true },
            },
            include: {
              user: true,
              membership: { include: { user: true } },
            },
          });

          if (!sessao) throw new ErroTokenAcessoInvalido();
          if (sessao.restricted || sessao.user.mustChangePassword) {
            throw new ErroPrimeiroAcessoObrigatorio();
          }

          await registrarAtividadeDaSessao(transacao, sessao);

          const papel = PAPEIS_DOMINIO[sessao.membership.role];
          const autor: AutorCaso = {
            idUsuario: sessao.userId,
            idEscritorio: sessao.activeOfficeId,
            papel,
            permissoes:
              papel === 'PROPRIETARIO'
                ? [...PERMISSOES_CASO]
                : (sessao.membership.permissions as PermissaoCaso[]),
          };

          const operacoes: OperacoesCasosProcessos = {
            autor,

            listarCasos: async (filtro: FiltroCasos): Promise<{ casos: CasoResumoDto[]; total: number }> => {
              const condicoes: Prisma.LegalCaseWhereInput[] = [
                { officeId: contexto.idEscritorioAtivo },
              ];

              if (filtro.situacao) {
                condicoes.push({ status: SITUACOES_CASO_PRISMA[filtro.situacao] });
              }

              if (filtro.natureza) {
                condicoes.push({ nature: NATUREZAS_CASO_PRISMA[filtro.natureza] });
              }

              if (filtro.prioridade) {
                condicoes.push({ priority: PRIORIDADES_CASO_PRISMA[filtro.prioridade] });
              }

              if (filtro.areaJuridica && filtro.areaJuridica.trim().length > 0) {
                condicoes.push({ legalArea: { equals: filtro.areaJuridica.trim(), mode: 'insensitive' } });
              }

              if (filtro.idVinculoResponsavel) {
                condicoes.push({ responsibleMembershipId: filtro.idVinculoResponsavel });
              }

              if (filtro.idCliente) {
                condicoes.push({ clients: { some: { clientId: filtro.idCliente } } });
              }

              if (filtro.numeroCnj && filtro.numeroCnj.trim().length > 0) {
                const digitosCnj = filtro.numeroCnj.replace(/\D/g, '');
                condicoes.push({
                  processes: {
                    some: {
                      cnjNumber: { contains: digitosCnj.length > 0 ? digitosCnj : filtro.numeroCnj.trim() },
                    },
                  },
                });
              }

              if (filtro.semResponsavel === true) {
                condicoes.push({ status: 'ACTIVE', responsibleMembershipId: null });
              }

              if (filtro.semAtividadeDesdeDias && filtro.semAtividadeDesdeDias > 0) {
                const dataLimite = new Date(Date.now() - filtro.semAtividadeDesdeDias * 24 * 60 * 60 * 1000);
                condicoes.push({ status: 'ACTIVE', lastActivityAt: { lte: dataLimite } });
              }

              if (filtro.pesquisa && filtro.pesquisa.trim().length > 0) {
                const termo = filtro.pesquisa.trim();
                const termoDigitos = termo.replace(/\D/g, '');
                const orConditions: Prisma.LegalCaseWhereInput[] = [
                  { title: { contains: termo, mode: 'insensitive' } },
                  { description: { contains: termo, mode: 'insensitive' } },
                  {
                    clients: {
                      some: {
                        client: {
                          OR: [
                            { name: { contains: termo, mode: 'insensitive' } },
                            { socialName: { contains: termo, mode: 'insensitive' } },
                            ...(termoDigitos.length > 0 ? [{ documentNumber: { contains: termoDigitos } }] : []),
                          ],
                        },
                      },
                    },
                  },
                ];
                if (termoDigitos.length > 0) {
                  orConditions.push({ processes: { some: { cnjNumber: { contains: termoDigitos } } } });
                }
                condicoes.push({ OR: orConditions });
              }

              const where: Prisma.LegalCaseWhereInput = { AND: condicoes };

              const [registros, total] = await Promise.all([
                transacao.legalCase.findMany({
                  where,
                  include: {
                    responsibleMembership: { include: { user: true } },
                    clients: {
                      include: {
                        client: {
                          select: { id: true, name: true, documentNumber: true, type: true },
                        },
                      },
                      orderBy: { createdAt: 'asc' },
                    },
                    _count: {
                      select: { processes: true },
                    },
                  },
                  orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
                  skip: (filtro.pagina - 1) * filtro.tamanhoPagina,
                  take: filtro.tamanhoPagina,
                }),
                transacao.legalCase.count({ where }),
              ]);

              return {
                casos: registros.map(converterRegistroPrismaEmCasoResumo),
                total,
              };
            },

            buscarCasoPorId: async (idCaso: string): Promise<CasoDetalheDto> => {
              const registro = await transacao.legalCase.findFirst({
                where: {
                  id: idCaso,
                  officeId: contexto.idEscritorioAtivo,
                },
                include: {
                  responsibleMembership: { include: { user: true } },
                  clients: {
                    include: {
                      client: {
                        select: { id: true, name: true, documentNumber: true, type: true },
                      },
                    },
                    orderBy: { createdAt: 'asc' },
                  },
                  teamMembers: {
                    include: {
                      membership: { include: { user: true } },
                    },
                    orderBy: { createdAt: 'asc' },
                  },
                  parties: {
                    orderBy: { createdAt: 'asc' },
                  },
                  processes: {
                    orderBy: { createdAt: 'asc' },
                  },
                  _count: {
                    select: { processes: true },
                  },
                },
              });

              if (!registro) {
                throw new ErroCasoProcesso('NAO_ENCONTRADO', 404);
              }

              return converterRegistroPrismaEmCasoDetalhe(registro);
            },

            validarClientesNoEscritorio: async (idsClientes: string[]) => {
              const encontrados = await transacao.client.findMany({
                where: {
                  id: { in: idsClientes },
                  officeId: contexto.idEscritorioAtivo,
                },
                select: {
                  id: true,
                  name: true,
                  documentNumber: true,
                  type: true,
                  status: true,
                },
              });
              return encontrados.map((c) => ({
                id: c.id,
                nome: c.name,
                documento: c.documentNumber,
                tipoPessoa: c.type,
                status: c.status,
              }));
            },

            validarVinculoEquipeNoEscritorio: async (idVinculo: string) => {
              const membro = await transacao.membership.findFirst({
                where: {
                  id: idVinculo,
                  officeId: contexto.idEscritorioAtivo,
                },
                include: { user: true },
              });
              if (!membro) {
                return null;
              }
              return {
                id: membro.id,
                idUsuario: membro.userId,
                nome: membro.user.name,
                papel: PAPEIS_DOMINIO[membro.role],
                ativo: membro.active,
              };
            },

            criarCaso: async (caso: Caso, partesIniciais: ParteEnvolvidaCaso[]): Promise<CasoDetalheDto> => {
              await transacao.legalCase.create({
                data: {
                  id: caso.id,
                  officeId: caso.idEscritorio,
                  title: caso.titulo,
                  description: caso.descricao,
                  nature: NATUREZAS_CASO_PRISMA[caso.natureza],
                  legalArea: caso.areaJuridica,
                  priority: PRIORIDADES_CASO_PRISMA[caso.prioridade],
                  status: SITUACOES_CASO_PRISMA[caso.situacao],
                  responsibleMembershipId: caso.idVinculoResponsavel,
                  claimAmountCents: caso.valorCausaCentavos !== null ? BigInt(caso.valorCausaCentavos) : null,
                  involvedAmountCents: caso.valorEnvolvidoCentavos !== null ? BigInt(caso.valorEnvolvidoCentavos) : null,
                  lastActivityAt: caso.ultimaAtividadeEm,
                  version: caso.versao,
                  createdAt: caso.criadoEm,
                  updatedAt: caso.atualizadoEm,
                },
              });

              if (caso.idsClientes.length > 0) {
                await transacao.caseClient.createMany({
                  data: caso.idsClientes.map((clientId) => ({
                    officeId: caso.idEscritorio,
                    caseId: caso.id,
                    clientId,
                    createdAt: caso.criadoEm,
                  })),
                });
              }

              if (caso.idsVinculosEquipe.length > 0) {
                await transacao.caseTeamMember.createMany({
                  data: caso.idsVinculosEquipe.map((membershipId) => ({
                    officeId: caso.idEscritorio,
                    caseId: caso.id,
                    membershipId,
                    createdAt: caso.criadoEm,
                  })),
                });
              }

              if (partesIniciais.length > 0) {
                await transacao.caseParty.createMany({
                  data: partesIniciais.map((p) => ({
                    id: p.id,
                    officeId: p.idEscritorio,
                    caseId: p.idCaso,
                    partyRole: p.tipoParticipacao,
                    name: p.nome,
                    documentNumber: p.documento,
                    oab: p.oab,
                    contactInfo: p.contato,
                    notes: p.observacao,
                    createdAt: p.criadoEm,
                    updatedAt: p.atualizadoEm,
                  })),
                });
              }

              // Registrar CASO_CRIADO na linha do tempo do caso
              await transacao.caseTimelineEvent.create({
                data: {
                  id: randomUUID(),
                  officeId: caso.idEscritorio,
                  caseId: caso.id,
                  processId: null,
                  actorId: contexto.idUsuario,
                  action: 'CASO_CRIADO',
                  previous: Prisma.DbNull,
                  current: {
                    titulo: caso.titulo,
                    natureza: caso.natureza,
                    areaJuridica: caso.areaJuridica,
                    prioridade: caso.prioridade,
                    situacao: caso.situacao,
                    idsClientes: caso.idsClientes,
                    idVinculoResponsavel: caso.idVinculoResponsavel,
                    valorCausaCentavos: caso.valorCausaCentavos,
                    valorEnvolvidoCentavos: caso.valorEnvolvidoCentavos,
                  },
                  createdAt: caso.criadoEm,
                },
              });

              // Sincronizar atomicamente com a linha do tempo dos clientes vinculados (RF-026 / RF-032)
              for (const clientId of caso.idsClientes) {
                await transacao.clientTimelineEvent.create({
                  data: {
                    id: randomUUID(),
                    officeId: caso.idEscritorio,
                    clientId,
                    actorId: contexto.idUsuario,
                    action: 'CASO_VINCULADO',
                    previous: Prisma.DbNull,
                    current: {
                      idCaso: caso.id,
                      tituloCaso: caso.titulo,
                    },
                    createdAt: caso.criadoEm,
                  },
                });
              }

              return operacoes.buscarCasoPorId(caso.id);
            },

            atualizarCaso: async (
              anterior: CasoDetalheDto,
              atualizado: Caso,
              evento?: { acao: string; anterior?: Record<string, unknown> | null; atual: Record<string, unknown> },
            ): Promise<CasoDetalheDto> => {
              const res = await transacao.legalCase.updateMany({
                where: {
                  id: atualizado.id,
                  officeId: contexto.idEscritorioAtivo,
                  version: anterior.versao,
                },
                data: {
                  title: atualizado.titulo,
                  description: atualizado.descricao,
                  nature: NATUREZAS_CASO_PRISMA[atualizado.natureza],
                  legalArea: atualizado.areaJuridica,
                  priority: PRIORIDADES_CASO_PRISMA[atualizado.prioridade],
                  status: SITUACOES_CASO_PRISMA[atualizado.situacao],
                  responsibleMembershipId: atualizado.idVinculoResponsavel,
                  claimAmountCents: atualizado.valorCausaCentavos !== null ? BigInt(atualizado.valorCausaCentavos) : null,
                  involvedAmountCents: atualizado.valorEnvolvidoCentavos !== null ? BigInt(atualizado.valorEnvolvidoCentavos) : null,
                  version: atualizado.versao,
                  lastActivityAt: atualizado.ultimaAtividadeEm,
                  updatedAt: atualizado.atualizadoEm,
                },
              });

              if (res.count === 0) {
                throw new ErroCasoProcesso('CONFLITO', 409);
              }

              // Sincronizar clientes
              const idsClientesAnteriores = new Set(anterior.clientes.map((c) => c.id));
              const idsClientesNovos = new Set(atualizado.idsClientes);

              const clientesAdicionados = atualizado.idsClientes.filter((id) => !idsClientesAnteriores.has(id));
              const clientesRemovidos = anterior.clientes.map((c) => c.id).filter((id) => !idsClientesNovos.has(id));

              if (clientesAdicionados.length > 0) {
                await transacao.caseClient.createMany({
                  data: clientesAdicionados.map((clientId) => ({
                    officeId: atualizado.idEscritorio,
                    caseId: atualizado.id,
                    clientId,
                    createdAt: atualizado.atualizadoEm,
                  })),
                });
                for (const clientId of clientesAdicionados) {
                  await transacao.clientTimelineEvent.create({
                    data: {
                      id: randomUUID(),
                      officeId: atualizado.idEscritorio,
                      clientId,
                      actorId: contexto.idUsuario,
                      action: 'CASO_VINCULADO',
                      previous: Prisma.DbNull,
                      current: {
                        idCaso: atualizado.id,
                        tituloCaso: atualizado.titulo,
                      },
                      createdAt: atualizado.atualizadoEm,
                    },
                  });
                }
              }

              if (clientesRemovidos.length > 0) {
                await transacao.caseClient.deleteMany({
                  where: {
                    caseId: atualizado.id,
                    clientId: { in: clientesRemovidos },
                  },
                });
                for (const clientId of clientesRemovidos) {
                  await transacao.clientTimelineEvent.create({
                    data: {
                      id: randomUUID(),
                      officeId: atualizado.idEscritorio,
                      clientId,
                      actorId: contexto.idUsuario,
                      action: 'CASO_DESVINCULADO',
                      previous: Prisma.DbNull,
                      current: {
                        idCaso: atualizado.id,
                        tituloCaso: atualizado.titulo,
                      },
                      createdAt: atualizado.atualizadoEm,
                    },
                  });
                }
              }

              // Sincronizar equipe
              const idsEquipeAnteriores = new Set(anterior.equipe.map((m) => m.id));
              const idsEquipeNovos = new Set(atualizado.idsVinculosEquipe);

              const equipeAdicionada = atualizado.idsVinculosEquipe.filter((id) => !idsEquipeAnteriores.has(id));
              const equipeRemovida = anterior.equipe.map((m) => m.id).filter((id) => !idsEquipeNovos.has(id));

              if (equipeAdicionada.length > 0) {
                await transacao.caseTeamMember.createMany({
                  data: equipeAdicionada.map((membershipId) => ({
                    officeId: atualizado.idEscritorio,
                    caseId: atualizado.id,
                    membershipId,
                    createdAt: atualizado.atualizadoEm,
                  })),
                });
              }

              if (equipeRemovida.length > 0) {
                await transacao.caseTeamMember.deleteMany({
                  where: {
                    caseId: atualizado.id,
                    membershipId: { in: equipeRemovida },
                  },
                });
              }

              // Registrar evento na linha do tempo do caso
              await transacao.caseTimelineEvent.create({
                data: {
                  id: randomUUID(),
                  officeId: atualizado.idEscritorio,
                  caseId: atualizado.id,
                  processId: null,
                  actorId: contexto.idUsuario,
                  action: evento?.acao ?? 'CASO_ATUALIZADO',
                  previous: evento?.anterior ? (evento.anterior as Prisma.InputJsonValue) : Prisma.DbNull,
                  current: (evento?.atual ?? {}) as Prisma.InputJsonValue,
                  createdAt: atualizado.atualizadoEm,
                },
              });

              return operacoes.buscarCasoPorId(atualizado.id);
            },

            arquivarCaso: async (
              anterior: CasoDetalheDto,
              versao: number,
              motivo?: string,
            ): Promise<CasoDetalheDto> => {
              const agora = new Date();
              const res = await transacao.legalCase.updateMany({
                where: {
                  id: anterior.id,
                  officeId: contexto.idEscritorioAtivo,
                  version: versao,
                },
                data: {
                  status: 'ARCHIVED',
                  version: versao + 1,
                  lastActivityAt: agora,
                  updatedAt: agora,
                },
              });

              if (res.count === 0) {
                throw new ErroCasoProcesso('CONFLITO', 409);
              }

              await transacao.caseTimelineEvent.create({
                data: {
                  id: randomUUID(),
                  officeId: anterior.idEscritorio,
                  caseId: anterior.id,
                  processId: null,
                  actorId: contexto.idUsuario,
                  action: 'CASO_ARQUIVADO',
                  previous: { situacao: anterior.situacao },
                  current: {
                    situacao: 'ARQUIVADO',
                    motivo: motivo ?? null,
                  },
                  createdAt: agora,
                },
              });

              return operacoes.buscarCasoPorId(anterior.id);
            },

            reabrirCaso: async (
              anterior: CasoDetalheDto,
              versao: number,
              motivo?: string,
            ): Promise<CasoDetalheDto> => {
              const agora = new Date();
              const res = await transacao.legalCase.updateMany({
                where: {
                  id: anterior.id,
                  officeId: contexto.idEscritorioAtivo,
                  version: versao,
                },
                data: {
                  status: 'ACTIVE',
                  version: versao + 1,
                  lastActivityAt: agora,
                  updatedAt: agora,
                },
              });

              if (res.count === 0) {
                throw new ErroCasoProcesso('CONFLITO', 409);
              }

              await transacao.caseTimelineEvent.create({
                data: {
                  id: randomUUID(),
                  officeId: anterior.idEscritorio,
                  caseId: anterior.id,
                  processId: null,
                  actorId: contexto.idUsuario,
                  action: 'CASO_REABERTO',
                  previous: { situacao: anterior.situacao },
                  current: {
                    situacao: 'ATIVO',
                    motivo: motivo ?? null,
                  },
                  createdAt: agora,
                },
              });

              return operacoes.buscarCasoPorId(anterior.id);
            },

            adicionarParte: async (parte: ParteEnvolvidaCaso): Promise<ParteEnvolvidaDto> => {
              const agora = new Date();
              const registro = await transacao.caseParty.create({
                data: {
                  id: parte.id,
                  officeId: parte.idEscritorio,
                  caseId: parte.idCaso,
                  partyRole: parte.tipoParticipacao,
                  name: parte.nome,
                  documentNumber: parte.documento,
                  oab: parte.oab,
                  contactInfo: parte.contato,
                  notes: parte.observacao,
                  createdAt: parte.criadoEm,
                  updatedAt: parte.atualizadoEm,
                },
              });

              await transacao.legalCase.update({
                where: { id: parte.idCaso },
                data: { lastActivityAt: agora, updatedAt: agora },
              });

              await transacao.caseTimelineEvent.create({
                data: {
                  id: randomUUID(),
                  officeId: parte.idEscritorio,
                  caseId: parte.idCaso,
                  processId: null,
                  actorId: contexto.idUsuario,
                  action: 'PARTE_ADICIONADA',
                  previous: Prisma.DbNull,
                  current: {
                    id: parte.id,
                    nome: parte.nome,
                    tipoParticipacao: parte.tipoParticipacao,
                  },
                  createdAt: agora,
                },
              });

              return converterRegistroPrismaEmParteEnvolvida(registro);
            },

            atualizarParte: async (
              anterior: ParteEnvolvidaDto,
              atualizada: ParteEnvolvidaCaso,
            ): Promise<ParteEnvolvidaDto> => {
              const agora = new Date();
              const mutacao = await transacao.caseParty.updateMany({
                where: {
                  id: atualizada.id,
                  caseId: atualizada.idCaso,
                  officeId: contexto.idEscritorioAtivo,
                },
                data: {
                  partyRole: atualizada.tipoParticipacao,
                  name: atualizada.nome,
                  documentNumber: atualizada.documento,
                  oab: atualizada.oab,
                  contactInfo: atualizada.contato,
                  notes: atualizada.observacao,
                  updatedAt: atualizada.atualizadoEm,
                },
              });

              if (mutacao.count === 0) {
                throw new ErroCasoProcesso('NAO_ENCONTRADO', 404);
              }

              const registro = await transacao.caseParty.findUniqueOrThrow({
                where: { id: atualizada.id },
              });

              await transacao.legalCase.updateMany({
                where: { id: atualizada.idCaso, officeId: contexto.idEscritorioAtivo },
                data: { lastActivityAt: agora, updatedAt: agora },
              });

              await transacao.caseTimelineEvent.create({
                data: {
                  id: randomUUID(),
                  officeId: atualizada.idEscritorio,
                  caseId: atualizada.idCaso,
                  processId: null,
                  actorId: contexto.idUsuario,
                  action: 'PARTE_ATUALIZADA',
                  previous: {
                    nome: anterior.nome,
                    tipoParticipacao: anterior.tipoParticipacao,
                  },
                  current: {
                    nome: atualizada.nome,
                    tipoParticipacao: atualizada.tipoParticipacao,
                  },
                  createdAt: agora,
                },
              });

              return converterRegistroPrismaEmParteEnvolvida(registro);
            },

            removerParte: async (idCaso: string, idParte: string): Promise<void> => {
              const agora = new Date();
              await transacao.caseParty.deleteMany({
                where: {
                  id: idParte,
                  caseId: idCaso,
                  officeId: contexto.idEscritorioAtivo,
                },
              });

              await transacao.legalCase.updateMany({
                where: { id: idCaso, officeId: contexto.idEscritorioAtivo },
                data: { lastActivityAt: agora, updatedAt: agora },
              });

              await transacao.caseTimelineEvent.create({
                data: {
                  id: randomUUID(),
                  officeId: contexto.idEscritorioAtivo,
                  caseId: idCaso,
                  processId: null,
                  actorId: contexto.idUsuario,
                  action: 'PARTE_REMOVIDA',
                  previous: Prisma.DbNull,
                  current: { idParte },
                  createdAt: agora,
                },
              });
            },

            listarLinhaDoTempoCaso: async (
              idCaso: string,
              filtro?: { idProcesso?: string },
            ): Promise<EventoLinhaTempoCasoDto[]> => {
              const registros = await transacao.caseTimelineEvent.findMany({
                where: {
                  officeId: contexto.idEscritorioAtivo,
                  caseId: idCaso,
                  ...(filtro?.idProcesso ? { processId: filtro.idProcesso } : {}),
                },
                include: {
                  actor: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
              });

              return registros.map(converterRegistroPrismaEmEventoLinhaTempoCaso);
            },
          };

          return operacao(operacoes);
        },
        { maxWait: 5000, timeout: 10000 },
      );
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2025'].includes(erro.code)) {
        throw new ErroCasoProcesso('CONFLITO', 409);
      }
      throw erro;
    }
  }
}
