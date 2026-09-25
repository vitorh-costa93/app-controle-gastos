import { MonthlyOccurrence } from "@/types/domain";
import { CategoryBreakdownItem } from "./finance";

/** Como a renda de um mês se divide entre gastos fixos, parcelas e gastos variáveis (só saídas consideradas). */
export interface MonthCommitment {
  referenceMonth: string;
  incomeCents: number;
  fixedCents: number;
  installmentCents: number;
  variableCents: number;
}

export function computeCommitment(referenceMonth: string, occurrences: MonthlyOccurrence[]): MonthCommitment {
  const considered = occurrences.filter((o) => o.considered);
  const incomeCents = considered.filter((o) => o.direction === "income").reduce((s, o) => s + o.amountCents, 0);
  let fixedCents = 0;
  let installmentCents = 0;
  let variableCents = 0;
  for (const o of considered) {
    if (o.direction !== "expense") continue;
    if (o.installmentTotal > 1) installmentCents += o.amountCents;
    else if (o.fixedVariable === "fixed") fixedCents += o.amountCents;
    else variableCents += o.amountCents;
  }
  return { referenceMonth, incomeCents, fixedCents, installmentCents, variableCents };
}

export interface CategoryChange {
  categoryId: string | null;
  currentCents: number;
  averageCents: number;
  deltaCents: number;
  /** null quando a média anterior é zero (categoria nova). */
  deltaPercent: number | null;
}

/** Diferença de cada categoria no mês contra a média dos meses anteriores informados. */
export function computeCategoryChanges(
  current: CategoryBreakdownItem[],
  previousMonths: CategoryBreakdownItem[][]
): CategoryChange[] {
  if (previousMonths.length === 0) return [];
  const ids = new Set<string | null>([...current.map((c) => c.categoryId), ...previousMonths.flat().map((c) => c.categoryId)]);
  const changes: CategoryChange[] = [];
  for (const categoryId of ids) {
    const currentCents = current.find((c) => c.categoryId === categoryId)?.amountCents ?? 0;
    const previousTotal = previousMonths.reduce(
      (sum, month) => sum + (month.find((c) => c.categoryId === categoryId)?.amountCents ?? 0),
      0
    );
    const averageCents = Math.round(previousTotal / previousMonths.length);
    const deltaCents = currentCents - averageCents;
    if (deltaCents === 0) continue;
    changes.push({
      categoryId,
      currentCents,
      averageCents,
      deltaCents,
      deltaPercent: averageCents > 0 ? (deltaCents / averageCents) * 100 : null,
    });
  }
  return changes.sort((a, b) => b.deltaCents - a.deltaCents);
}
