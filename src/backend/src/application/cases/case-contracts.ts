import type { DadosTokenAcesso } from '../authentication/authentication-contracts.js';
import type { PapelVinculoEscritorio } from '../../domain/memberships/membership.js';
import type { Caso, NaturezaCaso, PrioridadeCaso, SituacaoCaso } from '../../domain/cases/legal-case.js';
import type { ParteEnvolvidaCaso, TipoParticipacaoCaso } from '../../domain/cases/case-party.js';
import type {
  FaseProcessual,
  InstanciaProcesso,
  Processo,
  RelacaoProcessoCaso,
} from '../../domain/cases/legal-process.js';
import type { MovimentacaoProcesso } from '../../domain/cases/process-movement.js';
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
  numeroCnjFormatado?: string;
  relacaoComCaso: string;
  tribunal: string;
  comarca?: string | null;
  vara?: string | null;
  instancia: string;
  faseProcessual: string;
  versao?: number;
}

export interface ProcessoDetalheDto {
  id: string;
  idEscritorio: string;
  idCaso: string;
  numeroCnj: string;
  numeroCnjFormatado: string;
  relacaoComCaso: RelacaoProcessoCaso;
  tribunal: string;
  comarca: string | null;
  vara: string | null;
  instancia: InstanciaProcesso;
  faseProcessual: FaseProcessual;
  versao: number;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface MovimentacaoProcessoDto {
  id: string;
  idEscritorio: string;
  idCaso: string;
  idProcesso: string;
  idAutor: string;
  nomeAutor?: string;
  ocorridaEm: Date;
  descricao: string;
  criadoEm: Date;
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

export interface DadosCadastroProcesso {
  numeroCnj: string;
  relacaoComCaso?: RelacaoProcessoCaso;
  tribunal: string;
  comarca?: string | null;
  vara?: string | null;
  instancia: InstanciaProcesso;
  faseProcessual: FaseProcessual;
}

export interface DadosEdicaoProcesso {
  relacaoComCaso?: RelacaoProcessoCaso;
  tribunal?: string;
  comarca?: string | null;
  vara?: string | null;
  instancia?: InstanciaProcesso;
  faseProcessual?: FaseProcessual;
  versao: number;
}

export interface DadosCadastroMovimentacao {
  ocorridaEm: Date;
  descricao: string;
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

  // Operações de Processos e Movimentações (Slice 2)
  buscarProcessoPorId(idProcesso: string): Promise<ProcessoDetalheDto | null>;
  buscarProcessoPorCnjNoCaso(idCaso: string, numeroCnj: string): Promise<ProcessoDetalheDto | null>;
  cadastrarProcesso(processo: Processo): Promise<ProcessoDetalheDto>;
  atualizarProcesso(
    anterior: ProcessoDetalheDto,
    atualizado: Processo,
    evento?: { acao: string; anterior?: Record<string, unknown> | null; atual: Record<string, unknown> },
  ): Promise<ProcessoDetalheDto>;
  registrarMovimentacao(movimentacao: MovimentacaoProcesso): Promise<MovimentacaoProcessoDto>;
  listarMovimentacoesProcesso(
    idProcesso: string,
    paginacao?: { pagina: number; tamanhoPagina: number },
  ): Promise<{ movimentacoes: MovimentacaoProcessoDto[]; total: number }>;
}

export interface RepositorioCasosProcessos {
  executar<T>(contexto: DadosTokenAcesso, operacao: (casos: OperacoesCasosProcessos) => Promise<T>): Promise<T>;
}
