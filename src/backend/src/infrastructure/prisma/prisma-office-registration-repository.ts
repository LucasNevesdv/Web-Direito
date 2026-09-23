import { Prisma } from '@prisma/client';
import { EmailAlreadyRegisteredError } from '../../application/onboarding/email-already-registered-error.js';
import type { OfficeRegistrationRepository } from '../../application/onboarding/office-registration-repository.js';
import { officeMapper } from './office-mapper.js';

// Only operations used by onboarding; also accepts Prisma query extensions.
interface RegistrationTransaction {
  office: { create(args: { data: Prisma.OfficeCreateInput }): Promise<unknown> };
  user: { create(args: { data: Prisma.UserCreateInput; select: { id: true } }): Promise<unknown> };
  membership: { create(args: { data: Prisma.MembershipUncheckedCreateInput }): Promise<unknown> };
}

interface RegistrationPrismaClient {
  user: {
    findUnique(args: { where: { email: string }; select: { id: true } }): Promise<{ id: string } | null>;
  };
  $transaction(
    work: (transaction: RegistrationTransaction) => Promise<void>,
    options: { maxWait: number; timeout: number },
  ): Promise<void>;
}

export class PrismaOfficeRegistrationRepository implements OfficeRegistrationRepository {
  constructor(private readonly prisma: RegistrationPrismaClient) {}

  async emailExists(email: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return user !== null;
  }

  async register({ office, user, membership }: Parameters<OfficeRegistrationRepository['register']>[0]): Promise<void> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.office.create({ data: officeMapper.toPersistence(office) });
        await transaction.user.create({
          data: {
            id: user.id,
            name: user.name,
            email: user.email,
            passwordHash: user.passwordHash,
            status: user.status,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          select: { id: true },
        });
        await transaction.membership.create({
          data: {
            id: membership.id,
            officeId: membership.officeId,
            userId: membership.userId,
            role: membership.role,
            createdAt: membership.createdAt,
          },
        });
      }, { maxWait: 5000, timeout: 10000 });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        Array.isArray(error.meta?.target) &&
        error.meta.target.includes('email')
      ) {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }
  }
}
