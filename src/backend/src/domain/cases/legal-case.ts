import { randomUUID } from 'node:crypto';
import { ErroCasoInvalido } from './invalid-case-error.js';

export const NATUREZAS_CASO = [
  'JUDICIAL',
  'EXTRAJUDICIAL',
  'ADMINISTRATIVO',
  'CONSULTIVO',
] as const;
export type NaturezaCaso = (typeof NATUREZAS_CASO)[number];

export const PRIORIDADES_CASO = [
  'BAIXA',
  'MEDIA',
  'ALTA',
  'URGENTE',
] as const;
export type PrioridadeCaso = (typeof PRIORIDADES_CASO)[number];

export const SITUACOES_CASO = [
  'ATIVO',
  'SUSPENSO',
  'ENCERRADO',
  'ARQUIVADO',
] as const;
export type SituacaoCaso = (typeof SITUACOES_CASO)[number];

export const AREAS_JURIDICAS_PADRAO = [
  'CIVEL',
  'TRABALHISTA',
  'TRIBUTARIO',
  'PREVIDENCIARIO',
  'EMPRESARIAL',
  'FAMILIA_SUCESSOES',
  'CONSUMIDOR',
  'IMOBILIARIO',
  'ADMINISTRATIVO',
  'PENAL',
  'OUTRA',
] as const;
export type AreaJuridicaCaso = (typeof AREAS_JURIDICAS_PADRAO)[number] | string;

export interface EstadoCaso {
  id: string;
  idEscritorio: string;
  titulo: string;
  descricao?: string | null;
  natureza: NaturezaCaso;
  areaJuridica: string;
  prioridade: PrioridadeCaso;
  situacao: SituacaoCaso;
  idVinculoResponsavel?: string | null;
  valorCausaCentavos?: number | null;
  valorEnvolvidoCentavos?: number | null;
  idsClientes: string[];
  idsVinculosEquipe: string[];
  versao: number;
  ultimaAtividadeEm: Date;
  criadoEm: Date;
  atualizadoEm: Date;
}

const PADRAO_UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const LIMITE_MAXIMO_CENTAVOS = 999_999_999_999_99; // R$ 999.999.999.999,99

export class Caso {
  readonly #id: string;
  readonly #idEscritorio: string;
  readonly #titulo: string;
  readonly #descricao: string | null;
  readonly #natureza: NaturezaCaso;
  readonly #areaJuridica: string;
  readonly #prioridade: PrioridadeCaso;
  readonly #situacao: SituacaoCaso;
  readonly #idVinculoResponsavel: string | null;
  readonly #valorCausaCentavos: number | null;
  readonly #valorEnvolvidoCentavos: number | null;
  readonly #idsClientes: string[];
  readonly #idsVinculosEquipe: string[];
  readonly #versao: number;
  readonly #ultimaAtividadeEm: number;
  readonly #criadoEm: number;
  readonly #atualizadoEm: number;

