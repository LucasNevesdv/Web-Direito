export type InvalidRegistrationField = 'officeName' | 'adminName' | 'email' | 'password';

export class InvalidRegistrationError extends Error {
  readonly code = 'INVALID_REGISTRATION';

  constructor(readonly field: InvalidRegistrationField) {
    super(`Invalid registration field: ${field}`);
    this.name = 'InvalidRegistrationError';
  }
}
