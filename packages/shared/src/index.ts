export const quoteStatuses = [
  "DRAFT",
  "EDITING",
  "SAVED",
  "EXPORTED",
  "AI_GENERATED",
  "TECH_REVIEW",
  "APPROVED",
  "REJECTED",
  "SENT"
] as const;

export type QuoteStatus = (typeof quoteStatuses)[number];

export type UserRole = "admin" | "tecnico" | "comercial" | "gestor";

export interface AiQuoteDraft {
  scope_summary: string;
  quote_items: Array<{
    group: string;
    service: string;
    description: string;
    quantity: number;
    unit: string;
    difficulty_factor: number;
    unit_labor_price: number;
    total_labor_price: number;
    notes?: string;
  }>;
  suggested_materials: string[];
  assumptions: string[];
  risks: string[];
  recommended_questions: string[];
  confidence_level: "low" | "medium" | "high";
}