  private constructor(estado: EstadoCaso) {
    if (typeof estado.id !== 'string' || !PADRAO_UUID.test(estado.id)) {
      throw new ErroCasoInvalido('id');
    }
    if (typeof estado.idEscritorio !== 'string' || !PADRAO_UUID.test(estado.idEscritorio)) {
      throw new ErroCasoInvalido('idEscritorio');
    }
    if (!NATUREZAS_CASO.includes(estado.natureza)) {
      throw new ErroCasoInvalido('natureza');
    }
    if (!PRIORIDADES_CASO.includes(estado.prioridade)) {
      throw new ErroCasoInvalido('prioridade');
    }
    if (!SITUACOES_CASO.includes(estado.situacao)) {
      throw new ErroCasoInvalido('situacao');
    }

    const titulo = Caso.normalizarTitulo(estado.titulo);
    const descricao = Caso.normalizarDescricao(estado.descricao);
    const areaJuridica = Caso.normalizarAreaJuridica(estado.areaJuridica);
    const idVinculoResponsavel = Caso.normalizarIdVinculo(estado.idVinculoResponsavel, 'idVinculoResponsavel');
    const valorCausaCentavos = Caso.normalizarCentavos(estado.valorCausaCentavos, 'valorCausaCentavos');
    const valorEnvolvidoCentavos = Caso.normalizarCentavos(estado.valorEnvolvidoCentavos, 'valorEnvolvidoCentavos');
    const idsClientes = Caso.normalizarIdsClientes(estado.idsClientes);
    const idsVinculosEquipe = Caso.normalizarIdsVinculosEquipe(estado.idsVinculosEquipe);

    if (typeof estado.versao !== 'number' || !Number.isInteger(estado.versao) || estado.versao < 0) {
      throw new ErroCasoInvalido('versao');
    }
    if (!(estado.criadoEm instanceof Date) || !Number.isFinite(estado.criadoEm.getTime())) {
      throw new ErroCasoInvalido('criadoEm');
    }
    if (
      !(estado.atualizadoEm instanceof Date) ||
      !Number.isFinite(estado.atualizadoEm.getTime()) ||
      estado.atualizadoEm.getTime() < estado.criadoEm.getTime()
    ) {
      throw new ErroCasoInvalido('atualizadoEm');
    }
    if (
      !(estado.ultimaAtividadeEm instanceof Date) ||
      !Number.isFinite(estado.ultimaAtividadeEm.getTime())
    ) {
      throw new ErroCasoInvalido('ultimaAtividadeEm');
    }

    this.#id = estado.id.toLowerCase();
    this.#idEscritorio = estado.idEscritorio.toLowerCase();
    this.#titulo = titulo;
    this.#descricao = descricao;
    this.#natureza = estado.natureza;
    this.#areaJuridica = areaJuridica;
    this.#prioridade = estado.prioridade;
    this.#situacao = estado.situacao;
    this.#idVinculoResponsavel = idVinculoResponsavel;
    this.#valorCausaCentavos = valorCausaCentavos;
    this.#valorEnvolvidoCentavos = valorEnvolvidoCentavos;
    this.#idsClientes = idsClientes;
    this.#idsVinculosEquipe = idsVinculosEquipe;
    this.#versao = estado.versao;
    this.#ultimaAtividadeEm = estado.ultimaAtividadeEm.getTime();
    this.#criadoEm = estado.criadoEm.getTime();
    this.#atualizadoEm = estado.atualizadoEm.getTime();
  }

  static normalizarTitulo(tituloInformado: unknown): string {
    if (typeof tituloInformado !== 'string') {
      throw new ErroCasoInvalido('titulo');
    }
    const titulo = tituloInformado.trim();
    const tamanho = Array.from(titulo).length;
    if (tamanho < 3 || tamanho > 160) {
      throw new ErroCasoInvalido('titulo');
    }
    return titulo;
  }

  static normalizarDescricao(descInformada: unknown): string | null {
    if (descInformada === null || descInformada === undefined) {
      return null;
    }
    if (typeof descInformada !== 'string') {
      throw new ErroCasoInvalido('descricao');
    }
    const limpo = descInformada.trim();
    if (limpo.length === 0) {
      return null;
    }
    if (Array.from(limpo).length > 4000) {
      throw new ErroCasoInvalido('descricao');
    }
    return limpo;
  }

  static normalizarAreaJuridica(areaInformada: unknown): string {
    if (typeof areaInformada !== 'string') {
      throw new ErroCasoInvalido('areaJuridica');
    }
    const limpo = areaInformada.trim();
    const tamanho = Array.from(limpo).length;
    if (tamanho < 1 || tamanho > 40) {
      throw new ErroCasoInvalido('areaJuridica');
    }
    return limpo;
  }

  static normalizarIdVinculo(idInformado: unknown, campo: 'idVinculoResponsavel'): string | null {
    if (idInformado === null || idInformado === undefined) {
      return null;
    }
    if (typeof idInformado !== 'string' || !PADRAO_UUID.test(idInformado)) {
      throw new ErroCasoInvalido(campo);
    }
    return idInformado.toLowerCase();
  }

