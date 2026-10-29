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
  ClienteDetalheDto,
  ContatoClienteDto,
  FiltroClientes,
  IndicioDuplicidadeCliente,
  OperacoesClientes,
  RepositorioClientes,
} from '../../application/clients/client-contracts.js';
import {
  ErroCliente,
  PERMISSOES_CLIENTE,
  type AutorCliente,
} from '../../application/clients/client-policy.js';
import type { Cliente, SituacaoCliente } from '../../domain/clients/client.js';
import type { ContatoCliente } from '../../domain/clients/client-contact.js';
import {
  converterClienteEmDadosPrisma,
  converterRegistroPrismaEmClienteDetalhe,
  converterRegistroPrismaEmClienteResumo,
  converterRegistroPrismaEmContatoCliente,
  converterRegistroPrismaEmEventoLinhaTempo,
  SITUACOES_CLIENTE_DOMINIO,
  SITUACOES_CLIENTE_PRISMA,
  TIPOS_PESSOA_DOMINIO,
  TIPOS_PESSOA_PRISMA,
} from './client-mapper.js';

function mascararDocumento(documento: string): string {
  const limpo = documento.replace(/\D/g, '');
  if (limpo.length === 11) {
    return `${limpo.slice(0, 3)}.***.***-${limpo.slice(9)}`;
  }
  if (limpo.length === 14) {
    return `${limpo.slice(0, 2)}.***.***/****-${limpo.slice(12)}`;
  }
  return '***';
}

function snapshotCliente(cliente: {
  id: string;
  nome: string;
  nomeSocial?: string | null;
  tipoPessoa: string;
  documento: string;
  email?: string | null;
  telefone?: string | null;
  situacao: string;
  versao: number;
  idVinculoResponsavel?: string | null;
  observacoesInternas?: string | null;
}): Prisma.InputJsonObject {
  return {
    id: cliente.id,
    nome: cliente.nome,
    nomeSocial: cliente.nomeSocial ?? null,
    tipoPessoa: cliente.tipoPessoa,
    documento: cliente.documento,
    email: cliente.email ?? null,
    telefone: cliente.telefone ?? null,
    situacao: cliente.situacao,
    versao: cliente.versao,
    idVinculoResponsavel: cliente.idVinculoResponsavel ?? null,
    observacoesInternas: cliente.observacoesInternas ?? null,
  };
}

function snapshotContato(contato: {
  id: string;
  nome: string;
  cargoOuRelacao?: string | null;
  email?: string | null;
  telefone?: string | null;
  observacao?: string | null;
}): Prisma.InputJsonObject {
  return {
    id: contato.id,
    nome: contato.nome,
    cargoOuRelacao: contato.cargoOuRelacao ?? null,
    email: contato.email ?? null,
    telefone: contato.telefone ?? null,
    observacao: contato.observacao ?? null,
  };
}

export class RepositorioClientesPrisma implements RepositorioClientes {
  constructor(private readonly prisma: PrismaClient) {}

