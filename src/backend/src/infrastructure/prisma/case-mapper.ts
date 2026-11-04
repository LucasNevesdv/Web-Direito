import type {
  Client,
  ClientType,
  Membership,
  MembershipRole,
  User,
} from '@prisma/client';
import type {
  CasoDetalheDto,
  CasoResumoDto,
  ClienteResumoCasoDto,
  EventoLinhaTempoCasoDto,
  MembroEquipeResumoCasoDto,
  ParteEnvolvidaDto,
  ProcessoResumoCasoDto,
} from '../../application/cases/case-contracts.js';
import type { NaturezaCaso, PrioridadeCaso, SituacaoCaso } from '../../domain/cases/legal-case.js';
import type { TipoParticipacaoCaso } from '../../domain/cases/case-party.js';
import { PAPEIS_DOMINIO } from './team-mapper.js';

export type CaseNature = 'JUDICIAL' | 'EXTRAJUDICIAL' | 'ADMINISTRATIVE' | 'ADVISORY';
export type CasePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type CaseStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'ARCHIVED';
export type ProcessRelationType = 'MAIN' | 'APPEAL' | 'INCIDENTAL' | 'EXECUTION';
export type ProcessInstance = 'FIRST_INSTANCE' | 'SECOND_INSTANCE' | 'SUPERIOR_COURT' | 'ADMINISTRATIVE';

