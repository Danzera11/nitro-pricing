import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../auth/types";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    actor?: AuthenticatedUser;
    entity: string;
    entityId?: string;
    action: "create" | "update" | "delete" | "generate_ai";
    beforeJson?: unknown;
    afterJson?: unknown;
    ipAddress?: string;
  }) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: params.actor?.dbUserId,
        actorEmail: params.actor?.email,
        entity: params.entity,
        entityId: params.entityId,
        action: params.action,
        beforeJson: params.beforeJson as object | undefined,
        afterJson: params.afterJson as object | undefined,
        ipAddress: params.ipAddress
      }
    });
  }
}
