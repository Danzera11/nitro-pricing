import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { AiQuoteDraft } from "@powerquote/shared";
import OpenAI from "openai";
import { AiPromptsService } from "../ai-prompts/ai-prompts.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../auth/types";
import { RuleEngineService } from "../common/rule-engine.service";
import { PrismaService } from "../prisma/prisma.service";

type ServiceContext = Array<{ code: string; name: string; description: string | null; unit: string; baseLaborPrice: Prisma.Decimal; group: { code: string } }>;
type UnitContext = Array<{ code: string; name: string; description: string; example: string | null }>;

@Injectable()
export class AiService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly rules: RuleEngineService,
    private readonly audit: AuditService,
    private readonly prompts: AiPromptsService
  ) {}

  async generateQuoteDraft(quoteRequestId: string, user: AuthenticatedUser) {
    const quoteRequest = await this.prisma.quoteRequest.findUniqueOrThrow({
      where: { id: quoteRequestId },
      include: { customer: true }
    });
    const [services, materials, activeRules, units] = await Promise.all([
      this.prisma.service.findMany({ where: { active: true }, include: { group: true } }),
      this.prisma.suggestedMaterial.findMany({ where: { active: true }, include: { group: true } }),
      this.prisma.rule.findMany({ where: { active: true } }),
      this.prisma.unit.findMany({ where: { active: true }, orderBy: { name: "asc" } })
    ]);
    const kits = await this.prisma.materialKit.findMany({ where: { active: true }, include: { group: true, service: true } });
    const activePrompt = await this.prompts.getActive();
    const requestVariables = { always: true, ...(quoteRequest.inputVariables as Record<string, unknown>) };
    const ruleResult = this.rules.apply(activeRules, requestVariables);
    const matchedKitItems = kits
      .filter((kit) => ruleResult.suggestedKits.includes(kit.code))
      .flatMap((kit) => this.extractKitMaterialNames(kit.itemsJson));

    const generationInput = {
      description: quoteRequest.description,
      inputVariables: requestVariables,
      services,
      materials: [...materials.map((material) => material.name), ...ruleResult.suggestedMaterials, ...matchedKitItems],
      units,
      kits,
      rules: activeRules,
      ruleNotes: ruleResult.notes,
      systemPrompt: activePrompt.content
    };
    let provider = "mock";
    let response: AiQuoteDraft;

    if (this.config.get<string>("OPENAI_API_KEY")) {
      try {
        response = await this.generateWithProvider(generationInput);
        provider = "openai";
      } catch (error) {
        response = this.generateProviderFallback(generationInput, error);
        provider = "mock_fallback";
      }
    } else {
      response = this.generateMockDraft({
          description: quoteRequest.description,
          inputVariables: quoteRequest.inputVariables as Record<string, unknown>,
          services,
          materials: [...materials.map((material) => material.name), ...ruleResult.suggestedMaterials, ...matchedKitItems],
          ruleNotes: ruleResult.notes
        });
    }

    const suggestedMaterials = this.calculateMaterials(response, kits);
    const aiRun = await this.prisma.aiRun.create({
      data: {
        quoteRequestId,
        provider,
        model: this.config.get<string>("OPENAI_MODEL") ?? "mock",
        promptSnapshot: {
          quoteRequest,
          activePrompt: { id: activePrompt.id, name: activePrompt.name, version: activePrompt.version },
          services: services.map((service) => ({ code: service.code, name: service.name, group: service.group.code })),
          units: units.map((unit) => ({
            code: unit.code,
            name: unit.name,
            description: unit.description,
            example: unit.example
          })),
          materials: materials.map((material) => material.name),
          kits: kits.map((kit) => ({
            code: kit.code,
            name: kit.name,
            group: kit.group?.code,
            service: kit.service?.name,
            items: kit.itemsJson
          })),
          rules: activeRules
        },
        responseJson: response as unknown as Prisma.InputJsonValue,
        assumptions: response.assumptions,
        risks: response.risks,
        confidenceLevel: response.confidence_level
      }
    });

    const quote = await this.persistQuote(quoteRequestId, response, suggestedMaterials);
    await this.prisma.quoteRequest.update({ where: { id: quoteRequestId }, data: { status: "QUOTED" } });
    await this.audit.record({ actor: user, entity: "quoteRequest", entityId: quoteRequestId, action: "generate_ai", afterJson: { aiRun, quote } });
    return { aiRun, quote, response };
  }

  private extractKitMaterialNames(itemsJson: unknown) {
    const items = (itemsJson as { items?: Array<{ material?: string }> }).items ?? [];
    return items.map((item) => item.material).filter((value): value is string => Boolean(value));
  }

  private async generateWithProvider(input: {
    description: string;
    inputVariables: Record<string, unknown>;
    services: ServiceContext;
    materials: string[];
    units: UnitContext;
    kits: Array<{ code: string; name: string; itemsJson: Prisma.JsonValue; group?: { code: string } | null; service?: { name: string } | null }>;
    rules: Array<{ code: string; name: string; conditionJson: Prisma.JsonValue; actionJson: Prisma.JsonValue }>;
    ruleNotes: string[];
    systemPrompt: string;
  }): Promise<AiQuoteDraft> {
    const client = new OpenAI({ apiKey: this.config.getOrThrow<string>("OPENAI_API_KEY") });
    const model = this.config.get<string>("OPENAI_MODEL") ?? "gpt-4.1-mini";
    const allowedGroups = [...new Set(input.services.map((service) => service.group.code))];
    const allowedUnits = input.units.map((unit) => unit.code);
    const allowedServices = input.services.map((service) => ({
      code: service.code,
      group: service.group.code,
      name: service.name,
      description: service.description,
      unit: service.unit,
      unit_labor_price: Number(service.baseLaborPrice)
    }));

    const response = await client.responses.create({
        model,
        input: [
          {
            role: "system",
            content: [
              input.systemPrompt,
              "Responda sempre em JSON estruturado conforme o schema.",
              "Use somente grupos, servicos, unidades, materiais, kits e regras fornecidos no contexto.",
              "Escolha os servicos cadastrados pela descricao de uso, grupo, unidade e valor base. Priorize a melhor estrategia operacional, nao apenas o primeiro item encontrado.",
              "Se houver mais de um servico possivel, combine itens de mao de obra coerentes e explique a premissa.",
              "Nao invente certeza: se faltar informacao, registre em assumptions, risks ou recommended_questions.",
              "O orcamento e focado em mao de obra. Materiais sao apenas sugeridos, sem preco.",
              "Calcule total_labor_price como quantity * difficulty_factor * unit_labor_price."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({
              quote_request: {
                description: input.description,
                variables: input.inputVariables
              },
              allowed_groups: allowedGroups,
              allowed_units: allowedUnits,
              allowed_services: allowedServices,
              suggested_materials_catalog: [...new Set(input.materials)],
              material_kits: input.kits.map((kit) => ({
                code: kit.code,
                name: kit.name,
                group: kit.group?.code,
                linked_service: kit.service?.name,
                items: kit.itemsJson
              })),
              rules: input.rules.map((rule) => ({
                code: rule.code,
                name: rule.name,
                condition: rule.conditionJson,
                action: rule.actionJson
              })),
              rule_notes_already_applied: input.ruleNotes
            })
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "nitro_pricing_draft",
            strict: true,
            schema: this.quoteDraftSchema()
          }
        },
        max_output_tokens: 3000
    });

    const parsed = JSON.parse(response.output_text) as AiQuoteDraft;
    return this.sanitizeProviderDraft(parsed, input.services, input.units);
  }

  private generateProviderFallback(
    input: {
      description: string;
      inputVariables: Record<string, unknown>;
      services: ServiceContext;
      materials: string[];
      ruleNotes: string[];
    },
    error: unknown
  ): AiQuoteDraft {
    return {
      ...this.generateMockDraft(input),
      assumptions: [
        ...input.ruleNotes,
        "A chamada real de IA falhou e o sistema usou o motor local de fallback para manter o fluxo operacional."
      ],
      risks: [
        "A estimativa foi mantida com motor local de fallback. Recomenda-se revisão técnica antes de salvar."
      ],
      confidence_level: "low"
    };
  }

  private generateMockDraft(input: {
    description: string;
    inputVariables: Record<string, unknown>;
    services: ServiceContext;
    materials: string[];
    ruleNotes: string[];
  }): AiQuoteDraft {
    const cameras = Number(input.inputVariables.camera_quantity ?? 4);
    const networkPoints = Number(input.inputVariables.network_points ?? cameras);
    const cftv = input.services.find((service) => service.group.code === "CFTV");
    const cabling = input.services.find((service) => service.group.code === "CABEAMENTO");
    const rack = input.services.find((service) => service.group.code === "RACK");
    const items = [
      this.item(cftv, cameras, "Instalacao e alinhamento de cameras IP conforme escopo informado."),
      this.item(cabling, Math.max(networkPoints, cameras), "Lancamento e organizacao de pontos de rede para CFTV."),
      ...(cameras > 8 && rack ? [this.item(rack, 4, "Organizacao de rack tecnico, patching e acomodacao dos equipamentos.")] : [])
    ];
    return {
      scope_summary: `Orcamento preliminar de mao de obra para ${input.description}. Estimativa baseada nas variaveis cadastradas e regras internas.`,
      quote_items: items,
      suggested_materials: [...new Set(["Camera IP", "Cabo UTP", "Conectores RJ45", ...input.materials.filter((name) => cameras > 8 || !["Rack", "Switch", "Patch Panel", "Nobreak"].includes(name))])],
      assumptions: [
        "Infraestrutura existente permite passagem de cabos sem obra civil pesada.",
        "Materiais serao precificados fora deste MVP.",
        ...input.ruleNotes
      ],
      risks: [
        "Altura, distancia real e interferencias fisicas podem alterar a produtividade.",
        "Falta de planta baixa ou vistoria pode exigir revisao do quantitativo."
      ],
      recommended_questions: [
        "Existe planta baixa com os pontos desejados?",
        "Ha rack existente e energia estabilizada no local?",
        "O trabalho sera feito em horario comercial ou janela especial?"
      ],
      confidence_level: cameras > 8 ? "medium" : "high"
    };
  }

  private item(service: { name: string; unit: string; baseLaborPrice: Prisma.Decimal; group: { code: string } } | undefined, quantity: number, description: string) {
    const unitLaborPrice = Number(service?.baseLaborPrice ?? 120);
    const difficulty = quantity > 8 ? 1.15 : 1;
    return {
      group: service?.group.code ?? "MANUTENCAO",
      service: service?.name ?? "Servico tecnico estimado",
      description,
      quantity,
      unit: service?.unit ?? "hora",
      difficulty_factor: difficulty,
      unit_labor_price: unitLaborPrice,
      total_labor_price: Number((quantity * difficulty * unitLaborPrice).toFixed(2)),
      notes: quantity > 8 ? "Aplicado fator de dificuldade por volume." : undefined
    };
  }

  private sanitizeProviderDraft(draft: AiQuoteDraft, services: ServiceContext, units: UnitContext): AiQuoteDraft {
    const allowedGroupCodes = new Set(services.map((service) => service.group.code));
    const allowedUnits = new Set(units.map((unit) => unit.code));
    const serviceByName = new Map(services.map((service) => [service.name.toLowerCase(), service]));
    const assumptions = [...draft.assumptions];
    const quoteItems = draft.quote_items.map((item) => {
      const knownService = serviceByName.get(item.service.toLowerCase());
      const group = allowedGroupCodes.has(item.group) ? item.group : knownService?.group.code ?? "MANUTENCAO";
      const unit = allowedUnits.has(item.unit) ? item.unit : knownService?.unit ?? "hora";
      if (group !== item.group) assumptions.push(`Grupo ajustado para ${group} porque a IA sugeriu um grupo fora da base.`);
      if (unit !== item.unit) assumptions.push(`Unidade ajustada para ${unit} porque a IA sugeriu uma unidade fora da base.`);
      const quantity = Number(item.quantity || 1);
      const difficulty = Number(item.difficulty_factor || 1);
      const unitLaborPrice = Number(item.unit_labor_price || knownService?.baseLaborPrice || 0);
      return {
        ...item,
        group,
        unit,
        quantity,
        difficulty_factor: difficulty,
        unit_labor_price: unitLaborPrice,
        total_labor_price: Number((quantity * difficulty * unitLaborPrice).toFixed(2))
      };
    });
    return { ...draft, quote_items: quoteItems, assumptions: [...new Set(assumptions)] };
  }

  private quoteDraftSchema() {
    return {
      type: "object",
      additionalProperties: false,
      required: [
        "scope_summary",
        "quote_items",
        "suggested_materials",
        "assumptions",
        "risks",
        "recommended_questions",
        "confidence_level"
      ],
      properties: {
        scope_summary: { type: "string" },
        quote_items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "group",
              "service",
              "description",
              "quantity",
              "unit",
              "difficulty_factor",
              "unit_labor_price",
              "total_labor_price",
              "notes"
            ],
            properties: {
              group: { type: "string" },
              service: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              difficulty_factor: { type: "number" },
              unit_labor_price: { type: "number" },
              total_labor_price: { type: "number" },
              notes: { type: "string" }
            }
          }
        },
        suggested_materials: { type: "array", items: { type: "string" } },
        assumptions: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        recommended_questions: { type: "array", items: { type: "string" } },
        confidence_level: { type: "string", enum: ["low", "medium", "high"] }
      }
    };
  }

  private calculateMaterials(
    draft: AiQuoteDraft,
    kits: Array<{ name: string; itemsJson: Prisma.JsonValue; group?: { code: string } | null; service?: { name: string } | null }>
  ) {
    const totals = new Map<string, { id: string; category: string; name: string; unit: string; quantity: number; status: "obrigatório" | "recomendado" | "opcional"; technicalJustification: string; notes: string; source: string; relatedService: string }>();
    for (const quoteItem of draft.quote_items) {
      const matchingKits = kits.filter((kit) => {
        const serviceMatches = kit.service?.name && kit.service.name.toLowerCase() === quoteItem.service.toLowerCase();
        const groupMatches = kit.group?.code && kit.group.code === quoteItem.group;
        return serviceMatches || groupMatches;
      });
      for (const kit of matchingKits) {
        const kitItems = (kit.itemsJson as { items?: Array<{ material?: string; unit?: string; quantity_per_service?: number; quantity_formula?: string }> }).items ?? [];
        for (const material of kitItems) {
          if (!material.material) continue;
          const perService = Number(material.quantity_per_service ?? this.quantityFromFormula(material.quantity_formula) ?? 1);
          const quantity = Number(quoteItem.quantity) * perService;
          const key = `${material.material}:${material.unit ?? "unidade"}`;
          const current = totals.get(key) ?? {
            id: this.materialId(material.material, material.unit ?? "unidade"),
            category: quoteItem.group,
            name: material.material,
            unit: material.unit ?? "unidade",
            quantity: 0,
            status: "recomendado",
            technicalJustification: `Material sugerido pelo kit ${kit.name} para execução de ${quoteItem.service}.`,
            notes: "",
            source: kit.name,
            relatedService: quoteItem.service
          };
          current.quantity += quantity;
          totals.set(key, current);
        }
      }
    }
    for (const material of draft.suggested_materials) {
      if ([...totals.values()].some((item) => item.name.toLowerCase() === material.toLowerCase())) continue;
      totals.set(`${material}:unidade`, {
        id: this.materialId(material, "unidade"),
        category: "Material",
        name: material,
        unit: "unidade",
        quantity: 1,
        status: "opcional",
        technicalJustification: "Material sugerido pela IA para validação técnica.",
        notes: "Quantidade inicial para conferência.",
        source: "Sugerido pela IA",
        relatedService: "Escopo geral"
      });
    }
    return [...totals.values()].map((item) => ({ ...item, quantity: Number(item.quantity.toFixed(2)) }));
  }

  private materialId(name: string, unit: string) {
    return `mat-${Buffer.from(`${name}-${unit}`).toString("base64url").slice(0, 16).toLowerCase()}`;
  }

  private quantityFromFormula(formula?: string) {
    if (!formula) return undefined;
    const multiplier = formula.match(/\*\s*(\d+(?:\.\d+)?)/);
    return multiplier ? Number(multiplier[1]) : 1;
  }

  private async persistQuote(quoteRequestId: string, draft: AiQuoteDraft, suggestedMaterials: Prisma.InputJsonValue) {
    const total = draft.quote_items.reduce((sum, item) => sum + item.total_labor_price, 0);
    const existing = await this.prisma.quote.findUnique({ where: { requestId: quoteRequestId } });
    const quoteNumber = existing?.quoteNumber ?? await this.nextQuoteNumber();
    await this.prisma.quote.upsert({
      where: { requestId: quoteRequestId },
      update: {
        quoteNumber,
        status: "AI_GENERATED",
        scopeSummary: draft.scope_summary,
        assumptions: draft.assumptions,
        risks: draft.risks,
        suggestedMaterials: suggestedMaterials as unknown as Prisma.InputJsonValue,
        confidence: draft.confidence_level,
        totalLaborPrice: total,
        items: { deleteMany: {} }
      },
      create: {
        requestId: quoteRequestId,
        quoteNumber,
        status: "AI_GENERATED",
        scopeSummary: draft.scope_summary,
        assumptions: draft.assumptions,
        risks: draft.risks,
        suggestedMaterials: suggestedMaterials as unknown as Prisma.InputJsonValue,
        confidence: draft.confidence_level,
        totalLaborPrice: total
      }
    });
    const quote = await this.prisma.quote.findUniqueOrThrow({ where: { requestId: quoteRequestId } });
    await this.prisma.quoteItem.createMany({
      data: draft.quote_items.map((item, index) => ({
        quoteId: quote.id,
        groupCode: item.group,
        serviceName: item.service,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        difficultyFactor: item.difficulty_factor,
        unitLaborPrice: item.unit_labor_price,
        totalLaborPrice: item.total_labor_price,
        notes: item.notes,
        sortOrder: index + 1
      }))
    });
    return this.prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: { items: { orderBy: { sortOrder: "asc" } }, request: { include: { customer: true } } }
    });
  }

  private async nextQuoteNumber() {
    const year = new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    const count = await this.prisma.quote.count({ where: { createdAt: { gte: start, lt: end } } });
    return `NP-${year}-${String(count + 1).padStart(4, "0")}`;
  }
}
