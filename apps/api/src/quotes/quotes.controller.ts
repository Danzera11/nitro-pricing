import { Body, Controller, Delete, Get, Param, Patch, Post, Res } from "@nestjs/common";
import { Prisma, QuoteStatus } from "@prisma/client";
import { Response } from "express";
import { AiLearningService } from "../ai-learning/ai-learning.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { AuthenticatedUser } from "../auth/types";
import { AuditService } from "../audit/audit.service";
import { UpdateQuoteItemDto } from "../common/json.dto";
import { PrismaService } from "../prisma/prisma.service";

type QuoteForPdf = Prisma.QuoteGetPayload<{
  include: { request: { include: { customer: true; requestedBy: true } }; items: true };
}>;

type QuoteMaterialDto = {
  id?: string;
  category?: string;
  name?: string;
  material?: string;
  quantity?: number;
  unit?: string;
  status?: "obrigatório" | "recomendado" | "opcional";
  technicalJustification?: string;
  notes?: string;
  source?: string;
  relatedService?: string;
};

type QuoteMaterialRecord = Required<Pick<QuoteMaterialDto, "id" | "name" | "quantity" | "unit">> & Omit<QuoteMaterialDto, "id" | "name" | "quantity" | "unit">;

@Controller("quotes")
export class QuotesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly learning: AiLearningService
  ) {}

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.prisma.quote.findUniqueOrThrow({
      where: { id },
      include: { request: { include: { customer: true } }, items: { orderBy: { sortOrder: "asc" } } }
    });
  }

  @Patch(":id/status")
  @Roles("admin", "editor", "tecnico", "comercial", "gestor")
  async updateStatus(@Param("id") id: string, @Body() body: { status: QuoteStatus }, @CurrentUser() user: AuthenticatedUser) {
    const before = await this.prisma.quote.findUniqueOrThrow({ where: { id } });
    const record = await this.prisma.quote.update({ where: { id }, data: { status: body.status } });
    await this.audit.record({ actor: user, entity: "quote", entityId: id, action: "update", beforeJson: before, afterJson: record });
    return record;
  }

  @Post(":id/duplicate")
  @Roles("admin", "editor", "visualizador", "tecnico", "comercial", "gestor")
  async duplicate(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const quote = await this.prisma.quote.findUniqueOrThrow({
      where: { id },
      include: { request: true, items: { orderBy: { sortOrder: "asc" } } }
    });
    const request = await this.prisma.quoteRequest.create({
      data: {
        customerId: quote.request.customerId,
        requestedById: user.dbUserId,
        title: `${quote.request.title} (cópia)`,
        description: quote.request.description,
        inputVariables: quote.request.inputVariables as Prisma.InputJsonValue,
        status: "QUOTED"
      }
    });
    const duplicated = await this.prisma.quote.create({
      data: {
        requestId: request.id,
        quoteNumber: await this.nextQuoteNumber(),
        status: "DRAFT",
        scopeSummary: quote.scopeSummary,
        assumptions: quote.assumptions,
        risks: quote.risks,
        suggestedMaterials: quote.suggestedMaterials as Prisma.InputJsonValue,
        confidence: quote.confidence,
        totalLaborPrice: quote.totalLaborPrice,
        items: {
          create: quote.items.map((item) => ({
            groupCode: item.groupCode,
            serviceId: item.serviceId,
            serviceName: item.serviceName,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            difficultyFactor: item.difficultyFactor,
            unitLaborPrice: item.unitLaborPrice,
            totalLaborPrice: item.totalLaborPrice,
            notes: item.notes,
            sortOrder: item.sortOrder
          }))
        }
      },
      include: { request: { include: { customer: true } }, items: { orderBy: { sortOrder: "asc" } } }
    });
    await this.audit.record({ actor: user, entity: "quote", entityId: duplicated.id, action: "create", afterJson: duplicated });
    return duplicated;
  }

  @Delete(":id")
  @Roles("admin", "gestor")
  async remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    const before = await this.prisma.quote.findUniqueOrThrow({ where: { id }, include: { items: true } });
    const record = await this.prisma.quote.delete({ where: { id } });
    await this.audit.record({ actor: user, entity: "quote", entityId: id, action: "delete", beforeJson: before });
    return record;
  }

  @Get(":id/export.pdf")
  @Roles("admin", "editor", "visualizador", "tecnico", "comercial", "gestor")
  async exportPdf(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Res() response: Response) {
    const quote = await this.prisma.quote.findUniqueOrThrow({
      where: { id },
      include: { request: { include: { customer: true, requestedBy: true } }, items: { orderBy: { sortOrder: "asc" } } }
    });
    if (this.canMarkExported(user)) {
      await this.prisma.quote.update({ where: { id }, data: { status: "EXPORTED", exportedAt: new Date() } });
    }
    const pdf = this.buildSimplePdf(quote);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename=\"nitro-pricing-${quote.quoteNumber ?? id}.pdf\"`);
    response.send(pdf);
  }

  @Post(":quoteId/items")
  @Roles("admin", "editor", "tecnico", "gestor")
  async addItem(@Param("quoteId") quoteId: string, @Body() dto: UpdateQuoteItemDto, @CurrentUser() user: AuthenticatedUser) {
    const quantity = dto.quantity ?? 1;
    const difficultyFactor = dto.difficultyFactor ?? 1;
    const unitLaborPrice = dto.unitLaborPrice ?? 0;
    const record = await this.prisma.quoteItem.create({
      data: {
        quoteId,
        groupCode: dto.groupCode ?? "MANUTENCAO",
        serviceName: dto.serviceName ?? "Item manual",
        description: dto.description ?? "Item adicionado manualmente.",
        quantity,
        unit: dto.unit ?? "hora",
        difficultyFactor,
        unitLaborPrice,
        totalLaborPrice: quantity * difficultyFactor * unitLaborPrice,
        notes: dto.notes,
        sortOrder: await this.nextSortOrder(quoteId)
      }
    });
    await this.recalculateQuoteTotal(quoteId);
    await this.audit.record({ actor: user, entity: "quoteItem", entityId: record.id, action: "create", afterJson: record });
    await this.captureQuoteLearning(quoteId, "Serviço adicionado manualmente", `Ao revisar um orçamento, foi adicionado o serviço "${record.serviceName}" no grupo ${record.groupCode}, com quantidade ${record.quantity} ${record.unit} e valor unitário de mão de obra ${record.unitLaborPrice}.`, { action: "create_service", after: record });
    return record;
  }

  @Patch(":quoteId/items/:itemId")
  @Roles("admin", "editor", "tecnico", "gestor")
  async updateItem(
    @Param("quoteId") quoteId: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateQuoteItemDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const before = await this.prisma.quoteItem.findUniqueOrThrow({ where: { id: itemId } });
    const quantity = dto.quantity ?? Number(before.quantity);
    const difficultyFactor = dto.difficultyFactor ?? Number(before.difficultyFactor);
    const unitLaborPrice = dto.unitLaborPrice ?? Number(before.unitLaborPrice);
    const record = await this.prisma.quoteItem.update({
      where: { id: itemId },
      data: {
        ...dto,
        totalLaborPrice: new Prisma.Decimal(quantity * difficultyFactor * unitLaborPrice)
      }
    });
    await this.recalculateQuoteTotal(quoteId);
    await this.audit.record({ actor: user, entity: "quoteItem", entityId: itemId, action: "update", beforeJson: before, afterJson: record });
    await this.captureQuoteLearning(quoteId, "Serviço ajustado na revisão", `Ao revisar um orçamento, o serviço "${record.serviceName}" foi ajustado. Considere esse padrão quando escopos semelhantes aparecerem, validando quantidade, unidade, dificuldade e valor de mão de obra.`, { action: "update_service", before, after: record });
    return record;
  }

  @Delete(":quoteId/items/:itemId")
  @Roles("admin", "editor", "tecnico", "gestor")
  async removeItem(@Param("quoteId") quoteId: string, @Param("itemId") itemId: string, @CurrentUser() user: AuthenticatedUser) {
    const before = await this.prisma.quoteItem.findUniqueOrThrow({ where: { id: itemId } });
    const record = await this.prisma.quoteItem.delete({ where: { id: itemId } });
    await this.recalculateQuoteTotal(quoteId);
    await this.audit.record({ actor: user, entity: "quoteItem", entityId: itemId, action: "delete", beforeJson: before });
    await this.captureQuoteLearning(quoteId, "Serviço removido na revisão", `Ao revisar um orçamento, o serviço "${before.serviceName}" foi removido. Em escopos semelhantes, confirme se esse serviço é realmente necessário antes de sugerir.`, { action: "delete_service", before });
    return record;
  }

  @Post(":quoteId/materials")
  @Roles("admin", "editor", "tecnico", "gestor")
  async addMaterial(@Param("quoteId") quoteId: string, @Body() dto: QuoteMaterialDto, @CurrentUser() user: AuthenticatedUser) {
    const quote = await this.prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    const materials = this.normalizeMaterials(quote.suggestedMaterials);
    const record = this.normalizeMaterial({ ...dto, id: this.materialId(), name: dto.name ?? dto.material ?? "Material manual" });
    const updated = await this.prisma.quote.update({
      where: { id: quoteId },
      data: { suggestedMaterials: [...materials, record] as unknown as Prisma.InputJsonValue },
      include: { request: { include: { customer: true } }, items: { orderBy: { sortOrder: "asc" } } }
    });
    await this.audit.record({ actor: user, entity: "quoteMaterial", entityId: record.id, action: "create", afterJson: record });
    await this.captureQuoteLearning(quoteId, "Material sugerido manualmente", `Ao revisar um orçamento, foi incluído o material "${record.name}" como ${record.status ?? "recomendado"}, com quantidade ${record.quantity} ${record.unit}. Materiais não têm preço e devem aparecer apenas como sugestão técnica.`, { action: "create_material", after: record });
    return updated;
  }

  @Patch(":quoteId/materials/:materialKey")
  @Roles("admin", "editor", "tecnico", "gestor")
  async updateMaterial(
    @Param("quoteId") quoteId: string,
    @Param("materialKey") materialKey: string,
    @Body() dto: QuoteMaterialDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    const quote = await this.prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    const materials = this.normalizeMaterials(quote.suggestedMaterials);
    const index = this.materialIndex(materials, materialKey);
    const before = materials[index];
    materials[index] = this.normalizeMaterial({ ...before, ...dto, id: before.id });
    const updated = await this.prisma.quote.update({
      where: { id: quoteId },
      data: { suggestedMaterials: materials as unknown as Prisma.InputJsonValue },
      include: { request: { include: { customer: true } }, items: { orderBy: { sortOrder: "asc" } } }
    });
    await this.audit.record({ actor: user, entity: "quoteMaterial", entityId: before.id, action: "update", beforeJson: before, afterJson: materials[index] });
    await this.captureQuoteLearning(quoteId, "Material ajustado na revisão", `Ao revisar um orçamento, o material "${materials[index].name}" foi ajustado. Use esse padrão para melhorar quantidades, unidade, obrigatoriedade e justificativa técnica em escopos semelhantes.`, { action: "update_material", before, after: materials[index] });
    return updated;
  }

  @Delete(":quoteId/materials/:materialKey")
  @Roles("admin", "editor", "tecnico", "gestor")
  async removeMaterial(@Param("quoteId") quoteId: string, @Param("materialKey") materialKey: string, @CurrentUser() user: AuthenticatedUser) {
    const quote = await this.prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    const materials = this.normalizeMaterials(quote.suggestedMaterials);
    const index = this.materialIndex(materials, materialKey);
    const [before] = materials.splice(index, 1);
    const updated = await this.prisma.quote.update({
      where: { id: quoteId },
      data: { suggestedMaterials: materials as unknown as Prisma.InputJsonValue },
      include: { request: { include: { customer: true } }, items: { orderBy: { sortOrder: "asc" } } }
    });
    await this.audit.record({ actor: user, entity: "quoteMaterial", entityId: before.id, action: "delete", beforeJson: before });
    await this.captureQuoteLearning(quoteId, "Material removido na revisão", `Ao revisar um orçamento, o material "${before.name}" foi removido. Em escopos semelhantes, confirme se esse material deve mesmo ser sugerido antes de incluir.`, { action: "delete_material", before });
    return updated;
  }

  private async captureQuoteLearning(quoteId: string, title: string, content: string, evidenceJson: Prisma.InputJsonValue) {
    await this.learning.captureCandidate({
      title,
      content,
      source: "quote_correction",
      sourceQuoteId: quoteId,
      evidenceJson: JSON.parse(JSON.stringify(evidenceJson)) as Prisma.InputJsonValue
    });
  }

  private async recalculateQuoteTotal(quoteId: string) {
    const items = await this.prisma.quoteItem.findMany({ where: { quoteId } });
    const total = items.reduce((sum, item) => sum + Number(item.totalLaborPrice), 0);
    await this.prisma.quote.update({ where: { id: quoteId }, data: { totalLaborPrice: total } });
  }

  private async nextSortOrder(quoteId: string) {
    const last = await this.prisma.quoteItem.findFirst({ where: { quoteId }, orderBy: { sortOrder: "desc" } });
    return (last?.sortOrder ?? 0) + 1;
  }

  private async nextQuoteNumber() {
    const year = new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    const count = await this.prisma.quote.count({ where: { createdAt: { gte: start, lt: end } } });
    return `NP-${year}-${String(count + 1).padStart(4, "0")}`;
  }

  private canMarkExported(user: AuthenticatedUser) {
    return user.roles.some((role) => ["admin", "editor", "tecnico", "comercial", "gestor"].includes(role));
  }

  private normalizeMaterials(value: Prisma.JsonValue): QuoteMaterialRecord[] {
    const raw = Array.isArray(value) ? value : [];
    return raw.map((item, index) => this.normalizeMaterial({ ...(item as QuoteMaterialDto), id: (item as QuoteMaterialDto).id ?? `mat-${index + 1}` }));
  }

  private normalizeMaterial(item: QuoteMaterialDto): QuoteMaterialRecord {
    return {
      id: item.id ?? this.materialId(),
      category: item.category ?? "Material",
      name: item.name ?? item.material ?? "Material",
      quantity: Number(item.quantity ?? 1),
      unit: item.unit ?? "unidade",
      status: item.status ?? "recomendado",
      technicalJustification: item.technicalJustification ?? item.source ?? "Material sugerido para execução técnica.",
      notes: item.notes ?? "",
      source: item.source ?? item.relatedService ?? "Sugerido pela IA",
      relatedService: item.relatedService ?? item.source ?? "Sugerido pela IA"
    };
  }

  private materialIndex(materials: QuoteMaterialRecord[], key: string) {
    const byId = materials.findIndex((item) => item.id === key);
    if (byId >= 0) return byId;
    const byIndex = Number(key);
    if (Number.isInteger(byIndex) && byIndex >= 0 && byIndex < materials.length) return byIndex;
    throw new Error("Material não encontrado.");
  }

  private materialId() {
    return `mat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private buildSimplePdf(quote: QuoteForPdf) {
    const materials = this.normalizeMaterials(quote.suggestedMaterials);
    return this.professionalPdf(quote, materials);
  }

  private professionalPdf(quote: QuoteForPdf, materials: QuoteMaterialRecord[]) {
    const safe = (value: string) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const byteLength = (value: string) => Buffer.byteLength(value, "latin1");
    const brl = (value: unknown) => Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const validUntil = new Date(quote.createdAt);
    validUntil.setDate(validUntil.getDate() + 7);
    const commands: string[] = [];
    const text = (x: number, y: number, value: string, size = 9, font = "F1") => commands.push(`BT /${font} ${size} Tf ${x} ${y} Td (${safe(value).slice(0, 115)}) Tj ET`);
    const fill = (x: number, y: number, w: number, h: number, color: string) => commands.push(`${color} rg ${x} ${y} ${w} ${h} re f 0 0 0 rg`);
    const stroke = (x: number, y: number, w: number, h: number, color = "0.86 0.89 0.94") => commands.push(`${color} RG ${x} ${y} ${w} ${h} re S 0 0 0 RG`);
    const section = (label: string, y: number) => {
      fill(42, y - 7, 528, 22, "0.94 0.97 1");
      text(52, y, label, 11, "F2");
    };

    fill(0, 762, 612, 80, "0.05 0.09 0.16");
    fill(42, 792, 34, 34, "0.14 0.38 0.91");
    commands.push("1 1 1 rg");
    text(49, 805, "NP", 10, "F2");
    text(88, 812, "Nitro Pricing", 21, "F2");
    text(88, 792, "Documento comercial interno para revisao tecnica", 9);
    text(420, 812, quote.quoteNumber ?? "NP sem numero", 14, "F2");
    text(420, 794, `Status: ${quote.status}`, 9);
    commands.push("0 0 0 rg");

    fill(42, 710, 528, 36, "0.98 0.99 1");
    stroke(42, 710, 528, 36);
    text(54, 731, `Cliente: ${quote.request.customer.name}`, 10, "F2");
    text(54, 717, `Data: ${quote.createdAt.toLocaleDateString("pt-BR")}`, 8);
    text(170, 717, `Validade: ${validUntil.toLocaleDateString("pt-BR")}`, 8);
    text(310, 717, `Responsavel: ${quote.request.requestedBy?.name ?? "Equipe Nitro"}`, 8);

    section("Resumo executivo", 684);
    text(52, 662, quote.scopeSummary ?? quote.request.title, 9);

    const cardY = 606;
    [
      ["Servicos", String(quote.items.length)],
      ["Materiais", String(materials.length)],
      ["Total mao de obra", brl(quote.totalLaborPrice)]
    ].forEach(([label, value], index) => {
      const x = 42 + index * 176;
      fill(x, cardY, 160, 44, "0.98 0.99 1");
      stroke(x, cardY, 160, 44);
      text(x + 12, cardY + 27, label, 8);
      text(x + 12, cardY + 10, value, 12, "F2");
    });

    section("Servicos e mao de obra", 576);
    let y = 550;
    fill(42, y - 4, 528, 18, "0.90 0.93 0.98");
    text(50, y, "Servico", 8, "F2");
    text(270, y, "Qtd.", 8, "F2");
    text(320, y, "Un.", 8, "F2");
    text(374, y, "Unit.", 8, "F2");
    text(460, y, "Total", 8, "F2");
    y -= 22;
    for (const item of quote.items.slice(0, 11)) {
      text(50, y, `${item.groupCode} - ${item.serviceName}`, 8);
      text(270, y, String(Number(item.quantity)), 8);
      text(320, y, item.unit, 8);
      text(374, y, brl(item.unitLaborPrice), 8);
      text(460, y, brl(item.totalLaborPrice), 8, "F2");
      y -= 16;
    }

    y -= 12;
    section("Materiais sugeridos sem valor financeiro", y);
    y -= 26;
    fill(42, y - 4, 528, 18, "0.90 0.93 0.98");
    text(50, y, "Material", 8, "F2");
    text(250, y, "Qtd.", 8, "F2");
    text(300, y, "Un.", 8, "F2");
    text(350, y, "Status", 8, "F2");
    text(430, y, "Relacao", 8, "F2");
    y -= 22;
    for (const material of materials.slice(0, 9)) {
      text(50, y, material.name, 8);
      text(250, y, String(material.quantity), 8);
      text(300, y, material.unit, 8);
      text(350, y, material.status ?? "recomendado", 8);
      text(430, y, material.relatedService ?? material.source ?? "-", 8);
      y -= 16;
    }

    y -= 10;
    section("Premissas, riscos e exclusoes", y);
    y -= 22;
    text(52, y, "Premissas:", 8, "F2");
    y -= 13;
    for (const item of quote.assumptions.slice(0, 4)) { text(62, y, `- ${item}`, 7); y -= 12; }
    y -= 3;
    text(52, y, "Riscos:", 8, "F2");
    y -= 13;
    for (const item of quote.risks.slice(0, 4)) { text(62, y, `- ${item}`, 7); y -= 12; }
    y -= 3;
    text(52, y, "Exclusoes: materiais, equipamentos, dispositivos, locacoes e servicos fora do escopo nao compoem o total financeiro.", 7, "F2");

    fill(0, 0, 612, 44, "0.96 0.97 0.99");
    text(42, 24, "Este orçamento possui caráter comercial preliminar e poderá sofrer adequações após levantamento técnico executivo.", 8, "F2");
    text(42, 11, "Uso interno Nitro Pricing. Materiais sugeridos não possuem valor financeiro neste documento.", 7);
    const content = commands.join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      `<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(byteLength(pdf));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf, "latin1");
  }
}
