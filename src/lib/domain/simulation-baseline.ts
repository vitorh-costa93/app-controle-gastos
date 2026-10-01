import { MonthlyOccurrence, RecurrenceRule, Transaction } from "@/types/domain";
import { buildMonthOccurrences } from "./recurrence";
import { isUnplannedExpense } from "./insights";

/** Gasto variável estimado por mês (config. "Gastos estimados" ou, sem ela, a média dos meses fechados). */
export interface MonthlyEstimate {
  id: string;
  label: string;
  personId: string;
  categoryId: string | null;
  typeId: string | null;
  amountCents: number;
}

/** Mês ainda não fechado: o mês atual e os seguintes. Só depois que ele fecha entra o valor real. */
export function isOpenMonth(month: string, currentMonth: string): boolean {
  return month >= currentMonth;
}

/**
 * Ocorrências de um mês para a base da Simulação. Meses fechados usam só dados reais (como Análise).
 * Meses abertos mantêm o que já é compromisso (fixos/recorrências, parcelas, entradas) mas trocam o gasto
 * variável avulso — que ainda está incompleto, ou zerado — pelo gasto estimado.
 */
export function buildSimulationMonthOccurrences(args: {
  month: string;
  currentMonth: string;
  transactions: Transaction[];
  rules: RecurrenceRule[];
  salaryOccurrences: MonthlyOccurrence[];
  estimates: MonthlyEstimate[];
}): MonthlyOccurrence[] {
  const { month, currentMonth, transactions, rules, salaryOccurrences, estimates } = args;
  const occurrences = buildMonthOccurrences(month, transactions, rules);
  if (!isOpenMonth(month, currentMonth)) return [...occurrences, ...salaryOccurrences];

  const committed = occurrences.filter((o) => !isUnplannedExpense(o));
  const estimated = estimates
    .filter((e) => e.amountCents > 0)
    .map<MonthlyOccurrence>((e) => ({
      id: `estimate:${e.id}:${month}`,
      origin: "projected",
      registrationDate: `${month}-01`,
      referenceMonth: month,
      personId: e.personId,
      direction: "expense",
      fixedVariable: "variable",
      typeId: e.typeId,
      categoryId: e.categoryId,
      installmentCurrent: 1,
      installmentTotal: 1,
      amountCents: e.amountCents,
      description: `${e.label} (estimado)`,
      considered: true,
      recurrenceRuleId: null,
    }));
  return [...committed, ...estimated, ...salaryOccurrences];
}

/** Média mensal do gasto variável avulso nos meses informados (só conta meses que tiveram algum). */
export function averageUnplannedCents(transactions: Transaction[], months: string[]): number {
  const totals = months
    .map((m) =>
      buildMonthOccurrences(m, transactions, [])
        .filter(isUnplannedExpense)
        .reduce((sum, o) => sum + o.amountCents, 0)
    )
    .filter((total) => total > 0);
  if (totals.length === 0) return 0;
  return Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
}
