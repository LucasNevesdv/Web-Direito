import { EmailAlreadyRegisteredError } from '../../src/application/onboarding/email-already-registered-error.js';
import type {
  OfficeRegistration,
  OfficeRegistrationRepository,
} from '../../src/application/onboarding/office-registration-repository.js';

export class InMemoryOfficeRegistrationRepository implements OfficeRegistrationRepository {
  readonly registrations: OfficeRegistration[] = [];

  async emailExists(email: string): Promise<boolean> {
    return this.registrations.some(({ user }) => user.email === email);
  }

  async register(registration: OfficeRegistration): Promise<void> {
    // Keep the uniqueness check and write synchronous to model an atomic commit in the fake.
    if (this.registrations.some(({ user }) => user.email === registration.user.email)) {
      throw new EmailAlreadyRegisteredError();
    }
    this.registrations.push(registration);
  }
}