export interface LegalCase {
  id: string;
  officeId: string;
  title: string;
  description: string | null;
  nature: CaseNature;
  legalArea: string;
  priority: CasePriority;
  status: CaseStatus;
  responsibleMembershipId: string | null;
  claimAmountCents: bigint | null;
  involvedAmountCents: bigint | null;
  lastActivityAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaseParty {
  id: string;
  officeId: string;
  caseId: string;
  partyRole: string;
  name: string;
  documentNumber: string | null;
  oab: string | null;
  contactInfo: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LegalProcess {
  id: string;
  officeId: string;
  caseId: string;
  cnjNumber: string;
  relationType: ProcessRelationType;
  court: string;
  district: string | null;
  chamber: string | null;
  instance: ProcessInstance;
  proceduralPhase: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaseTimelineEvent {
  id: string;
  officeId: string;
  caseId: string;
  processId: string | null;
  actorId: string;
  action: string;
  previous: unknown;
  current: unknown;
  createdAt: Date;
}

export const NATUREZAS_CASO_DOMINIO: Record<CaseNature, NaturezaCaso> = {
  JUDICIAL: 'JUDICIAL',
  EXTRAJUDICIAL: 'EXTRAJUDICIAL',
  ADMINISTRATIVE: 'ADMINISTRATIVO',
  ADVISORY: 'CONSULTIVO',
};

export const NATUREZAS_CASO_PRISMA: Record<NaturezaCaso, CaseNature> = {
  JUDICIAL: 'JUDICIAL',
  EXTRAJUDICIAL: 'EXTRAJUDICIAL',
  ADMINISTRATIVO: 'ADMINISTRATIVE',
  CONSULTIVO: 'ADVISORY',
};

export const PRIORIDADES_CASO_DOMINIO: Record<CasePriority, PrioridadeCaso> = {
  LOW: 'BAIXA',
  MEDIUM: 'MEDIA',
  HIGH: 'ALTA',
  URGENT: 'URGENTE',
};

export const PRIORIDADES_CASO_PRISMA: Record<PrioridadeCaso, CasePriority> = {
  BAIXA: 'LOW',
  MEDIA: 'MEDIUM',
  ALTA: 'HIGH',
  URGENTE: 'URGENT',
};

export const SITUACOES_CASO_DOMINIO: Record<CaseStatus, SituacaoCaso> = {
  ACTIVE: 'ATIVO',
  SUSPENDED: 'SUSPENSO',
  CLOSED: 'ENCERRADO',
  ARCHIVED: 'ARQUIVADO',
};

export const SITUACOES_CASO_PRISMA: Record<SituacaoCaso, CaseStatus> = {
  ATIVO: 'ACTIVE',
  SUSPENSO: 'SUSPENDED',
  ENCERRADO: 'CLOSED',
  ARQUIVADO: 'ARCHIVED',
};

export const RELACOES_PROCESSO_DOMINIO: Record<ProcessRelationType, string> = {
  MAIN: 'PRINCIPAL',
  APPEAL: 'RECURSO',
  INCIDENTAL: 'INCIDENTE',
  EXECUTION: 'EXECUCAO_CUMPRIMENTO',
};

export const INSTANCIAS_PROCESSO_DOMINIO: Record<ProcessInstance, string> = {
  FIRST_INSTANCE: 'PRIMEIRA_INSTANCIA',
  SECOND_INSTANCE: 'SEGUNDA_INSTANCIA',
  SUPERIOR_COURT: 'TRIBUNAL_SUPERIOR',
  ADMINISTRATIVE: 'ADMINISTRATIVA',
};

type TipoClientePrisma = ClientType;

function converterTipoPessoaCliente(type: TipoClientePrisma): string {
  return type === 'INDIVIDUAL' ? 'PESSOA_FISICA' : 'PESSOA_JURIDICA';
}

export type RegistroPrismaCasoComRelacoes = LegalCase & {
  responsibleMembership?: (Membership & { user: User }) | null;
  clients: Array<{
    client: Pick<Client, 'id' | 'name' | 'documentNumber' | 'type'>;
  }>;
  teamMembers?: Array<{
    membership: Membership & { user: User };
  }>;
  parties?: CaseParty[];
  processes?: LegalProcess[];
  _count?: {
    processes: number;
  };
};

export function converterRegistroPrismaEmClienteResumoCaso(
  cliente: Pick<Client, 'id' | 'name' | 'documentNumber' | 'type'>,
): ClienteResumoCasoDto {
  return {
    id: cliente.id,
    nome: cliente.name,
    documento: cliente.documentNumber,
    tipoPessoa: converterTipoPessoaCliente(cliente.type),
  };
}

export function converterRegistroPrismaEmMembroEquipeResumo(
  membership: Membership & { user: User },
): MembroEquipeResumoCasoDto {
  return {
    id: membership.id,
    idUsuario: membership.userId,
    nome: membership.user.name,
    papel: PAPEIS_DOMINIO[membership.role as MembershipRole],
  };
}

export function converterRegistroPrismaEmParteEnvolvida(registro: CaseParty): ParteEnvolvidaDto {
  return {
    id: registro.id,
    idEscritorio: registro.officeId,
    idCaso: registro.caseId,
    tipoParticipacao: registro.partyRole as TipoParticipacaoCaso,
    nome: registro.name,
    documento: registro.documentNumber,
    oab: registro.oab,
    contato: registro.contactInfo,
    observacao: registro.notes,
    criadoEm: registro.createdAt,
    atualizadoEm: registro.updatedAt,
  };
}

export function converterRegistroPrismaEmProcessoResumo(registro: LegalProcess): ProcessoResumoCasoDto {
  return {
    id: registro.id,
    numeroCnj: registro.cnjNumber,
    relacaoComCaso: RELACOES_PROCESSO_DOMINIO[registro.relationType] ?? registro.relationType,
    tribunal: registro.court,
    instancia: INSTANCIAS_PROCESSO_DOMINIO[registro.instance] ?? registro.instance,
    faseProcessual: registro.proceduralPhase,
  };
}

export function converterRegistroPrismaEmCasoResumo(registro: RegistroPrismaCasoComRelacoes): CasoResumoDto {
  return {
    id: registro.id,
    idEscritorio: registro.officeId,
    titulo: registro.title,
    natureza: NATUREZAS_CASO_DOMINIO[registro.nature],
    areaJuridica: registro.legalArea,
    prioridade: PRIORIDADES_CASO_DOMINIO[registro.priority],
    situacao: SITUACOES_CASO_DOMINIO[registro.status],
    idVinculoResponsavel: registro.responsibleMembershipId,
    nomeResponsavel: registro.responsibleMembership?.user.name ?? null,
    valorCausaCentavos: registro.claimAmountCents !== null ? Number(registro.claimAmountCents) : null,
    valorEnvolvidoCentavos: registro.involvedAmountCents !== null ? Number(registro.involvedAmountCents) : null,
    clientes: (registro.clients ?? []).map((c) => converterRegistroPrismaEmClienteResumoCaso(c.client)),
    quantidadeProcessos: registro._count?.processes ?? registro.processes?.length ?? 0,
    versao: registro.version,
    ultimaAtividadeEm: registro.lastActivityAt,
    criadoEm: registro.createdAt,
    atualizadoEm: registro.updatedAt,
  };
}

export function converterRegistroPrismaEmCasoDetalhe(registro: RegistroPrismaCasoComRelacoes): CasoDetalheDto {
  const resumo = converterRegistroPrismaEmCasoResumo(registro);
  return {
    ...resumo,
    descricao: registro.description,
    equipe: (registro.teamMembers ?? []).map((tm) => converterRegistroPrismaEmMembroEquipeResumo(tm.membership)),
    partes: (registro.parties ?? []).map(converterRegistroPrismaEmParteEnvolvida),
    processos: (registro.processes ?? []).map(converterRegistroPrismaEmProcessoResumo),
  };
}

export function converterRegistroPrismaEmEventoLinhaTempoCaso(
  registro: CaseTimelineEvent & { actor?: { name: string } | null },
): EventoLinhaTempoCasoDto {
  return {
    id: registro.id,
    idEscritorio: registro.officeId,
    idCaso: registro.caseId,
    idProcesso: registro.processId,
    idAutor: registro.actorId,
    nomeAutor: registro.actor?.name,
    acao: registro.action,
    anterior: (registro.previous as Record<string, unknown> | null) ?? null,
    atual: (registro.current as Record<string, unknown>) ?? {},
    criadoEm: registro.createdAt,
  };
}
