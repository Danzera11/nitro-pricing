import { Injectable } from "@nestjs/common";
import { AiLearningStatus, Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";

type LearningInput = {
  title: string;
  content: string;
  source?: string;
  sourceQuoteId?: string;
  evidenceJson?: Prisma.InputJsonValue;
};

@Injectable()
export class AiLearningService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.aiLearning.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });
  }

  findApprovedForContext() {
    return this.prisma.aiLearning.findMany({
      where: { status: "APPROVED", active: true },
      orderBy: { updatedAt: "desc" },
      take: 30
    });
  }

  createManual(input: LearningInput, user: AuthenticatedUser) {
    return this.prisma.aiLearning.create({
      data: {
        title: input.title,
        content: input.content,
        source: input.source ?? "manual",
        sourceQuoteId: input.sourceQuoteId,
        evidenceJson: input.evidenceJson ?? {},
        status: "APPROVED",
        active: true,
        reviewedById: user.dbUserId,
        reviewedAt: new Date()
      }
    });
  }

  async captureCandidate(input: LearningInput) {
    if (!input.content.trim()) return null;
    return this.prisma.aiLearning.create({
      data: {
        title: input.title.slice(0, 180),
        content: input.content.slice(0, 1200),
        source: input.source ?? "quote_correction",
        sourceQuoteId: input.sourceQuoteId,
        evidenceJson: input.evidenceJson ?? {},
        status: "PENDING",
        active: false
      }
    });
  }

  update(id: string, body: { title?: string; content?: string; active?: boolean; status?: AiLearningStatus }, user: AuthenticatedUser) {
    const statusChanged = body.status ? { reviewedById: user.dbUserId, reviewedAt: new Date() } : {};
    return this.prisma.aiLearning.update({
      where: { id },
      data: {
        title: body.title,
        content: body.content,
        active: body.active,
        status: body.status,
        ...statusChanged
      }
    });
  }

  approve(id: string, user: AuthenticatedUser) {
    return this.update(id, { status: "APPROVED", active: true }, user);
  }

  reject(id: string, user: AuthenticatedUser) {
    return this.update(id, { status: "REJECTED", active: false }, user);
  }

  remove(id: string) {
    return this.prisma.aiLearning.delete({ where: { id } });
  }
}
