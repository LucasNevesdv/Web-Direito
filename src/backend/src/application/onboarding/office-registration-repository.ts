import type { Membership } from '../../domain/memberships/membership.js';
import type { Office } from '../../domain/offices/office.js';
import type { User } from '../../domain/users/user.js';

export interface OfficeRegistration {
  office: Office;
  user: User;
  membership: Membership;
}

export interface OfficeRegistrationRepository {
  emailExists(email: string): Promise<boolean>;
  /** Persist all three entities atomically, or leave all of them unpersisted. */
  register(data: OfficeRegistration): Promise<void>;
}
