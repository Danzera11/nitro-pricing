import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_AI_PROMPT } from "./default-prompt";

@Injectable()
export class AiPromptsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.aiPrompt.findMany({ orderBy: [{ active: "desc" }, { updatedAt: "desc" }] });
  }

  async getActive() {
    const active = await this.prisma.aiPrompt.findFirst({ where: { active: true }, orderBy: { version: "desc" } });
    if (active) return active;
    return this.prisma.aiPrompt.create({
      data: {
        name: "Prompt padrão Nitro Pricing",
        content: DEFAULT_AI_PROMPT,
        active: true,
        version: 1
      }
    });
  }

  async saveActive(body: { name: string; content: string; active?: boolean }) {
    const current = await this.getActive();
    await this.prisma.aiPrompt.update({ where: { id: current.id }, data: { active: false } });
    return this.prisma.aiPrompt.create({
      data: {
        name: body.name,
        content: body.content,
        active: body.active ?? true,
        version: current.version + 1
      }
    });
  }

  async restoreDefault() {
    const current = await this.getActive();
    await this.prisma.aiPrompt.updateMany({ where: { active: true }, data: { active: false } });
    return this.prisma.aiPrompt.create({
      data: {
        name: "Prompt padrão Nitro Pricing",
        content: DEFAULT_AI_PROMPT,
        active: true,
        version: current.version + 1
      }
    });
  }
}