  async executar<T>(
    contexto: DadosTokenAcesso,
    operacao: (clientes: OperacoesClientes) => Promise<T>,
  ): Promise<T> {
    validarContextoDoEscritorio(contexto);

    try {
      return await this.prisma.$transaction(
        async (transacao) => {
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
          const autor: AutorCliente = {
            idUsuario: sessao.userId,
            idEscritorio: sessao.activeOfficeId,
            papel,
            permissoes:
              papel === 'PROPRIETARIO' ? [...PERMISSOES_CLIENTE] : sessao.membership.permissions,
          };

          const buscarClientePorId = async (idCliente: string): Promise<ClienteDetalheDto> => {
            const registro = await transacao.client.findFirst({
              where: { id: idCliente, officeId: contexto.idEscritorioAtivo },
              include: {
                responsibleMembership: { include: { user: true } },
                contacts: { orderBy: { createdAt: 'asc' } },
              },
            });
            if (!registro) {
              throw new ErroCliente('NAO_ENCONTRADO', 404);
            }
            return converterRegistroPrismaEmClienteDetalhe(registro);
          };

          return operacao({
            autor,
            buscarClientePorId,

            listarClientes: async (filtro: FiltroClientes) => {
              const condicoes: Prisma.ClientWhereInput[] = [
                { officeId: contexto.idEscritorioAtivo },
              ];

              if (filtro.situacao) {
                condicoes.push({ status: SITUACOES_CLIENTE_PRISMA[filtro.situacao] });
              }
              if (filtro.tipoPessoa) {
                condicoes.push({ type: TIPOS_PESSOA_PRISMA[filtro.tipoPessoa] });
              }
              if (filtro.idVinculoResponsavel) {
                condicoes.push({ responsibleMembershipId: filtro.idVinculoResponsavel });
              }

              if (filtro.pesquisa && filtro.pesquisa.trim().length > 0) {
                const busca = filtro.pesquisa.trim();
                const buscaDigitos = busca.replace(/\D/g, '');
                const orConditions: Prisma.ClientWhereInput[] = [
                  { name: { contains: busca, mode: 'insensitive' } },
                  { socialName: { contains: busca, mode: 'insensitive' } },
                  { email: { contains: busca, mode: 'insensitive' } },
                ];
                if (buscaDigitos.length > 0) {
                  orConditions.push({ documentNumber: { contains: buscaDigitos } });
                  orConditions.push({ phone: { contains: buscaDigitos } });
                }
                condicoes.push({ OR: orConditions });
              }

              const where: Prisma.ClientWhereInput = { AND: condicoes };

              const [registros, total] = await Promise.all([
                transacao.client.findMany({
                  where,
                  include: { responsibleMembership: { include: { user: true } } },
                  orderBy: [{ name: 'asc' }, { id: 'asc' }],
                  skip: (filtro.pagina - 1) * filtro.tamanhoPagina,
                  take: filtro.tamanhoPagina,
                }),
                transacao.client.count({ where }),
              ]);

              return {
                clientes: registros.map(converterRegistroPrismaEmClienteResumo),
                total,
              };
            },

            verificarDuplicidades: async (entrada) => {
              const digitosDocumento = entrada.documento.replace(/\D/g, '');
              const nomeNormalizado = entrada.nome.trim();
              const digitosTelefone = entrada.telefone?.replace(/\D/g, '');

              const condicoesOr: Prisma.ClientWhereInput[] = [];
              if (digitosDocumento.length > 0) {
                condicoesOr.push({ documentNumber: digitosDocumento });
              }
              if (nomeNormalizado.length > 0) {
                condicoesOr.push({ name: { equals: nomeNormalizado, mode: 'insensitive' } });
                condicoesOr.push({ socialName: { equals: nomeNormalizado, mode: 'insensitive' } });
              }
              if (entrada.email && entrada.email.trim().length > 0) {
                condicoesOr.push({ email: { equals: entrada.email.trim(), mode: 'insensitive' } });
              }
              if (digitosTelefone && digitosTelefone.length > 0) {
                condicoesOr.push({ phone: { equals: digitosTelefone } });
              }

              if (condicoesOr.length === 0) {
                return [];
              }

              const where: Prisma.ClientWhereInput = {
                officeId: contexto.idEscritorioAtivo,
                ...(entrada.ignorarIdCliente ? { id: { not: entrada.ignorarIdCliente } } : {}),
                OR: condicoesOr,
              };

              const encontrados = await transacao.client.findMany({
                where,
                take: 20,
              });

              return encontrados
                .map((c) => {
                  const motivos: IndicioDuplicidadeCliente['motivos'] = [];
                  if (digitosDocumento.length > 0 && c.documentNumber === digitosDocumento) {
                    motivos.push('DOCUMENTO_IDENTICO');
                  }
                  if (
                    nomeNormalizado.length > 0 &&
                    (c.name.trim().toLowerCase() === nomeNormalizado.toLowerCase() ||
                      (c.socialName && c.socialName.trim().toLowerCase() === nomeNormalizado.toLowerCase()))
                  ) {
                    motivos.push('NOME_IDENTICO');
                  }
                  if (
                    entrada.email &&
                    c.email &&
                    c.email.trim().toLowerCase() === entrada.email.trim().toLowerCase()
                  ) {
                    motivos.push('EMAIL_IDENTICO');
                  }
                  if (
                    digitosTelefone &&
                    c.phone &&
                    c.phone.replace(/\D/g, '') === digitosTelefone
                  ) {
                    motivos.push('TELEFONE_IDENTICO');
                  }

                  return {
                    id: c.id,
                    nome: c.name,
                    nomeSocial: c.socialName,
                    tipoPessoa: TIPOS_PESSOA_DOMINIO[c.type],
                    documentoMascarado: mascararDocumento(c.documentNumber),
                    email: c.email,
                    telefone: c.phone,
                    situacao: SITUACOES_CLIENTE_DOMINIO[c.status],
                    motivos,
                  };
                })
                .filter((c) => c.motivos.length > 0);
            },

            validarVinculoResponsavelNoEscritorio: async (idVinculoResponsavel: string) => {
              const vinculo = await transacao.membership.findFirst({
                where: {
                  id: idVinculoResponsavel,
                  officeId: contexto.idEscritorioAtivo,
                  active: true,
                },
                include: { user: true },
              });
              if (!vinculo) {
                throw new ErroCliente('RESPONSAVEL_INVALIDO', 400);
              }
              return {
                id: vinculo.id,
                nome: vinculo.user.name,
                papel: PAPEIS_DOMINIO[vinculo.role],
              };
            },

            criarCliente: async (cliente: Cliente, contatosIniciais: ContatoCliente[]) => {
              // Lock transacional por documento dentro do escritório
              await transacao.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${contexto.idEscritorioAtivo}:${cliente.documento}`}, 0))::text`;

              const existente = await transacao.client.findUnique({
                where: {
                  officeId_documentNumber: {
                    officeId: contexto.idEscritorioAtivo,
                    documentNumber: cliente.documento,
                  },
                },
              });
              if (existente) {
                throw new ErroCliente('DOCUMENTO_JA_CADASTRADO', 409);
              }

              const dadosPrisma = converterClienteEmDadosPrisma(cliente);
              await transacao.client.create({ data: dadosPrisma });

              for (const contato of contatosIniciais) {
                await transacao.clientContact.create({
                  data: {
                    id: contato.id,
                    officeId: contexto.idEscritorioAtivo,
                    clientId: cliente.id,
                    name: contato.nome,
                    roleOrRelation: contato.cargoOuRelacao,
                    email: contato.email,
                    phone: contato.telefone,
                    notes: contato.observacao,
                    createdAt: contato.criadoEm,
                    updatedAt: contato.atualizadoEm,
                  },
                });
              }

              await transacao.clientTimelineEvent.create({
                data: {
                  id: randomUUID(),
                  officeId: contexto.idEscritorioAtivo,
                  clientId: cliente.id,
                  actorId: autor.idUsuario,
                  action: 'CLIENTE_CRIADO',
                  previous: Prisma.DbNull,
                  current: snapshotCliente(cliente),
                  createdAt: new Date(),
                },
              });

              return buscarClientePorId(cliente.id);
            },

            atualizarCliente: async (anterior: ClienteDetalheDto, atualizado: Cliente) => {
              if (anterior.documento !== atualizado.documento) {
                await transacao.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${contexto.idEscritorioAtivo}:${atualizado.documento}`}, 0))::text`;
              }

              const agora = new Date();
              const dadosPrisma = converterClienteEmDadosPrisma(atualizado);

              const mudou = await transacao.client.updateMany({
                where: {
                  id: anterior.id,
                  officeId: contexto.idEscritorioAtivo,
                  version: anterior.versao,
                },
                data: {
                  type: dadosPrisma.type,
                  name: dadosPrisma.name,
                  socialName: dadosPrisma.socialName,
                  documentNumber: dadosPrisma.documentNumber,
                  email: dadosPrisma.email,
                  phone: dadosPrisma.phone,
                  addressZipCode: dadosPrisma.addressZipCode,
                  addressStreet: dadosPrisma.addressStreet,
                  addressNumber: dadosPrisma.addressNumber,
                  addressComplement: dadosPrisma.addressComplement,
                  addressNeighborhood: dadosPrisma.addressNeighborhood,
                  addressCity: dadosPrisma.addressCity,
                  addressState: dadosPrisma.addressState,
                  internalNotes: dadosPrisma.internalNotes,
                  responsibleMembershipId: dadosPrisma.responsibleMembershipId,
                  version: { increment: 1 },
                  updatedAt: agora,
                },
              });

              if (mudou.count !== 1) {
                throw new ErroCliente('CONFLITO', 409);
              }

              if (anterior.idVinculoResponsavel !== atualizado.idVinculoResponsavel) {
                await transacao.clientTimelineEvent.create({
                  data: {
                    id: randomUUID(),
                    officeId: contexto.idEscritorioAtivo,
                    clientId: atualizado.id,
                    actorId: autor.idUsuario,
                    action: 'RESPONSAVEL_ALTERADO',
                    previous: { idVinculoResponsavel: anterior.idVinculoResponsavel },
                    current: { idVinculoResponsavel: atualizado.idVinculoResponsavel },
                    createdAt: agora,
                  },
                });
              }

              await transacao.clientTimelineEvent.create({
                data: {
                  id: randomUUID(),
                  officeId: contexto.idEscritorioAtivo,
                  clientId: atualizado.id,
                  actorId: autor.idUsuario,
                  action: 'CLIENTE_ATUALIZADO',
                  previous: snapshotCliente(anterior),
                  current: snapshotCliente({
                    id: atualizado.id,
                    nome: atualizado.nome,
                    nomeSocial: atualizado.nomeSocial,
                    tipoPessoa: atualizado.tipoPessoa,
                    documento: atualizado.documento,
                    email: atualizado.email,
                    telefone: atualizado.telefone,
                    situacao: atualizado.situacao,
                    versao: anterior.versao + 1,
                    idVinculoResponsavel: atualizado.idVinculoResponsavel,
                    observacoesInternas: atualizado.observacoesInternas,
                  }),
                  createdAt: agora,
                },
              });

              return buscarClientePorId(atualizado.id);
            },

            definirSituacao: async (
              anterior: ClienteDetalheDto,
              novaSituacao: SituacaoCliente,
              motivo?: string | null,
            ) => {
              const agora = new Date();

              const mudou = await transacao.client.updateMany({
                where: {
                  id: anterior.id,
                  officeId: contexto.idEscritorioAtivo,
                  version: anterior.versao,
                },
                data: {
                  status: SITUACOES_CLIENTE_PRISMA[novaSituacao],
                  version: { increment: 1 },
                  updatedAt: agora,
                },
              });

              if (mudou.count !== 1) {
                throw new ErroCliente('CONFLITO', 409);
              }

              await transacao.clientTimelineEvent.create({
                data: {
                  id: randomUUID(),
                  officeId: contexto.idEscritorioAtivo,
                  clientId: anterior.id,
                  actorId: autor.idUsuario,
                  action: novaSituacao === 'ATIVO' ? 'CLIENTE_REATIVADO' : 'CLIENTE_INATIVADO',
                  previous: { situacao: anterior.situacao },
                  current: { situacao: novaSituacao, motivo: motivo ?? null },
                  createdAt: agora,
                },
              });

              return buscarClientePorId(anterior.id);
            },

            adicionarContatoCliente: async (contato: ContatoCliente) => {
              const cliente = await transacao.client.findFirst({
                where: { id: contato.idCliente, officeId: contexto.idEscritorioAtivo },
              });
              if (!cliente) {
                throw new ErroCliente('NAO_ENCONTRADO', 404);
              }

              const criado = await transacao.clientContact.create({
                data: {
                  id: contato.id,
                  officeId: contexto.idEscritorioAtivo,
                  clientId: contato.idCliente,
                  name: contato.nome,
                  roleOrRelation: contato.cargoOuRelacao,
                  email: contato.email,
                  phone: contato.telefone,
                  notes: contato.observacao,
                  createdAt: contato.criadoEm,
                  updatedAt: contato.atualizadoEm,
                },
              });

              await transacao.clientTimelineEvent.create({
                data: {
                  id: randomUUID(),
                  officeId: contexto.idEscritorioAtivo,
                  clientId: contato.idCliente,
                  actorId: autor.idUsuario,
                  action: 'CONTATO_ADICIONADO',
                  previous: Prisma.DbNull,
                  current: snapshotContato(contato),
                  createdAt: new Date(),
                },
              });

              return converterRegistroPrismaEmContatoCliente(criado);
            },

            atualizarContatoCliente: async (anterior: ContatoClienteDto, atualizado: ContatoCliente) => {
              const cliente = await transacao.client.findFirst({
                where: { id: atualizado.idCliente, officeId: contexto.idEscritorioAtivo },
              });
              if (!cliente) {
                throw new ErroCliente('NAO_ENCONTRADO', 404);
              }

              const agora = new Date();
              const mudou = await transacao.clientContact.updateMany({
                where: {
                  id: atualizado.id,
                  clientId: atualizado.idCliente,
                  officeId: contexto.idEscritorioAtivo,
                },
                data: {
                  name: atualizado.nome,
                  roleOrRelation: atualizado.cargoOuRelacao,
                  email: atualizado.email,
                  phone: atualizado.telefone,
                  notes: atualizado.observacao,
                  updatedAt: agora,
                },
              });

              if (mudou.count !== 1) {
                throw new ErroCliente('NAO_ENCONTRADO', 404);
              }

              await transacao.clientTimelineEvent.create({
                data: {
                  id: randomUUID(),
                  officeId: contexto.idEscritorioAtivo,
                  clientId: atualizado.idCliente,
                  actorId: autor.idUsuario,
                  action: 'CONTATO_ATUALIZADO',
                  previous: snapshotContato(anterior),
                  current: snapshotContato(atualizado),
                  createdAt: agora,
                },
              });

              const registro = await transacao.clientContact.findUniqueOrThrow({
                where: { id: atualizado.id },
              });

              return converterRegistroPrismaEmContatoCliente(registro);
            },

            removerContatoCliente: async (idCliente: string, idContato: string) => {
              const cliente = await transacao.client.findFirst({
                where: { id: idCliente, officeId: contexto.idEscritorioAtivo },
              });
              if (!cliente) {
                throw new ErroCliente('NAO_ENCONTRADO', 404);
              }

              const contatoExistente = await transacao.clientContact.findFirst({
                where: {
                  id: idContato,
                  clientId: idCliente,
                  officeId: contexto.idEscritorioAtivo,
                },
              });

              if (!contatoExistente) {
                throw new ErroCliente('NAO_ENCONTRADO', 404);
              }

              await transacao.clientContact.delete({
                where: { id: idContato },
              });

              await transacao.clientTimelineEvent.create({
                data: {
                  id: randomUUID(),
                  officeId: contexto.idEscritorioAtivo,
                  clientId: idCliente,
                  actorId: autor.idUsuario,
                  action: 'CONTATO_REMOVIDO',
                  previous: snapshotContato({
                    id: contatoExistente.id,
                    nome: contatoExistente.name,
                    cargoOuRelacao: contatoExistente.roleOrRelation,
                    email: contatoExistente.email,
                    telefone: contatoExistente.phone,
                    observacao: contatoExistente.notes,
                  }),
                  current: {
                    id: contatoExistente.id,
                    nome: contatoExistente.name,
                    removido: true,
                  },
                  createdAt: new Date(),
                },
              });
            },

            listarLinhaDoTempoCliente: async (idCliente: string) => {
              const registros = await transacao.clientTimelineEvent.findMany({
                where: {
                  clientId: idCliente,
                  officeId: contexto.idEscritorioAtivo,
                },
                include: { actor: { select: { name: true } } },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 100,
              });

              return registros.map(converterRegistroPrismaEmEventoLinhaTempo);
            },
          });
        },
        { maxWait: 5000, timeout: 10000 },
      );
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw new ErroCliente('DOCUMENTO_JA_CADASTRADO', 409);
      }
      if (erro instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2025'].includes(erro.code)) {
        throw new ErroCliente('CONFLITO', 409);
      }
      throw erro;
    }
  }
}
