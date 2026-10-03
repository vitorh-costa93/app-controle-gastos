import { MonthlyOccurrence, RecurrenceRule, Transaction } from "@/types/domain";
import { buildMonthOccurrences } from "./recurrence";

/** Mês estimado: do mês seguinte ao atual em diante. O mês atual e os anteriores seguem Análise. */
export function isOpenMonth(month: string, currentMonth: string): boolean {
  return month > currentMonth;
}

/**
 * Ocorrências de um mês para a base da Simulação: exatamente as de Análise (lançamentos reais, recorrências,
 * parcelas, entradas). A única diferença é o salário variável (Jaqueline): do mês seguinte em diante o valor
 * lançado é trocado pela estimativa (mesmo mês do ano anterior × YoY acumulado).
 */
export function buildSimulationMonthOccurrences(args: {
  month: string;
  currentMonth: string;
  transactions: Transaction[];
  rules: RecurrenceRule[];
  salaryOccurrences: MonthlyOccurrence[];
  /** Pessoa de salário variável, cuja entrada real é trocada pela estimativa nos meses seguintes. */
  estimatedSalaryPersonId?: string | null;
  /** Gastos estimados do mês (média dos 2 últimos meses fechados), que completam o real até o maior entre os dois. */
  estimateOccurrences?: MonthlyOccurrence[];
}): MonthlyOccurrence[] {
  const { month, currentMonth, transactions, rules, salaryOccurrences, estimatedSalaryPersonId } = args;
  const estimates = args.estimateOccurrences ?? [];
  const occurrences = buildMonthOccurrences(month, transactions, rules);
  if (!isOpenMonth(month, currentMonth) || !estimatedSalaryPersonId) return [...occurrences, ...salaryOccurrences, ...estimates];

  const withoutRealSalary = occurrences.filter(
    (o) => !(o.direction === "income" && o.personId === estimatedSalaryPersonId)
  );
  return [...withoutRealSalary, ...salaryOccurrences, ...estimates];
}
