import { randomUUID } from 'node:crypto';
import { ErroEscritorioInvalido } from './invalid-office-error.js';

export type SituacaoEscritorio = 'ATIVO' | 'INATIVO';

interface EstadoEscritorio {
  id: string;
  nome: string;
  situacao: SituacaoEscritorio;
  criadoEm: Date;
  atualizadoEm: Date;
}

const PADRAO_UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export class Escritorio {
  readonly #id: string;
  readonly #nome: string;
  readonly #situacao: SituacaoEscritorio;
  readonly #criadoEm: number;
  readonly #atualizadoEm: number;

  private constructor(estado: EstadoEscritorio) {
    if (typeof estado.id !== 'string' || !PADRAO_UUID.test(estado.id)) {
      throw new ErroEscritorioInvalido('id');
    }
    if (typeof estado.nome !== 'string') {
      throw new ErroEscritorioInvalido('nome');
    }
    const nome = estado.nome.trim();
    // PostgreSQL varchar limits characters rather than UTF-16 code units.
    const tamanhoNome = Array.from(nome).length;
    if (tamanhoNome < 2 || tamanhoNome > 120) {
      throw new ErroEscritorioInvalido('nome');
    }
    if (estado.situacao !== 'ATIVO' && estado.situacao !== 'INATIVO') {
      throw new ErroEscritorioInvalido('situacao');
    }
    if (!(estado.criadoEm instanceof Date) || !Number.isFinite(estado.criadoEm.getTime())) {
      throw new ErroEscritorioInvalido('criadoEm');
    }
    if (
      !(estado.atualizadoEm instanceof Date) ||
      !Number.isFinite(estado.atualizadoEm.getTime()) ||
      estado.atualizadoEm.getTime() < estado.criadoEm.getTime()
    ) {
      throw new ErroEscritorioInvalido('atualizadoEm');
    }

    this.#id = estado.id.toLowerCase();
    this.#nome = nome;
    this.#situacao = estado.situacao;
    this.#criadoEm = estado.criadoEm.getTime();
    this.#atualizadoEm = estado.atualizadoEm.getTime();
  }

  static criar(entrada: { nome: string; id?: string }): Escritorio {
    const agora = new Date();
    return new Escritorio({
      id: entrada.id === undefined ? randomUUID() : entrada.id,
      nome: entrada.nome,
      situacao: 'ATIVO',
      criadoEm: agora,
      atualizadoEm: agora,
    });
  }

  static restaurar(estado: EstadoEscritorio): Escritorio {
    return new Escritorio(estado);
  }

  get id(): string {
    return this.#id;
  }

  get nome(): string {
    return this.#nome;
  }

  get situacao(): SituacaoEscritorio {
    return this.#situacao;
  }

  get criadoEm(): Date {
    return new Date(this.#criadoEm);
  }

  get atualizadoEm(): Date {
    return new Date(this.#atualizadoEm);
  }
}
