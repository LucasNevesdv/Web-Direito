import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuthenticationAccount, AuthenticationRepository } from '../../application/authentication/authentication-contracts.js';
import { Session } from '../../domain/sessions/session.js';
import { User } from '../../domain/users/user.js';

const accountInclude = { memberships: { include: { office: true } } } satisfies Prisma.UserInclude;
type AccountRecord = Prisma.UserGetPayload<{ include: typeof accountInclude }>;

function toAccount(record: AccountRecord): AuthenticationAccount {
  return {
    user: User.restore(record),
    memberships: record.memberships.map(({ office, role }) => ({
      office: { id: office.id, name: office.name, status: office.status }, role,
    })),
  };
}

export class PrismaAuthenticationRepository implements AuthenticationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<AuthenticationAccount | null> {
    const record = await this.prisma.user.findUnique({ where: { email }, include: accountInclude });
    return record ? toAccount(record) : null;
  }

  async createSession(session: Session): Promise<void> {
    await this.prisma.session.create({ data: session.toPersistence(), select: { id: true } });
  }

  async findSession(id: string) {
    const record = await this.prisma.session.findUnique({
      where: { id }, include: { user: { include: accountInclude } },
    });
    return record ? { session: Session.restore(record), account: toAccount(record.user) } : null;
  }
}
