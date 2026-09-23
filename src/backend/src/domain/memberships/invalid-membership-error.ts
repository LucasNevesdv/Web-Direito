export type InvalidMembershipField = 'id' | 'officeId' | 'userId' | 'role' | 'createdAt';

export class InvalidMembershipError extends Error {
  readonly code = 'INVALID_MEMBERSHIP';

  constructor(readonly field: InvalidMembershipField) {
    super(`Invalid membership field: ${field}`);
    this.name = 'InvalidMembershipError';
  }
}
