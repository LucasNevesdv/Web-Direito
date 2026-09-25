import { randomUUID } from 'node:crypto';
import { ErroVinculoInvalido } from './invalid-membership-error.js';

export type PapelVinculoEscritorio = 'PROPRIETARIO';

interface EstadoVinculoEscritorio {
  id: string;
  idEscritorio: string;
  idUsuario: string;
  papel: PapelVinculoEscritorio;
  criadoEm: Date;
}

const PADRAO_UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export class VinculoEscritorio {
  readonly #id: string;
  readonly #idEscritorio: string;
  readonly #idUsuario: string;
  readonly #papel: PapelVinculoEscritorio;
  readonly #criadoEm: number;

  private constructor(estado: EstadoVinculoEscritorio) {
    for (const campo of ['id', 'idEscritorio', 'idUsuario'] as const) {
      if (typeof estado[campo] !== 'string' || !PADRAO_UUID.test(estado[campo])) {
        throw new ErroVinculoInvalido(campo);
      }
    }
    if (estado.papel !== 'PROPRIETARIO') {
      throw new ErroVinculoInvalido('papel');
    }
    if (!(estado.criadoEm instanceof Date) || !Number.isFinite(estado.criadoEm.getTime())) {
      throw new ErroVinculoInvalido('criadoEm');
    }
    this.#id = estado.id.toLowerCase();
    this.#idEscritorio = estado.idEscritorio.toLowerCase();
    this.#idUsuario = estado.idUsuario.toLowerCase();
    this.#papel = estado.papel;
    this.#criadoEm = estado.criadoEm.getTime();
  }

  static criar(entrada: { idEscritorio: string; idUsuario: string; id?: string }): VinculoEscritorio {
    return new VinculoEscritorio({
      id: entrada.id === undefined ? randomUUID() : entrada.id,
      idEscritorio: entrada.idEscritorio,
      idUsuario: entrada.idUsuario,
      papel: 'PROPRIETARIO',
      criadoEm: new Date(),
    });
  }

  static restaurar(estado: EstadoVinculoEscritorio): VinculoEscritorio {
    return new VinculoEscritorio(estado);
  }

  get id(): string { return this.#id; }
  get idEscritorio(): string { return this.#idEscritorio; }
  get idUsuario(): string { return this.#idUsuario; }
  get papel(): PapelVinculoEscritorio { return this.#papel; }
  get criadoEm(): Date { return new Date(this.#criadoEm); }
}
