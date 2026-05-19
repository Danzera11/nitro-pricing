import { Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";

type PrismaDelegate = {
  findMany(args?: unknown): Promise<unknown[]>;
  findUnique(args: unknown): Promise<unknown | null>;
  create(args: unknown): Promise<{ id?: string } & Record<string, unknown>>;
  update(args: unknown): Promise<{ id?: string } & Record<string, unknown>>;
  delete(args: unknown): Promise<{ id?: string } & Record<string, unknown>>;
};

@Injectable()
export class CrudService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  findMany(model: keyof PrismaService, args?: unknown) {
    return this.delegate(model).findMany(args);
  }

  async findOne(model: keyof PrismaService, id: string, args?: Record<string, unknown>) {
    const record = await this.delegate(model).findUnique({ where: { id }, ...args });
    if (!record) throw new NotFoundException(`${String(model)} not found`);
    return record;
  }

  async create(model: keyof PrismaService, data: unknown, actor: AuthenticatedUser) {
    const record = await this.delegate(model).create({ data });
    await this.audit.record({ actor, entity: String(model), entityId: record.id, action: "create", afterJson: record });
    return record;
  }

  async update(model: keyof PrismaService, id: string, data: unknown, actor: AuthenticatedUser) {
    const before = await this.findOne(model, id);
    const record = await this.delegate(model).update({ where: { id }, data });
    await this.audit.record({ actor, entity: String(model), entityId: id, action: "update", beforeJson: before, afterJson: record });
    return record;
  }

  async remove(model: keyof PrismaService, id: string, actor: AuthenticatedUser) {
    const before = await this.findOne(model, id);
    const record = await this.delegate(model).delete({ where: { id } });
    await this.audit.record({ actor, entity: String(model), entityId: id, action: "delete", beforeJson: before });
    return record;
  }

  private delegate(model: keyof PrismaService): PrismaDelegate {
    return this.prisma[model] as unknown as PrismaDelegate;
  }
}
