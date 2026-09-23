export type InvalidUserField =
  | 'id'
  | 'name'
  | 'email'
  | 'passwordHash'
  | 'status'
  | 'createdAt'
  | 'updatedAt';

export class InvalidUserError extends Error {
  readonly code = 'INVALID_USER';

  constructor(readonly field: InvalidUserField) {
    super(`Invalid user field: ${field}`);
    this.name = 'InvalidUserError';
  }
}
