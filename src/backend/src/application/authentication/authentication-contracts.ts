import type { Session } from '../../domain/sessions/session.js';
import type { User } from '../../domain/users/user.js';

export interface AuthenticationAccount {
  user: User;
  memberships: { office: { id: string; name: string; status: 'ACTIVE' | 'INACTIVE' }; role: 'OWNER' }[];
}

export interface AuthenticationRepository {
  findByEmail(email: string): Promise<AuthenticationAccount | null>;
  createSession(session: Session): Promise<void>;
  findSession(id: string): Promise<{ session: Session; account: AuthenticationAccount } | null>;
}

export interface AccessClaims {
  userId: string;
  sessionId: string;
  activeOfficeId: string;
  role: 'OWNER';
}

export interface AccessTokens {
  sign(claims: AccessClaims): Promise<string>;
  verify(token: string): Promise<AccessClaims>;
}

export interface RefreshTokens {
  generate(): { token: string; hash: string };
}

export interface PublicIdentity {
  user: { id: string; name: string; email: string };
  office: { id: string; name: string; role: 'OWNER' };
}

export function publicIdentity(account: AuthenticationAccount, officeId: string): PublicIdentity {
  const membership = account.memberships.find((item) => item.office.id === officeId)!;
  return {
    user: { id: account.user.id, name: account.user.name, email: account.user.email },
    office: { id: membership.office.id, name: membership.office.name, role: membership.role },
  };
}
