import type { MonthlyOccurrence } from "@/types/domain";

export type ConferenceFilters = { bank: string; category: string; includeProjected: boolean };

/** O total do banco ignora apenas a categoria; o detalhamento usa a mesma base. */
export function conferenceScope(transactions: MonthlyOccurrence[], filters: ConferenceFilters, personId = "") {
  const bankRows = transactions.filter((item) => item.considered && item.direction === "expense"
    && (!personId || item.personId === personId)
    && (filters.includeProjected || item.origin === "real")
    && (filters.bank === "all" || (item.bank ?? "none") === filters.bank));
  const rows = bankRows.filter((item) => filters.category === "all" || (item.categoryId ?? "none") === filters.category);
  const categories = new Map<string, number>();
  for (const item of bankRows) {
    const key = item.categoryId ?? "none";
    categories.set(key, (categories.get(key) ?? 0) + item.amountCents);
  }
  return { bankRows, rows, bankTotalCents: bankRows.reduce((sum, item) => sum + item.amountCents, 0), totalCents: rows.reduce((sum, item) => sum + item.amountCents, 0), categories: [...categories].map(([id, amountCents]) => ({ id, amountCents })).sort((a, b) => b.amountCents - a.amountCents) };
}
