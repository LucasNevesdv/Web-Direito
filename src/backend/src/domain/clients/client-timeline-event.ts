import { randomUUID } from 'node:crypto';
import { ErroClienteInvalido } from './invalid-client-error.js';

export type AcaoLinhaTempoCliente =
  | 'CLIENTE_CRIADO'
  | 'CLIENTE_ATUALIZADO'
  | 'RESPONSAVEL_ALTERADO'
  | 'CONTATO_ADICIONADO'
  | 'CONTATO_ATUALIZADO'
  | 'CONTATO_REMOVIDO'
  | 'CLIENTE_INATIVADO'
  | 'CLIENTE_REATIVADO'
  | string;

export interface EstadoEventoLinhaTempoCliente {
  id: string;
  idEscritorio: string;
  idCliente: string;
  idAutor: string;
  acao: AcaoLinhaTempoCliente;
  anterior?: Record<string, unknown> | null;
  atual: Record<string, unknown>;
  criadoEm: Date;
}

const PADRAO_UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export class EventoLinhaTempoCliente {
  readonly #id: string;
  readonly #idEscritorio: string;
  readonly #idCliente: string;
  readonly #idAutor: string;
  readonly #acao: AcaoLinhaTempoCliente;
  readonly #anterior: Record<string, unknown> | null;
  readonly #atual: Record<string, unknown>;
  readonly #criadoEm: number;

  private constructor(estado: EstadoEventoLinhaTempoCliente) {
    if (typeof estado.id !== 'string' || !PADRAO_UUID.test(estado.id)) {
      throw new ErroClienteInvalido('id');
    }
    if (typeof estado.idEscritorio !== 'string' || !PADRAO_UUID.test(estado.idEscritorio)) {
      throw new ErroClienteInvalido('idEscritorio');
    }
    if (typeof estado.idCliente !== 'string' || !PADRAO_UUID.test(estado.idCliente)) {
      throw new ErroClienteInvalido('id');
    }
    if (typeof estado.idAutor !== 'string' || !PADRAO_UUID.test(estado.idAutor)) {
      throw new ErroClienteInvalido('id');
    }
    if (typeof estado.acao !== 'string' || estado.acao.trim().length === 0 || estado.acao.length > 40) {
      throw new ErroClienteInvalido('acao');
    }
    if (typeof estado.atual !== 'object' || estado.atual === null) {
      throw new ErroClienteInvalido('atual');
    }
    if (!(estado.criadoEm instanceof Date) || !Number.isFinite(estado.criadoEm.getTime())) {
      throw new ErroClienteInvalido('criadoEm');
    }

    this.#id = estado.id.toLowerCase();
    this.#idEscritorio = estado.idEscritorio.toLowerCase();
    this.#idCliente = estado.idCliente.toLowerCase();
    this.#idAutor = estado.idAutor.toLowerCase();
    this.#acao = estado.acao.trim();
    this.#anterior = estado.anterior ? { ...estado.anterior } : null;
    this.#atual = { ...estado.atual };
    this.#criadoEm = estado.criadoEm.getTime();
  }

  static criar(entrada: {
    idEscritorio: string;
    idCliente: string;
    idAutor: string;
    acao: AcaoLinhaTempoCliente;
    anterior?: Record<string, unknown> | null;
    atual: Record<string, unknown>;
    id?: string;
  }): EventoLinhaTempoCliente {
    return new EventoLinhaTempoCliente({
      id: entrada.id === undefined ? randomUUID() : entrada.id,
      idEscritorio: entrada.idEscritorio,
      idCliente: entrada.idCliente,
      idAutor: entrada.idAutor,
      acao: entrada.acao,
      anterior: entrada.anterior ?? null,
      atual: entrada.atual,
      criadoEm: new Date(),
    });
  }

  static restaurar(estado: EstadoEventoLinhaTempoCliente): EventoLinhaTempoCliente {
    return new EventoLinhaTempoCliente(estado);
  }

  get id(): string { return this.#id; }
  get idEscritorio(): string { return this.#idEscritorio; }
  get idCliente(): string { return this.#idCliente; }
  get idAutor(): string { return this.#idAutor; }
  get acao(): AcaoLinhaTempoCliente { return this.#acao; }
  get anterior(): Record<string, unknown> | null { return this.#anterior ? { ...this.#anterior } : null; }
  get atual(): Record<string, unknown> { return { ...this.#atual }; }
  get criadoEm(): Date { return new Date(this.#criadoEm); }
}
