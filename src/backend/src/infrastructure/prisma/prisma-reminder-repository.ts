import { randomUUID } from 'node:crypto';
import type { NotificationKind, PrismaClient } from '@prisma/client';
import type { EnvioLembrete, JanelaLembretes, RepositorioLembretes } from '../../application/tasks/reminders.js';
import { dataCivil, TIPOS_NOTIFICACAO } from './task-mapper.js';

export class RepositorioLembretesPrisma implements RepositorioLembretes {
  constructor(private readonly prisma: PrismaClient) {}

  // A restrição única (destinatário, tipo, alvo, dia) torna a geração idempotente entre instâncias.
  async gerarLembretes({ hoje, limiteTarefasProximas, limitePrazosCriticos }: JanelaLembretes): Promise<number> {
    return this.prisma.$transaction(async (transacao) => {
      await transacao.$executeRaw`SET LOCAL statement_timeout = '30s'`;
      // Tarefas: aviso ao responsável no dia anterior e no dia do prazo interno, e uma vez no dia seguinte ao vencimento.
      const tarefas = await transacao.$executeRaw`
        INSERT INTO notifications (id, office_id, user_id, kind, escalated, task_id, target_id, reference_date, title, due_date, next_attempt_at, created_at)
        SELECT gen_random_uuid(), t.office_id, t.responsible_id,
          (CASE WHEN t.internal_due_date < ${hoje}::date THEN 'TASK_OVERDUE' ELSE 'TASK_DUE_SOON' END)::notification_kind,
          false, t.id, t.id, ${hoje}::date, left(t.title, 300), t.internal_due_date, clock_timestamp(), clock_timestamp()
        FROM tasks t
        JOIN offices o ON o.id = t.office_id AND o.status = 'ACTIVE'
        JOIN memberships m ON m.office_id = t.office_id AND m.user_id = t.responsible_id AND m.active
        JOIN users u ON u.id = t.responsible_id AND u.status = 'ACTIVE'
        WHERE t.status IN ('PENDING', 'IN_PROGRESS')
          AND t.internal_due_date BETWEEN ${hoje}::date - 1 AND ${limiteTarefasProximas}::date
        ON CONFLICT DO NOTHING`;
      // Prazos judiciais críticos ou vencidos: aviso diário ao responsável, escalado a proprietários e administradores.
      const prazos = await transacao.$executeRaw`
        WITH alvo AS (
          SELECT d.id, d.office_id, d.responsible_id, d.description, d.due_date FROM judicial_deadlines d
          JOIN offices o ON o.id = d.office_id AND o.status = 'ACTIVE'
          WHERE d.status = 'PENDING' AND d.due_date <= ${limitePrazosCriticos}::date
        ), destinatarios AS (
          SELECT a.id AS deadline_id, a.responsible_id AS user_id, false AS escalated FROM alvo a
          UNION
          SELECT a.id, m.user_id, true FROM alvo a
          JOIN memberships m ON m.office_id = a.office_id AND m.active AND m.role IN ('OWNER', 'ADMIN')
          WHERE m.user_id <> a.responsible_id
        )
        INSERT INTO notifications (id, office_id, user_id, kind, escalated, deadline_id, target_id, reference_date, title, due_date, next_attempt_at, created_at)
        SELECT gen_random_uuid(), a.office_id, r.user_id,
          (CASE WHEN a.due_date < ${hoje}::date THEN 'DEADLINE_OVERDUE' ELSE 'DEADLINE_CRITICAL' END)::notification_kind,
          r.escalated, a.id, a.id, ${hoje}::date, left(a.description, 300), a.due_date, clock_timestamp(), clock_timestamp()
        FROM destinatarios r
        JOIN alvo a ON a.id = r.deadline_id
        JOIN memberships m ON m.office_id = a.office_id AND m.user_id = r.user_id AND m.active
        JOIN users u ON u.id = r.user_id AND u.status = 'ACTIVE'
        ON CONFLICT DO NOTHING`;
      return tarefas + prazos;
    }, { maxWait: 5000, timeout: 40000 });
  }

  async reservarEnvios(limite: number, reservaSegundos: number): Promise<EnvioLembrete[]> {
    const idReserva = randomUUID();
    const registros = await this.prisma.$queryRaw<Array<{ id: string; kind: NotificationKind; escalated: boolean; title: string; due_date: Date;
      email_attempts: number; email: string; name: string; office_name: string; eligible: boolean }>>`
      WITH disponivel AS (
        SELECT id FROM notifications
        WHERE (email_status = 'PENDING' AND next_attempt_at <= clock_timestamp())
           OR (email_status = 'PROCESSING' AND locked_until <= clock_timestamp())
        ORDER BY next_attempt_at, id LIMIT ${limite} FOR UPDATE SKIP LOCKED
      )
      UPDATE notifications AS n SET email_status = 'PROCESSING', email_attempts = n.email_attempts + 1, lease_id = ${idReserva}::uuid,
        locked_until = clock_timestamp() + ${reservaSegundos} * interval '1 second'
      FROM disponivel, users u, offices o
      WHERE n.id = disponivel.id AND u.id = n.user_id AND o.id = n.office_id
      RETURNING n.id, n.kind, n.escalated, n.title, n.due_date, n.email_attempts, u.email, u.name, o.name AS office_name,
        (u.status = 'ACTIVE' AND o.status = 'ACTIVE' AND EXISTS (SELECT 1 FROM memberships m WHERE m.office_id = n.office_id AND m.user_id = n.user_id AND m.active)) AS eligible`;
    const inelegiveis = registros.filter((registro) => !registro.eligible).map((registro) => registro.id);
    // Quem perdeu o acesso ao escritório não recebe mais e-mails dele.
    if (inelegiveis.length) await this.prisma.notification.updateMany({ where: { id: { in: inelegiveis }, leaseId: idReserva }, data: { emailStatus: 'FAILED', leaseId: null, lockedUntil: null } });
    return registros.filter((registro) => registro.eligible).map((registro) => ({ id: registro.id, idReserva, tentativas: registro.email_attempts,
      email: registro.email, nome: registro.name, escritorio: registro.office_name, tipo: TIPOS_NOTIFICACAO[registro.kind], escalonada: registro.escalated,
      titulo: registro.title, dataLimite: dataCivil(registro.due_date) }));
  }

  async concluirEnvio(envio: EnvioLembrete): Promise<void> {
    await this.prisma.notification.updateMany({ where: { id: envio.id, leaseId: envio.idReserva, emailStatus: 'PROCESSING' },
      data: { emailStatus: 'SENT', sentAt: new Date(), leaseId: null, lockedUntil: null } });
  }

  async registrarFalha(envio: EnvioLembrete, definitiva: boolean, atrasoSegundos: number): Promise<void> {
    await this.prisma.notification.updateMany({ where: { id: envio.id, leaseId: envio.idReserva, emailStatus: 'PROCESSING' },
      data: { emailStatus: definitiva ? 'FAILED' : 'PENDING', nextAttemptAt: new Date(Date.now() + atrasoSegundos * 1000), leaseId: null, lockedUntil: null } });
  }
}
