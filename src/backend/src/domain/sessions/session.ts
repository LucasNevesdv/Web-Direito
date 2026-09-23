import { randomUUID } from 'node:crypto';

export interface SessionState {
  id: string;
  userId: string;
  activeOfficeId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
}

export class InvalidSessionError extends Error {
  readonly code = 'INVALID_SESSION';
  constructor(readonly field: keyof SessionState) {
    super(`Invalid session field: ${field}`);
    this.name = 'InvalidSessionError';
  }
}

export class Session {
  readonly #state: SessionState;

  private constructor(state: SessionState) {
    for (const field of ['id', 'userId', 'activeOfficeId'] as const) {
      if (typeof state[field] !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(state[field])) {
        throw new InvalidSessionError(field);
      }
    }
    if (typeof state.refreshTokenHash !== 'string' || !/^[a-f\d]{64}$/.test(state.refreshTokenHash)) {
      throw new InvalidSessionError('refreshTokenHash');
    }
    for (const field of ['createdAt', 'updatedAt', 'expiresAt', 'revokedAt', 'lastUsedAt'] as const) {
      const value = state[field];
      if ((field === 'revokedAt' || field === 'lastUsedAt') && value === null) continue;
      if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new InvalidSessionError(field);
      if (field !== 'createdAt' && value < state.createdAt) throw new InvalidSessionError(field);
    }
    if (state.expiresAt <= state.createdAt) throw new InvalidSessionError('expiresAt');
    this.#state = structuredClone({
      id: state.id, userId: state.userId, activeOfficeId: state.activeOfficeId,
      refreshTokenHash: state.refreshTokenHash, expiresAt: state.expiresAt,
      createdAt: state.createdAt, updatedAt: state.updatedAt,
      revokedAt: state.revokedAt, lastUsedAt: state.lastUsedAt,
    });
  }

  static create(input: { userId: string; activeOfficeId: string; refreshTokenHash: string; expiresAt: Date; now?: Date }): Session {
    const now = input.now ?? new Date();
    return new Session({
      id: randomUUID(), userId: input.userId, activeOfficeId: input.activeOfficeId,
      refreshTokenHash: input.refreshTokenHash, expiresAt: input.expiresAt,
      createdAt: now, updatedAt: now, revokedAt: null, lastUsedAt: null,
    });
  }

  static restore(state: SessionState): Session { return new Session(state); }
  get id(): string { return this.#state.id; }
  get userId(): string { return this.#state.userId; }
  get activeOfficeId(): string { return this.#state.activeOfficeId; }
  get expiresAt(): Date { return new Date(this.#state.expiresAt); }
  isActive(now: Date): boolean { return this.#state.revokedAt === null && this.#state.expiresAt > now; }
  toPersistence(): SessionState { return structuredClone(this.#state); }
}
