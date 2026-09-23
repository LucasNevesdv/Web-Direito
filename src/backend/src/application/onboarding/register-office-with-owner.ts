import { Membership } from '../../domain/memberships/membership.js';
import { InvalidOfficeError } from '../../domain/offices/invalid-office-error.js';
import { Office, type OfficeStatus } from '../../domain/offices/office.js';
import { InvalidUserError } from '../../domain/users/invalid-user-error.js';
import { User } from '../../domain/users/user.js';
import type { PasswordHasher } from '../security/password-hasher.js';
import { EmailAlreadyRegisteredError } from './email-already-registered-error.js';
import { InvalidRegistrationError } from './invalid-registration-error.js';
import type { OfficeRegistrationRepository } from './office-registration-repository.js';

export interface RegisterOfficeInput {
  officeName: string;
  adminName: string;
  email: string;
  password: string;
}

export interface RegisterOfficeResult {
  office: {
    id: string;
    name: string;
    status: OfficeStatus;
    createdAt: Date;
    updatedAt: Date;
  };
  user: { id: string; name: string; email: string };
  role: 'OWNER';
}

export class RegisterOfficeWithOwner {
  constructor(
    private readonly repository: OfficeRegistrationRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: RegisterOfficeInput): Promise<RegisterOfficeResult> {
    let office: Office;
    let name: string;
    let email: string;
    try {
      office = Office.create({ name: input.officeName });
      name = User.normalizeName(input.adminName);
      email = User.normalizeEmail(input.email);
    } catch (error) {
      if (error instanceof InvalidOfficeError && error.field === 'name') {
        throw new InvalidRegistrationError('officeName');
      }
      if (error instanceof InvalidUserError && error.field === 'name') {
        throw new InvalidRegistrationError('adminName');
      }
      if (error instanceof InvalidUserError && error.field === 'email') {
        throw new InvalidRegistrationError('email');
      }
      throw error;
    }

    if (typeof input.password !== 'string') {
      throw new InvalidRegistrationError('password');
    }
    const passwordLength = Array.from(input.password).length;
    if (passwordLength < 12 || passwordLength > 128) {
      throw new InvalidRegistrationError('password');
    }
    if (await this.repository.emailExists(email)) {
      throw new EmailAlreadyRegisteredError();
    }

    // Hash before opening the transaction so its connection is not held during Argon2 work.
    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = User.create({ name, email, passwordHash });
    const membership = Membership.create({ officeId: office.id, userId: user.id });
    await this.repository.register({ office, user, membership });

    return {
      office: {
        id: office.id,
        name: office.name,
        status: office.status,
        createdAt: office.createdAt,
        updatedAt: office.updatedAt,
      },
      user: { id: user.id, name: user.name, email: user.email },
      role: membership.role,
    };
  }
}
