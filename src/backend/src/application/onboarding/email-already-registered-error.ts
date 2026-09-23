export class EmailAlreadyRegisteredError extends Error {
  readonly code = 'EMAIL_ALREADY_REGISTERED';

  constructor() {
    super('Email already registered');
    this.name = 'EmailAlreadyRegisteredError';
  }
}
