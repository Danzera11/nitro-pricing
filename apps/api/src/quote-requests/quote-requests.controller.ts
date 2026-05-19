import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthenticatedUser } from "../auth/types";
import { CreateQuoteRequestDto } from "../common/json.dto";
import { AiService } from "../ai/ai.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

@Controller("quote-requests")
export class QuoteRequestsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly audit: AuditService
  ) {}

  @Get()
  findAll() {
    return this.prisma.quoteRequest.findMany({
      include: { customer: true, requestedBy: true, quote: true },
      orderBy: { createdAt: "desc" }
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.prisma.quoteRequest.findUniqueOrThrow({
      where: { id },
      include: { customer: true, quote: { include: { items: { orderBy: { sortOrder: "asc" } } } }, aiRuns: true }
    });
  }

  @Post()
  @Roles("admin", "editor", "tecnico", "comercial", "gestor")
  async create(@Body() dto: CreateQuoteRequestDto, @CurrentUser() user: AuthenticatedUser) {
    const record = await this.prisma.quoteRequest.create({
      data: {
        ...dto,
        requestedById: user.dbUserId,
        inputVariables: (dto.inputVariables ?? {}) as Prisma.InputJsonValue
      },
      include: { customer: true }
    });
    await this.audit.record({ actor: user, entity: "quoteRequest", entityId: record.id, action: "create", afterJson: record });
    return record;
  }

  @Patch(":id")
  @Roles("admin", "editor", "tecnico", "gestor")
  async update(@Param("id") id: string, @Body() dto: Partial<CreateQuoteRequestDto>, @CurrentUser() user: AuthenticatedUser) {
    const before = await this.prisma.quoteRequest.findUniqueOrThrow({ where: { id } });
    const record = await this.prisma.quoteRequest.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        customerId: dto.customerId,
        inputVariables: dto.inputVariables as Prisma.InputJsonValue | undefined
      }
    });
    await this.audit.record({ actor: user, entity: "quoteRequest", entityId: id, action: "update", beforeJson: before, afterJson: record });
    return record;
  }

  @Post(":id/generate-ai")
  @Roles("admin", "editor", "tecnico", "gestor")
  generateAi(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ai.generateQuoteDraft(id, user);
  }
}
import { Prisma } from "@prisma/client";
