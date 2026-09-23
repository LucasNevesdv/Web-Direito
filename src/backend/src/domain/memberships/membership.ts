import { randomUUID } from 'node:crypto';
import { InvalidMembershipError } from './invalid-membership-error.js';

export type MembershipRole = 'OWNER';

interface MembershipState {
  id: string;
  officeId: string;
  userId: string;
  role: MembershipRole;
  createdAt: Date;
}

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export class Membership {
  readonly #id: string;
  readonly #officeId: string;
  readonly #userId: string;
  readonly #role: MembershipRole;
  readonly #createdAt: number;

  private constructor(state: MembershipState) {
    for (const field of ['id', 'officeId', 'userId'] as const) {
      if (typeof state[field] !== 'string' || !UUID_PATTERN.test(state[field])) {
        throw new InvalidMembershipError(field);
      }
    }
    if (state.role !== 'OWNER') {
      throw new InvalidMembershipError('role');
    }
    if (!(state.createdAt instanceof Date) || !Number.isFinite(state.createdAt.getTime())) {
      throw new InvalidMembershipError('createdAt');
    }
    this.#id = state.id.toLowerCase();
    this.#officeId = state.officeId.toLowerCase();
    this.#userId = state.userId.toLowerCase();
    this.#role = state.role;
    this.#createdAt = state.createdAt.getTime();
  }

  static create(input: { officeId: string; userId: string; id?: string }): Membership {
    return new Membership({
      id: input.id === undefined ? randomUUID() : input.id,
      officeId: input.officeId,
      userId: input.userId,
      role: 'OWNER',
      createdAt: new Date(),
    });
  }

  static restore(state: MembershipState): Membership {
    return new Membership(state);
  }

  get id(): string { return this.#id; }
  get officeId(): string { return this.#officeId; }
  get userId(): string { return this.#userId; }
  get role(): MembershipRole { return this.#role; }
  get createdAt(): Date { return new Date(this.#createdAt); }
}
