import type { DadosTokenAcesso } from '../authentication/authentication-contracts.js';
import type { PapelVinculoEscritorio } from '../../domain/memberships/membership.js';
import type { Caso, NaturezaCaso, PrioridadeCaso, SituacaoCaso } from '../../domain/cases/legal-case.js';
import type { ParteEnvolvidaCaso, TipoParticipacaoCaso } from '../../domain/cases/case-party.js';
import type { AutorCaso } from './case-policy.js';

export interface ClienteResumoCasoDto {
  id: string;
  nome: string;
  documento: string;
  tipoPessoa: string;
}

export interface MembroEquipeResumoCasoDto {
  id: string; // id do vinculo (membership)
  idUsuario: string;
  nome: string;
  papel: PapelVinculoEscritorio;
}

export interface ParteEnvolvidaDto {
  id: string;
  idEscritorio: string;
  idCaso: string;
  tipoParticipacao: TipoParticipacaoCaso;
  nome: string;
  documento: string | null;
  oab: string | null;
  contato: string | null;
  observacao: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface ProcessoResumoCasoDto {
  id: string;
  numeroCnj: string;
  relacaoComCaso: string;
  tribunal: string;
  instancia: string;
  faseProcessual: string;
}

export interface CasoResumoDto {
  id: string;
  idEscritorio: string;
  titulo: string;
  natureza: NaturezaCaso;
  areaJuridica: string;
  prioridade: PrioridadeCaso;
  situacao: SituacaoCaso;
  idVinculoResponsavel: string | null;
  nomeResponsavel?: string | null;
  valorCausaCentavos: number | null;
  valorEnvolvidoCentavos: number | null;
  clientes: ClienteResumoCasoDto[];
  quantidadeProcessos: number;
  versao: number;
  ultimaAtividadeEm: Date;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface CasoDetalheDto extends CasoResumoDto {
  descricao: string | null;
  equipe: MembroEquipeResumoCasoDto[];
  partes: ParteEnvolvidaDto[];
  processos: ProcessoResumoCasoDto[];
}

export interface EventoLinhaTempoCasoDto {
  id: string;
  idEscritorio: string;
  idCaso: string;
  idProcesso?: string | null;
  idAutor: string;
  nomeAutor?: string;
  acao: string;
  anterior: Record<string, unknown> | null;
  atual: Record<string, unknown>;
  criadoEm: Date;
}

export interface FiltroCasos {
  pagina: number;
  tamanhoPagina: number;
  pesquisa?: string;
  idCliente?: string;
  numeroCnj?: string;
  areaJuridica?: string;
  natureza?: NaturezaCaso;
  idVinculoResponsavel?: string;
  prioridade?: PrioridadeCaso;
  situacao?: SituacaoCaso;
  semResponsavel?: boolean;
  semAtividadeDesdeDias?: number;
}

export interface DadosCadastroParteInicial {
  tipoParticipacao: TipoParticipacaoCaso;
  nome: string;
  documento?: string | null;
  oab?: string | null;
  contato?: string | null;
  observacao?: string | null;
}

export interface DadosCadastroCaso {
  titulo: string;
  descricao?: string | null;
  natureza: NaturezaCaso;
  areaJuridica: string;
  prioridade?: PrioridadeCaso;
  idVinculoResponsavel?: string | null;
  valorCausaCentavos?: number | null;
  valorEnvolvidoCentavos?: number | null;
  idsClientes: string[];
  idsVinculosEquipe?: string[];
  partesIniciais?: DadosCadastroParteInicial[];
}

export interface DadosEdicaoCaso {
  titulo?: string;
  descricao?: string | null;
  natureza?: NaturezaCaso;
  areaJuridica?: string;
  prioridade?: PrioridadeCaso;
  situacao?: SituacaoCaso;
  idVinculoResponsavel?: string | null;
  valorCausaCentavos?: number | null;
  valorEnvolvidoCentavos?: number | null;
  idsClientes?: string[];
  idsVinculosEquipe?: string[];
  versao: number;
}

export interface OperacoesCasosProcessos {
  autor: AutorCaso;
  listarCasos(filtro: FiltroCasos): Promise<{ casos: CasoResumoDto[]; total: number }>;
  buscarCasoPorId(idCaso: string): Promise<CasoDetalheDto>;
  validarClientesNoEscritorio(idsClientes: string[]): Promise<Array<{ id: string; nome: string; documento: string; tipoPessoa: string; status: string }>>;
  validarVinculoEquipeNoEscritorio(
    idVinculo: string,
  ): Promise<{ id: string; idUsuario: string; nome: string; papel: PapelVinculoEscritorio; ativo: boolean } | null>;
  criarCaso(caso: Caso, partesIniciais: ParteEnvolvidaCaso[]): Promise<CasoDetalheDto>;
  atualizarCaso(
    anterior: CasoDetalheDto,
    atualizado: Caso,
    evento?: { acao: string; anterior?: Record<string, unknown> | null; atual: Record<string, unknown> },
  ): Promise<CasoDetalheDto>;
  arquivarCaso(anterior: CasoDetalheDto, versao: number, motivo?: string): Promise<CasoDetalheDto>;
  reabrirCaso(anterior: CasoDetalheDto, versao: number, motivo?: string): Promise<CasoDetalheDto>;
  adicionarParte(parte: ParteEnvolvidaCaso): Promise<ParteEnvolvidaDto>;
  atualizarParte(anterior: ParteEnvolvidaDto, atualizada: ParteEnvolvidaCaso): Promise<ParteEnvolvidaDto>;
  removerParte(idCaso: string, idParte: string): Promise<void>;
  listarLinhaDoTempoCaso(idCaso: string, filtro?: { idProcesso?: string }): Promise<EventoLinhaTempoCasoDto[]>;
}

export interface RepositorioCasosProcessos {
  executar<T>(contexto: DadosTokenAcesso, operacao: (casos: OperacoesCasosProcessos) => Promise<T>): Promise<T>;
}