  static normalizarCentavos(valor: unknown, campo: 'valorCausaCentavos' | 'valorEnvolvidoCentavos'): number | null {
    if (valor === null || valor === undefined) {
      return null;
    }
    if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor < 0 || valor > LIMITE_MAXIMO_CENTAVOS) {
      throw new ErroCasoInvalido(campo);
    }
    return valor;
  }

  static normalizarIdsClientes(ids: unknown): string[] {
    if (!Array.isArray(ids)) {
      throw new ErroCasoInvalido('idsClientes');
    }
    if (ids.length === 0) {
      throw new ErroCasoInvalido('idsClientes'); // Mínimo 1 cliente vinculado (DP-06 / RF-032)
    }
    const normalizados: string[] = [];
    const conjunto = new Set<string>();
    for (const item of ids) {
      if (typeof item !== 'string' || !PADRAO_UUID.test(item)) {
        throw new ErroCasoInvalido('idsClientes');
      }
      const lower = item.toLowerCase();
      if (conjunto.has(lower)) {
        throw new ErroCasoInvalido('idsClientes'); // Sem duplicidades
      }
      conjunto.add(lower);
      normalizados.push(lower);
    }
    return normalizados;
  }

  static normalizarIdsVinculosEquipe(ids: unknown): string[] {
    if (ids === null || ids === undefined) {
      return [];
    }
    if (!Array.isArray(ids)) {
      throw new ErroCasoInvalido('idsVinculosEquipe');
    }
    const normalizados: string[] = [];
    const conjunto = new Set<string>();
    for (const item of ids) {
      if (typeof item !== 'string' || !PADRAO_UUID.test(item)) {
        throw new ErroCasoInvalido('idsVinculosEquipe');
      }
      const lower = item.toLowerCase();
      if (conjunto.has(lower)) {
        throw new ErroCasoInvalido('idsVinculosEquipe'); // Sem duplicidades
      }
      conjunto.add(lower);
      normalizados.push(lower);
    }
    return normalizados;
  }

  static criar(entrada: {
    idEscritorio: string;
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
    id?: string;
  }): Caso {
    const agora = new Date();
    return new Caso({
      id: entrada.id === undefined ? randomUUID() : entrada.id,
      idEscritorio: entrada.idEscritorio,
      titulo: entrada.titulo,
      descricao: entrada.descricao ?? null,
      natureza: entrada.natureza,
      areaJuridica: entrada.areaJuridica,
      prioridade: entrada.prioridade ?? 'MEDIA',
      situacao: 'ATIVO',
      idVinculoResponsavel: entrada.idVinculoResponsavel ?? null,
      valorCausaCentavos: entrada.valorCausaCentavos ?? null,
      valorEnvolvidoCentavos: entrada.valorEnvolvidoCentavos ?? null,
      idsClientes: entrada.idsClientes,
      idsVinculosEquipe: entrada.idsVinculosEquipe ?? [],
      versao: 0,
      ultimaAtividadeEm: agora,
      criadoEm: agora,
      atualizadoEm: agora,
    });
  }

  static restaurar(estado: EstadoCaso): Caso {
    return new Caso(estado);
  }

  editar(dados: {
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
  }): Caso {
    if (this.#situacao === 'ARQUIVADO') {
      throw new ErroCasoInvalido('situacao'); // DP-08: caso arquivado é somente leitura
    }

    const agora = new Date();
    return new Caso({
      id: this.#id,
      idEscritorio: this.#idEscritorio,
      titulo: dados.titulo ?? this.#titulo,
      descricao: dados.descricao !== undefined ? dados.descricao : this.#descricao,
      natureza: dados.natureza ?? this.#natureza,
      areaJuridica: dados.areaJuridica ?? this.#areaJuridica,
      prioridade: dados.prioridade ?? this.#prioridade,
      situacao: dados.situacao ?? this.#situacao,
      idVinculoResponsavel: dados.idVinculoResponsavel !== undefined ? dados.idVinculoResponsavel : this.#idVinculoResponsavel,
      valorCausaCentavos: dados.valorCausaCentavos !== undefined ? dados.valorCausaCentavos : this.#valorCausaCentavos,
      valorEnvolvidoCentavos: dados.valorEnvolvidoCentavos !== undefined ? dados.valorEnvolvidoCentavos : this.#valorEnvolvidoCentavos,
      idsClientes: dados.idsClientes ?? this.#idsClientes,
      idsVinculosEquipe: dados.idsVinculosEquipe ?? this.#idsVinculosEquipe,
      versao: this.#versao + 1,
      ultimaAtividadeEm: agora,
      criadoEm: new Date(this.#criadoEm),
      atualizadoEm: agora,
    });
  }

  arquivar(): Caso {
    if (this.#situacao === 'ARQUIVADO') {
      throw new ErroCasoInvalido('situacao');
    }
    const agora = new Date();
    return new Caso({
      id: this.#id,
      idEscritorio: this.#idEscritorio,
      titulo: this.#titulo,
      descricao: this.#descricao,
      natureza: this.#natureza,
      areaJuridica: this.#areaJuridica,
      prioridade: this.#prioridade,
      situacao: 'ARQUIVADO',
      idVinculoResponsavel: this.#idVinculoResponsavel,
      valorCausaCentavos: this.#valorCausaCentavos,
      valorEnvolvidoCentavos: this.#valorEnvolvidoCentavos,
      idsClientes: this.#idsClientes,
      idsVinculosEquipe: this.#idsVinculosEquipe,
      versao: this.#versao + 1,
      ultimaAtividadeEm: agora,
      criadoEm: new Date(this.#criadoEm),
      atualizadoEm: agora,
    });
  }

  reabrir(): Caso {
    if (this.#situacao !== 'ARQUIVADO' && this.#situacao !== 'ENCERRADO') {
      throw new ErroCasoInvalido('situacao');
    }
    const agora = new Date();
    return new Caso({
      id: this.#id,
      idEscritorio: this.#idEscritorio,
      titulo: this.#titulo,
      descricao: this.#descricao,
      natureza: this.#natureza,
      areaJuridica: this.#areaJuridica,
      prioridade: this.#prioridade,
      situacao: 'ATIVO',
      idVinculoResponsavel: this.#idVinculoResponsavel,
      valorCausaCentavos: this.#valorCausaCentavos,
      valorEnvolvidoCentavos: this.#valorEnvolvidoCentavos,
      idsClientes: this.#idsClientes,
      idsVinculosEquipe: this.#idsVinculosEquipe,
      versao: this.#versao + 1,
      ultimaAtividadeEm: agora,
      criadoEm: new Date(this.#criadoEm),
      atualizadoEm: agora,
    });
  }

  registrarAtividade(data?: Date): Caso {
    const dataAtividade = data ?? new Date();
    return new Caso({
      id: this.#id,
      idEscritorio: this.#idEscritorio,
      titulo: this.#titulo,
      descricao: this.#descricao,
      natureza: this.#natureza,
      areaJuridica: this.#areaJuridica,
      prioridade: this.#prioridade,
      situacao: this.#situacao,
      idVinculoResponsavel: this.#idVinculoResponsavel,
      valorCausaCentavos: this.#valorCausaCentavos,
      valorEnvolvidoCentavos: this.#valorEnvolvidoCentavos,
      idsClientes: this.#idsClientes,
      idsVinculosEquipe: this.#idsVinculosEquipe,
      versao: this.#versao,
      ultimaAtividadeEm: dataAtividade,
      criadoEm: new Date(this.#criadoEm),
      atualizadoEm: new Date(),
    });
  }

  get id(): string { return this.#id; }
  get idEscritorio(): string { return this.#idEscritorio; }
  get titulo(): string { return this.#titulo; }
  get descricao(): string | null { return this.#descricao; }
  get natureza(): NaturezaCaso { return this.#natureza; }
  get areaJuridica(): string { return this.#areaJuridica; }
  get prioridade(): PrioridadeCaso { return this.#prioridade; }
  get situacao(): SituacaoCaso { return this.#situacao; }
  get idVinculoResponsavel(): string | null { return this.#idVinculoResponsavel; }
  get valorCausaCentavos(): number | null { return this.#valorCausaCentavos; }
  get valorEnvolvidoCentavos(): number | null { return this.#valorEnvolvidoCentavos; }
  get idsClientes(): string[] { return [...this.#idsClientes]; }
  get idsVinculosEquipe(): string[] { return [...this.#idsVinculosEquipe]; }
  get versao(): number { return this.#versao; }
  get ultimaAtividadeEm(): Date { return new Date(this.#ultimaAtividadeEm); }
  get criadoEm(): Date { return new Date(this.#criadoEm); }
  get atualizadoEm(): Date { return new Date(this.#atualizadoEm); }
}
