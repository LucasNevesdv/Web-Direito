import { randomUUID } from 'node:crypto';
import { InvalidUserError } from './invalid-user-error.js';

export type UserStatus = 'ACTIVE';

interface UserState {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const EMAIL_LOCAL_PATTERN = /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+$/;
const EMAIL_DOMAIN_LABEL_PATTERN = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/;

export class User {
  readonly #id: string;
  readonly #name: string;
  readonly #email: string;
  readonly #passwordHash: string;
  readonly #status: UserStatus;
  readonly #createdAt: number;
  readonly #updatedAt: number;

  private constructor(state: UserState) {
    if (typeof state.id !== 'string' || !UUID_PATTERN.test(state.id)) {
      throw new InvalidUserError('id');
    }
    const name = User.normalizeName(state.name);
    const email = User.normalizeEmail(state.email);
    if (typeof state.passwordHash !== 'string' || state.passwordHash.trim().length === 0) {
      throw new InvalidUserError('passwordHash');
    }
    if (state.status !== 'ACTIVE') {
      throw new InvalidUserError('status');
    }
    if (!(state.createdAt instanceof Date) || !Number.isFinite(state.createdAt.getTime())) {
      throw new InvalidUserError('createdAt');
    }
    if (
      !(state.updatedAt instanceof Date) ||
      !Number.isFinite(state.updatedAt.getTime()) ||
      state.updatedAt.getTime() < state.createdAt.getTime()
    ) {
      throw new InvalidUserError('updatedAt');
    }

    this.#id = state.id.toLowerCase();
    this.#name = name;
    this.#email = email;
    this.#passwordHash = state.passwordHash;
    this.#status = state.status;
    this.#createdAt = state.createdAt.getTime();
    this.#updatedAt = state.updatedAt.getTime();
  }

  static normalizeName(value: string): string {
    if (typeof value !== 'string') {
      throw new InvalidUserError('name');
    }
    const name = value.trim();
    const length = Array.from(name).length;
    if (length < 2 || length > 120) {
      throw new InvalidUserError('name');
    }
    return name;
  }

  static normalizeEmail(value: string): string {
    if (typeof value !== 'string') {
      throw new InvalidUserError('email');
    }
    const email = value.trim().toLowerCase();
    const parts = email.split('@');
    const [local = '', domain = ''] = parts;
    const domainLabels = domain.split('.');
    if (
      email.length > 254 ||
      parts.length !== 2 ||
      local.length > 64 ||
      !EMAIL_LOCAL_PATTERN.test(local) ||
      local.startsWith('.') ||
      local.endsWith('.') ||
      local.includes('..') ||
      domainLabels.length < 2 ||
      !domainLabels.every((label) => EMAIL_DOMAIN_LABEL_PATTERN.test(label)) ||
      !/^[a-z]{2,}$/.test(domainLabels[domainLabels.length - 1])
    ) {
      throw new InvalidUserError('email');
    }
    return email;
  }

  static create(input: { name: string; email: string; passwordHash: string; id?: string }): User {
    const now = new Date();
    return new User({
      id: input.id === undefined ? randomUUID() : input.id,
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(state: UserState): User {
    return new User(state);
  }

  get id(): string { return this.#id; }
  get name(): string { return this.#name; }
  get email(): string { return this.#email; }
  get passwordHash(): string { return this.#passwordHash; }
  get status(): UserStatus { return this.#status; }
  get createdAt(): Date { return new Date(this.#createdAt); }
  get updatedAt(): Date { return new Date(this.#updatedAt); }
}
