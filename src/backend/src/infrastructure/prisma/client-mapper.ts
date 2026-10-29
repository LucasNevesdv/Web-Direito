import type { Client, ClientContact, ClientStatus, ClientTimelineEvent, ClientType, Prisma } from '@prisma/client';
import { Cliente, type SituacaoCliente, type TipoPessoaCliente } from '../../domain/clients/client.js';
import type {
  ClienteDetalheDto,
  ClienteResumoDto,
  ContatoClienteDto,
  EventoLinhaTempoClienteDto,
} from '../../application/clients/client-contracts.js';

export const TIPOS_PESSOA_DOMINIO: Record<ClientType, TipoPessoaCliente> = {
  INDIVIDUAL: 'PESSOA_FISICA',
  LEGAL_ENTITY: 'PESSOA_JURIDICA',
};

export const TIPOS_PESSOA_PRISMA: Record<TipoPessoaCliente, ClientType> = {
  PESSOA_FISICA: 'INDIVIDUAL',
  PESSOA_JURIDICA: 'LEGAL_ENTITY',
};

export const SITUACOES_CLIENTE_DOMINIO: Record<ClientStatus, SituacaoCliente> = {
  ACTIVE: 'ATIVO',
  INACTIVE: 'INATIVO',
};

export const SITUACOES_CLIENTE_PRISMA: Record<SituacaoCliente, ClientStatus> = {
  ATIVO: 'ACTIVE',
  INATIVO: 'INACTIVE',
};

export function converterRegistroPrismaEmCliente(registro: Client): Cliente {
  return Cliente.restaurar({
    id: registro.id,
    idEscritorio: registro.officeId,
    tipoPessoa: TIPOS_PESSOA_DOMINIO[registro.type],
    nome: registro.name,
    nomeSocial: registro.socialName,
    documento: registro.documentNumber,
    email: registro.email,
    telefone: registro.phone,
    endereco:
      registro.addressZipCode ||
      registro.addressStreet ||
      registro.addressNumber ||
      registro.addressComplement ||
      registro.addressNeighborhood ||
      registro.addressCity ||
      registro.addressState
        ? {
            cep: registro.addressZipCode,
            logradouro: registro.addressStreet,
            numero: registro.addressNumber,
            complemento: registro.addressComplement,
            bairro: registro.addressNeighborhood,
            cidade: registro.addressCity,
            uf: registro.addressState,
          }
        : null,
    observacoesInternas: registro.internalNotes,
    idVinculoResponsavel: registro.responsibleMembershipId,
    situacao: SITUACOES_CLIENTE_DOMINIO[registro.status],
    versao: registro.version,
    criadoEm: registro.createdAt,
    atualizadoEm: registro.updatedAt,
  });
}

export function converterRegistroPrismaEmClienteResumo(
  registro: Client & { responsibleMembership?: { user: { name: string } } | null },
): ClienteResumoDto {
  return {
    id: registro.id,
    idEscritorio: registro.officeId,
    tipoPessoa: TIPOS_PESSOA_DOMINIO[registro.type],
    nome: registro.name,
    nomeSocial: registro.socialName,
    documento: registro.documentNumber,
    email: registro.email,
    telefone: registro.phone,
    situacao: SITUACOES_CLIENTE_DOMINIO[registro.status],
    idVinculoResponsavel: registro.responsibleMembershipId,
    nomeResponsavel: registro.responsibleMembership?.user.name ?? null,
    versao: registro.version,
    criadoEm: registro.createdAt,
    atualizadoEm: registro.updatedAt,
  };
}

export function converterRegistroPrismaEmContatoCliente(registro: ClientContact): ContatoClienteDto {
  return {
    id: registro.id,
    idEscritorio: registro.officeId,
    idCliente: registro.clientId,
    nome: registro.name,
    cargoOuRelacao: registro.roleOrRelation,
    email: registro.email,
    telefone: registro.phone,
    observacao: registro.notes,
    criadoEm: registro.createdAt,
    atualizadoEm: registro.updatedAt,
  };
}

export function converterRegistroPrismaEmClienteDetalhe(
  registro: Client & {
    responsibleMembership?: { user: { name: string } } | null;
    contacts?: ClientContact[];
  },
): ClienteDetalheDto {
  const resumo = converterRegistroPrismaEmClienteResumo(registro);
  return {
    ...resumo,
    endereco:
      registro.addressZipCode ||
      registro.addressStreet ||
      registro.addressNumber ||
      registro.addressComplement ||
      registro.addressNeighborhood ||
      registro.addressCity ||
      registro.addressState
        ? {
            cep: registro.addressZipCode,
            logradouro: registro.addressStreet,
            numero: registro.addressNumber,
            complemento: registro.addressComplement,
            bairro: registro.addressNeighborhood,
            cidade: registro.addressCity,
            uf: registro.addressState,
          }
        : null,
    observacoesInternas: registro.internalNotes,
    contatos: (registro.contacts ?? []).map(converterRegistroPrismaEmContatoCliente),
  };
}

export function converterRegistroPrismaEmEventoLinhaTempo(
  registro: ClientTimelineEvent & { actor?: { name: string } | null },
): EventoLinhaTempoClienteDto {
  const atualObj = (registro.current as Record<string, unknown>) ?? {};
  return {
    id: registro.id,
    idEscritorio: registro.officeId,
    idCliente: registro.clientId,
    idAutor: registro.actorId,
    nomeAutor: registro.actor?.name,
    acao: registro.action,
    motivo: (atualObj.motivo as string) ?? null,
    anterior: (registro.previous as Record<string, unknown>) ?? null,
    atual: atualObj,
    criadoEm: registro.createdAt,
  };
}

export function converterClienteEmDadosPrisma(
  cliente: Cliente,
): Prisma.ClientUncheckedCreateInput {
  const endereco = cliente.endereco;
  return {
    id: cliente.id,
    officeId: cliente.idEscritorio,
    type: TIPOS_PESSOA_PRISMA[cliente.tipoPessoa],
    name: cliente.nome,
    socialName: cliente.nomeSocial,
    documentNumber: cliente.documento,
    email: cliente.email,
    phone: cliente.telefone,
    addressZipCode: endereco?.cep ?? null,
    addressStreet: endereco?.logradouro ?? null,
    addressNumber: endereco?.numero ?? null,
    addressComplement: endereco?.complemento ?? null,
    addressNeighborhood: endereco?.bairro ?? null,
    addressCity: endereco?.cidade ?? null,
    addressState: endereco?.uf ?? null,
    internalNotes: cliente.observacoesInternas,
    responsibleMembershipId: cliente.idVinculoResponsavel,
    status: SITUACOES_CLIENTE_PRISMA[cliente.situacao],
    version: cliente.versao,
    createdAt: cliente.criadoEm,
    updatedAt: cliente.atualizadoEm,
  };
}
