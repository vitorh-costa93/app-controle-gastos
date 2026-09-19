import { MonthlyOccurrence, MonthSummary } from "@/types/domain";

/** Sobra mensal = entradas consideradas - saídas consideradas. Ignora não considerados. */
export function summarizeMonth(
  referenceMonth: string,
  occurrences: MonthlyOccurrence[]
): MonthSummary {
  const considered = occurrences.filter((o) => o.considered);
  const incomeCents = considered
    .filter((o) => o.direction === "income")
    .reduce((sum, o) => sum + o.amountCents, 0);
  const expenseCents = considered
    .filter((o) => o.direction === "expense")
    .reduce((sum, o) => sum + o.amountCents, 0);

  return {
    referenceMonth,
    incomeCents,
    expenseCents,
    leftoverCents: incomeCents - expenseCents,
  };
}

/**
 * Saldo acumulado mês a mês: saldo anterior + entradas do mês - saídas do mês.
 * Quando `baselineMonth` é informado, o saldo acumulado NESSE mês é travado em
 * `startingBalanceCents` (o saldo real já fechado), ignorando a sobra calculada
 * para ele — e só a partir do mês seguinte volta a somar a sobra normalmente.
 */
export function accumulateBalance(
  monthSummaries: MonthSummary[],
  startingBalanceCents = 0,
  baselineMonth?: string
): { referenceMonth: string; accumulatedCents: number }[] {
  let running = baselineMonth ? 0 : startingBalanceCents;
  return monthSummaries.map((summary) => {
    if (summary.referenceMonth === baselineMonth) {
      running = startingBalanceCents;
    } else {
      running += summary.leftoverCents;
    }
    return { referenceMonth: summary.referenceMonth, accumulatedCents: running };
  });
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  amountCents: number;
  percent: number;
}

export function breakdownByCategory(
  occurrences: MonthlyOccurrence[],
  direction: "income" | "expense" = "expense"
): CategoryBreakdownItem[] {
  const considered = occurrences.filter((o) => o.considered && o.direction === direction);
  const total = considered.reduce((sum, o) => sum + o.amountCents, 0);

  const byCategory = new Map<string | null, number>();
  for (const o of considered) {
    byCategory.set(o.categoryId, (byCategory.get(o.categoryId) ?? 0) + o.amountCents);
  }

  return Array.from(byCategory.entries())
    .map(([categoryId, amountCents]) => ({
      categoryId,
      amountCents,
      percent: total > 0 ? (amountCents / total) * 100 : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

export function breakdownByKey<K extends "typeId" | "personId">(
  occurrences: MonthlyOccurrence[],
  key: K,
  direction: "income" | "expense" = "expense"
): { key: string | null; amountCents: number; percent: number }[] {
  const considered = occurrences.filter((o) => o.considered && o.direction === direction);
  const total = considered.reduce((sum, o) => sum + o.amountCents, 0);

  const grouped = new Map<string | null, number>();
  for (const o of considered) {
    const k = o[key];
    grouped.set(k, (grouped.get(k) ?? 0) + o.amountCents);
  }

  return Array.from(grouped.entries())
    .map(([k, amountCents]) => ({
      key: k,
      amountCents,
      percent: total > 0 ? (amountCents / total) * 100 : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);
}
