export type InvalidOfficeField =
  | 'id'
  | 'name'
  | 'status'
  | 'createdAt'
  | 'updatedAt';

export class InvalidOfficeError extends Error {
  readonly code = 'INVALID_OFFICE';

  constructor(readonly field: InvalidOfficeField) {
    super(`Invalid office field: ${field}`);
    this.name = 'InvalidOfficeError';
  }
}
