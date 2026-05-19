import { Injectable } from "@nestjs/common";

type Condition = { field: string; operator: string; value: unknown };
type RuleLike = { conditionJson: unknown; actionJson: unknown };

@Injectable()
export class RuleEngineService {
  apply(rules: RuleLike[], input: Record<string, unknown>) {
    const matches = rules.filter((rule) => this.matches(rule.conditionJson as Condition, input));
    return {
      matchedRules: matches,
      suggestedGroups: this.uniqueFlat(matches, "suggest_groups"),
      suggestedMaterials: this.uniqueFlat(matches, "suggest_materials"),
      suggestedKits: this.uniqueFlat(matches, "suggest_kits"),
      notes: this.uniqueFlat(matches, "add_notes")
    };
  }

  private matches(condition: Condition, input: Record<string, unknown>) {
    const actual = input[condition.field];
    switch (condition.operator) {
      case ">":
        return Number(actual) > Number(condition.value);
      case ">=":
        return Number(actual) >= Number(condition.value);
      case "<":
        return Number(actual) < Number(condition.value);
      case "<=":
        return Number(actual) <= Number(condition.value);
      case "==":
        return actual === condition.value;
      case "!=":
        return actual !== condition.value;
      default:
        return false;
    }
  }

  private uniqueFlat(rules: RuleLike[], key: string) {
    return [...new Set(rules.flatMap((rule) => {
      const action = rule.actionJson as Record<string, unknown>;
      const value = action[key];
      return Array.isArray(value) ? value.map(String) : [];
    }))];
  }
}
