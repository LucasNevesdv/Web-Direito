import type { FastifyInstance } from 'fastify';
import type { RateLimiter } from '../application/security/rate-limiter.js';
import { rateLimitHook } from './rate-limit-hook.js';
import { z } from 'zod';
import { EmailAlreadyRegisteredError } from '../application/onboarding/email-already-registered-error.js';
import { InvalidRegistrationError } from '../application/onboarding/invalid-registration-error.js';
import type { RegisterOfficeWithOwner } from '../application/onboarding/register-office-with-owner.js';

const nameSchema = z.string().trim().refine((value) => {
  const length = Array.from(value).length;
  return length >= 2 && length <= 120;
});

const registrationSchema = z.object({
  officeName: nameSchema,
  adminName: nameSchema,
  email: z.string().trim().toLowerCase().max(254).email(),
  password: z.string().refine((value) => {
    const length = Array.from(value).length;
    return length >= 12 && length <= 128;
  }),
}).strict();

const fieldMessages = {
  officeName: 'Informe um nome de escritório entre 2 e 120 caracteres.',
  adminName: 'Informe um nome de responsável entre 2 e 120 caracteres.',
  email: 'Informe um e-mail válido.',
  password: 'Informe uma senha entre 12 e 128 caracteres.',
} as const;

type RegistrationField = keyof typeof fieldMessages;

function isRegistrationField(value: unknown): value is RegistrationField {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(fieldMessages, value);
}

function invalidBody(fields?: Partial<Record<RegistrationField, string>>) {
  return {
    error: 'VALIDATION_ERROR',
    message: 'Confira os dados do cadastro.',
    ...(fields && Object.keys(fields).length > 0 ? { fields } : {}),
  };
}

const publicResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['office', 'user', 'role'],
  properties: {
    office: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name', 'status', 'createdAt', 'updatedAt'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    user: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name', 'email'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        email: { type: 'string' },
      },
    },
    role: { type: 'string', enum: ['OWNER'] },
  },
} as const;

const errorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error', 'message'],
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    fields: {
      type: 'object',
      additionalProperties: false,
      properties: {
        officeName: { type: 'string' },
        adminName: { type: 'string' },
        email: { type: 'string' },
        password: { type: 'string' },
      },
    },
  },
} as const;

export function registerOnboardingRoute(
  app: FastifyInstance,
  registration: Pick<RegisterOfficeWithOwner, 'execute'>,
  limiter: RateLimiter,
): void {
  app.register(async (onboarding) => {
    onboarding.setErrorHandler((error, _request, reply) => {
      if (error instanceof EmailAlreadyRegisteredError) {
        return reply.status(409).send({
          error: 'EMAIL_ALREADY_REGISTERED',
          message: 'Este e-mail já está cadastrado.',
        });
      }

      if (error instanceof InvalidRegistrationError) {
        const fields = isRegistrationField(error.field)
          ? { [error.field]: fieldMessages[error.field] }
          : undefined;
        return reply.status(400).send(invalidBody(fields));
      }

      // Parser errors can include request fragments. Never send their messages.
      const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
        ? error.statusCode
        : undefined;
      if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
        return reply.status(400).send(invalidBody());
      }

      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Não foi possível concluir o cadastro. Tente novamente.',
      });
    });

    onboarding.post('/api/v1/onboarding', {
      onRequest: rateLimitHook(limiter, 'onboarding-ip'),
      bodyLimit: 16 * 1024,
      schema: {
        response: {
          201: publicResponseSchema,
          400: errorResponseSchema,
          409: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    }, async (request, reply) => {
      const parsed = registrationSchema.safeParse(request.body);

      if (!parsed.success) {
        const fields: Partial<Record<RegistrationField, string>> = {};
        for (const issue of parsed.error.issues) {
          const field = issue.path[0];
          if (isRegistrationField(field)) {
            fields[field] = fieldMessages[field];
          }
        }
        return reply.status(400).send(invalidBody(fields));
      }

      const result = await registration.execute(parsed.data);

      return reply.status(201).send({
        office: {
          id: result.office.id,
          name: result.office.name,
          status: result.office.status,
          createdAt: result.office.createdAt,
          updatedAt: result.office.updatedAt,
        },
        user: {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
        },
        role: result.role,
      });
    });
  });
}
