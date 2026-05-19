import { Controller, Get } from "@nestjs/common";
import { Roles } from "../auth/roles.decorator";
import { PrismaService } from "../prisma/prisma.service";

@Controller("audit")
@Roles("admin", "gestor")
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  }
}
