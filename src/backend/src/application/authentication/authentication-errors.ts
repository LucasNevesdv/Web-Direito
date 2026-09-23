export class InvalidCredentialsError extends Error {
  constructor() { super('Invalid credentials'); this.name = 'InvalidCredentialsError'; }
}
export class InactiveUserError extends Error {
  constructor() { super('Inactive user'); this.name = 'InactiveUserError'; }
}
export class InactiveOfficeError extends Error {
  constructor() { super('No active office membership'); this.name = 'InactiveOfficeError'; }
}
export class MultipleActiveOfficesError extends Error {
  constructor() { super('Office selection is not available'); this.name = 'MultipleActiveOfficesError'; }
}
export class InvalidAccessTokenError extends Error {
  constructor() { super('Invalid authenticated session'); this.name = 'InvalidAccessTokenError'; }
}
