import { randomUUID } from 'node:crypto';
import { InvalidOfficeError } from './invalid-office-error.js';

export type OfficeStatus = 'ACTIVE' | 'INACTIVE';

interface OfficeState {
  id: string;
  name: string;
  status: OfficeStatus;
  createdAt: Date;
  updatedAt: Date;
}

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export class Office {
  readonly #id: string;
  readonly #name: string;
  readonly #status: OfficeStatus;
  readonly #createdAt: number;
  readonly #updatedAt: number;

  private constructor(state: OfficeState) {
    if (typeof state.id !== 'string' || !UUID_PATTERN.test(state.id)) {
      throw new InvalidOfficeError('id');
    }
    if (typeof state.name !== 'string') {
      throw new InvalidOfficeError('name');
    }
    const name = state.name.trim();
    // PostgreSQL varchar limits characters rather than UTF-16 code units.
    const nameLength = Array.from(name).length;
    if (nameLength < 2 || nameLength > 120) {
      throw new InvalidOfficeError('name');
    }
    if (state.status !== 'ACTIVE' && state.status !== 'INACTIVE') {
      throw new InvalidOfficeError('status');
    }
    if (!(state.createdAt instanceof Date) || !Number.isFinite(state.createdAt.getTime())) {
      throw new InvalidOfficeError('createdAt');
    }
    if (
      !(state.updatedAt instanceof Date) ||
      !Number.isFinite(state.updatedAt.getTime()) ||
      state.updatedAt.getTime() < state.createdAt.getTime()
    ) {
      throw new InvalidOfficeError('updatedAt');
    }

    this.#id = state.id.toLowerCase();
    this.#name = name;
    this.#status = state.status;
    this.#createdAt = state.createdAt.getTime();
    this.#updatedAt = state.updatedAt.getTime();
  }

  static create(input: { name: string; id?: string }): Office {
    const now = new Date();
    return new Office({
      id: input.id === undefined ? randomUUID() : input.id,
      name: input.name,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(state: OfficeState): Office {
    return new Office(state);
  }

  get id(): string {
    return this.#id;
  }

  get name(): string {
    return this.#name;
  }

  get status(): OfficeStatus {
    return this.#status;
  }

  get createdAt(): Date {
    return new Date(this.#createdAt);
  }

  get updatedAt(): Date {
    return new Date(this.#updatedAt);
  }
}
