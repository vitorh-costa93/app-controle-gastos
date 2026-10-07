import { MonthlyOccurrence, RecurrenceRule, Transaction } from "@/types/domain";
import { buildMonthOccurrences } from "./recurrence";

export type MonthRowKind = "pontual" | "recorrente" | "parcelado";

/** Uma linha do Cadastro de um mês: lançamento real ou ocorrência projetada de uma recorrência. */
export interface MonthRow {
  key: string;
  kind: MonthRowKind;
  /** null quando é só a projeção de uma regra recorrente (ainda não existe lançamento real no mês). */
  transaction: Transaction | null;
  occurrence: MonthlyOccurrence;
}

export interface MonthRowFilters {
  personId?: string;
  direction?: "income" | "expense";
  typeId?: string;
  fixedVariable?: "fixed" | "variable";
}

export function rowKind(t: { recurrenceRuleId: string | null; installmentTotal: number }): MonthRowKind {
  if (t.recurrenceRuleId) return "recorrente";
  if (t.installmentTotal > 1) return "parcelado";
  return "pontual";
}

/**
 * Tudo o que acontece no mês: lançamentos reais (já filtrados) + recorrências ativas que caem nele
 * e ainda não têm lançamento real vinculado — para o mês mostrar também o que foi cadastrado antes.
 */
export function buildMonthRows(
  month: string,
  realTransactions: Transaction[],
  activeRules: RecurrenceRule[],
  filters: MonthRowFilters,
  materializedTransactions: Transaction[] = realTransactions
): MonthRow[] {
  const materializedRules = new Set(
    materializedTransactions.map((t) => t.recurrenceRuleId).filter((id): id is string => Boolean(id))
  );

  const realRows = realTransactions.map(transactionMonthRow);

  const projectedRows = buildMonthOccurrences(month, [], activeRules)
    .filter((o) => o.recurrenceRuleId && !materializedRules.has(o.recurrenceRuleId))
    .filter(
      (o) =>
        (!filters.personId || o.personId === filters.personId) &&
        (!filters.direction || o.direction === filters.direction) &&
        (!filters.typeId || o.typeId === filters.typeId) &&
        (!filters.fixedVariable || filters.fixedVariable === "fixed")
    )
    .map<MonthRow>((o) => ({ key: o.id, kind: "recorrente", transaction: null, occurrence: o }));

  // Reais primeiro (mais recentemente cadastrados no topo, como já era), projeções depois.
  return [...realRows, ...projectedRows];
}

export function transactionMonthRow(t: Transaction): MonthRow {
  return {
    key: t.id,
    kind: rowKind(t),
    transaction: t,
    occurrence: {
      id: t.id,
      origin: "real",
      registrationDate: t.registrationDate,
      referenceMonth: t.referenceMonth,
      personId: t.personId,
      direction: t.direction,
      fixedVariable: t.fixedVariable,
      typeId: t.typeId,
      bank: t.bank,
      categoryId: t.categoryId,
      installmentCurrent: t.installmentCurrent,
      installmentTotal: t.installmentTotal,
      amountCents: t.amountCents,
      description: t.description,
      considered: t.considered,
      recurrenceRuleId: t.recurrenceRuleId,
      installmentGroupId: t.installmentGroupId,
      unplannedExcluded: t.unplannedExcluded,
    },
  };
}
