import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDbService } from '../../database/tenant-db.service';
import { Notification } from '../../entities/notification.entity';

export interface NotifyInput {
  recipientSub?: string;
  recipientRole?: string;
  type: string;
  title: string;
  body?: string;
  data?: unknown;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly db: TenantDbService) {}

  // Persists an in-app notification. Pass a manager to join an existing tenant
  // transaction. Email and push are logged for now; real channels come later.
  async notify(input: NotifyInput, manager?: EntityManager): Promise<void> {
    if (!input.recipientSub && !input.recipientRole) {
      throw new Error('A notification needs a recipient sub or role.');
    }
    const write = (m: EntityManager) =>
      m.query(
        `INSERT INTO notifications
           (tenant_id, recipient_sub, recipient_role, type, title, body, data)
         VALUES (current_setting('app.current_tenant_id')::uuid, $1, $2, $3, $4, $5, $6::jsonb)`,
        [
          input.recipientSub ?? null,
          input.recipientRole ?? null,
          input.type,
          input.title,
          input.body ?? null,
          input.data === undefined ? null : JSON.stringify(input.data),
        ],
      );

    if (manager) {
      await write(manager);
    } else {
      await this.db.withTenant(async (m) => write(m));
    }
    this.logger.log(
      `notify ${input.type} -> ${input.recipientSub ?? `role:${input.recipientRole}`}`,
    );
  }

  // Notifications addressed to the caller directly or via one of their roles.
  listForUser(sub: string | undefined, roles: string[]): Promise<Notification[]> {
    return this.db.withTenant((m) =>
      m
        .createQueryBuilder(Notification, 'n')
        .where('n.recipientSub = :sub', { sub: sub ?? '' })
        .orWhere(roles.length ? 'n.recipientRole IN (:...roles)' : '1 = 0', {
          roles,
        })
        .orderBy('n.readAt', 'ASC', 'NULLS FIRST')
        .addOrderBy('n.createdAt', 'DESC')
        .limit(50)
        .getMany(),
    );
  }

  async markRead(
    id: string,
    sub: string | undefined,
    roles: string[],
  ): Promise<void> {
    await this.db.withTenant(async (m) => {
      const n = await m.findOne(Notification, { where: { id } });
      if (!n) {
        throw new NotFoundException('Notification not found.');
      }
      const mine =
        (n.recipientSub && n.recipientSub === sub) ||
        (n.recipientRole && roles.includes(n.recipientRole));
      if (!mine) {
        throw new ForbiddenException('Not your notification.');
      }
      if (!n.readAt) {
        n.readAt = new Date();
        await m.save(n);
      }
    });
  }
}
