import { randomUUID } from 'node:crypto';
import { ErroCasoInvalido } from './invalid-case-error.js';

export type AcaoLinhaTempoCaso =
  | 'CASO_CRIADO'
  | 'CASO_ATUALIZADO'
  | 'RESPONSAVEL_ALTERADO'
  | 'EQUIPE_ALTERADA'
  | 'CLIENTES_ALTERADOS'
  | 'PARTE_ADICIONADA'
  | 'PARTE_ATUALIZADA'
  | 'PARTE_REMOVIDA'
  | 'PROCESSO_CADASTRADO'
  | 'PROCESSO_ATUALIZADO'
  | 'FASE_PROCESSUAL_ALTERADA'
  | 'MOVIMENTACAO_REGISTRADA'
  | 'CASO_ARQUIVADO'
  | 'CASO_REABERTO'
  | string;

export interface EstadoEventoLinhaTempoCaso {
  id: string;
  idEscritorio: string;
  idCaso: string;
  idProcesso?: string | null;
  idAutor: string;
  acao: AcaoLinhaTempoCaso;
  anterior?: Record<string, unknown> | null;
  atual: Record<string, unknown>;
  criadoEm: Date;
}

const PADRAO_UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export class EventoLinhaTempoCaso {
  readonly #id: string;
  readonly #idEscritorio: string;
  readonly #idCaso: string;
  readonly #idProcesso: string | null;
  readonly #idAutor: string;
  readonly #acao: AcaoLinhaTempoCaso;
  readonly #anterior: Record<string, unknown> | null;
  readonly #atual: Record<string, unknown>;
  readonly #criadoEm: number;

  private constructor(estado: EstadoEventoLinhaTempoCaso) {
    if (typeof estado.id !== 'string' || !PADRAO_UUID.test(estado.id)) {
      throw new ErroCasoInvalido('id');
    }
    if (typeof estado.idEscritorio !== 'string' || !PADRAO_UUID.test(estado.idEscritorio)) {
      throw new ErroCasoInvalido('idEscritorio');
    }
    if (typeof estado.idCaso !== 'string' || !PADRAO_UUID.test(estado.idCaso)) {
      throw new ErroCasoInvalido('id');
    }
    if (
      estado.idProcesso !== null &&
      estado.idProcesso !== undefined &&
      (typeof estado.idProcesso !== 'string' || !PADRAO_UUID.test(estado.idProcesso))
    ) {
      throw new ErroCasoInvalido('id');
    }
    if (typeof estado.idAutor !== 'string' || !PADRAO_UUID.test(estado.idAutor)) {
      throw new ErroCasoInvalido('id');
    }
    if (typeof estado.acao !== 'string' || estado.acao.trim().length === 0 || estado.acao.length > 40) {
      throw new ErroCasoInvalido('acao');
    }
    if (typeof estado.atual !== 'object' || estado.atual === null) {
      throw new ErroCasoInvalido('atual');
    }
    if (!(estado.criadoEm instanceof Date) || !Number.isFinite(estado.criadoEm.getTime())) {
      throw new ErroCasoInvalido('criadoEm');
    }

    this.#id = estado.id.toLowerCase();
    this.#idEscritorio = estado.idEscritorio.toLowerCase();
    this.#idCaso = estado.idCaso.toLowerCase();
    this.#idProcesso = estado.idProcesso ? estado.idProcesso.toLowerCase() : null;
    this.#idAutor = estado.idAutor.toLowerCase();
    this.#acao = estado.acao.trim();
    this.#anterior = estado.anterior ? { ...estado.anterior } : null;
    this.#atual = { ...estado.atual };
    this.#criadoEm = estado.criadoEm.getTime();
  }

  static criar(entrada: {
    idEscritorio: string;
    idCaso: string;
    idProcesso?: string | null;
    idAutor: string;
    acao: AcaoLinhaTempoCaso;
    anterior?: Record<string, unknown> | null;
    atual: Record<string, unknown>;
    id?: string;
  }): EventoLinhaTempoCaso {
    return new EventoLinhaTempoCaso({
      id: entrada.id === undefined ? randomUUID() : entrada.id,
      idEscritorio: entrada.idEscritorio,
      idCaso: entrada.idCaso,
      idProcesso: entrada.idProcesso ?? null,
      idAutor: entrada.idAutor,
      acao: entrada.acao,
      anterior: entrada.anterior ?? null,
      atual: entrada.atual,
      criadoEm: new Date(),
    });
  }

  static restaurar(estado: EstadoEventoLinhaTempoCaso): EventoLinhaTempoCaso {
    return new EventoLinhaTempoCaso(estado);
  }

  get id(): string { return this.#id; }
  get idEscritorio(): string { return this.#idEscritorio; }
  get idCaso(): string { return this.#idCaso; }
  get idProcesso(): string | null { return this.#idProcesso; }
  get idAutor(): string { return this.#idAutor; }
  get acao(): AcaoLinhaTempoCaso { return this.#acao; }
  get anterior(): Record<string, unknown> | null { return this.#anterior ? { ...this.#anterior } : null; }
  get atual(): Record<string, unknown> { return { ...this.#atual }; }
  get criadoEm(): Date { return new Date(this.#criadoEm); }
}
