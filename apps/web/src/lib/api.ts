export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Erro HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export type Customer = { id: string; name: string; contactName?: string };
export type Group = { id: string; code: string; name: string; description?: string; active: boolean };
export type Service = { id: string; code: string; name: string; description?: string; unit: string; baseLaborPrice: string; group?: Group };
export type Unit = { id: string; code: string; name: string; description: string; example?: string; active: boolean };
export type Material = { id: string; name: string; unit?: string; group?: Group };
export type MaterialKit = { id: string; code: string; name: string; description?: string; itemsJson: { items?: Array<{ material: string; quantity_formula?: string; unit?: string }> }; group?: Group; active: boolean };
export type Variable = { id: string; key: string; label: string; type: string; unit?: string; required: boolean };
export type Rule = { id: string; code: string; name: string; conditionJson: unknown; actionJson: unknown; active: boolean };
export type QuoteMaterial = {
  id?: string;
  category?: string;
  name: string;
  material?: string;
  quantity: number;
  unit: string;
  status?: "obrigatório" | "recomendado" | "opcional";
  technicalJustification?: string;
  notes?: string;
  source?: string;
  relatedService?: string;
};
export type QuoteItem = {
  id: string;
  groupCode: string;
  serviceName: string;
  description: string;
  quantity: string;
  unit: string;
  difficultyFactor: string;
  unitLaborPrice: string;
  totalLaborPrice: string;
  notes?: string;
};
export type Quote = {
  id: string;
  quoteNumber?: string;
  status: string;
  scopeSummary?: string;
  assumptions: string[];
  risks: string[];
  suggestedMaterials: QuoteMaterial[];
  totalLaborPrice: string;
  exportedAt?: string;
  createdAt?: string;
  items: QuoteItem[];
  request?: QuoteRequest;
};
export type QuoteRequest = {
  id: string;
  title: string;
  description: string;
  status: string;
  inputVariables: Record<string, unknown>;
  customer: Customer;
  quote?: Quote;
  createdAt: string;
};
export type AiPrompt = { id: string; name: string; content: string; active: boolean; version: number; updatedAt: string };
