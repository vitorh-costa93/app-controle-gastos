import { MonthlyOccurrence, RecurrenceRule, Transaction } from "@/types/domain";
import { addMonths } from "@/lib/utils/format";
import { buildMonthOccurrences } from "./recurrence";

export function getBrazilTodayParts(now = new Date()): { month: string; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? String(now.getFullYear());
  const month = parts.find((p) => p.type === "month")?.value ?? String(now.getMonth() + 1).padStart(2, "0");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? now.getDate());
  return { month: `${year}-${month}`, day };
}

/**
 * Mês estimado para o salário variável:
 * - Até dia 15 do mês atual: do mês seguinte em diante usa o estimado (ano anterior × YoY).
 * - Após dia 15 do mês atual: o mês seguinte usa o valor real reportado nas entradas; só os seguintes usam estimado.
 */
export function isOpenMonth(month: string, currentMonth: string, dayOfMonth = 1): boolean {
  const threshold = dayOfMonth > 15 ? addMonths(currentMonth, 1) : currentMonth;
  return month > threshold;
}

/**
 * Ocorrências de um mês para a base da Simulação: exatamente as de Análise (lançamentos reais, recorrências,
 * parcelas, entradas). Nos meses estimados, a entrada real da pessoa de salário variável é trocada pela estimativa.
 */
export function buildSimulationMonthOccurrences(args: {
  month: string;
  currentMonth: string;
  dayOfMonth?: number;
  transactions: Transaction[];
  rules: RecurrenceRule[];
  salaryOccurrences: MonthlyOccurrence[];
  /** Pessoa de salário variável, cuja entrada real é trocada pela estimativa nos meses estimados. */
  estimatedSalaryPersonId?: string | null;
  /** Gastos estimados do mês (média dos 2 últimos meses fechados), que completam o real até o maior entre os dois. */
  estimateOccurrences?: MonthlyOccurrence[];
}): MonthlyOccurrence[] {
  const { month, currentMonth, dayOfMonth = 1, transactions, rules, salaryOccurrences, estimatedSalaryPersonId } = args;
  const estimates = args.estimateOccurrences ?? [];
  const occurrences = buildMonthOccurrences(month, transactions, rules);
  if (!isOpenMonth(month, currentMonth, dayOfMonth) || !estimatedSalaryPersonId) {
    return [...occurrences, ...salaryOccurrences, ...estimates];
  }

  const withoutRealSalary = occurrences.filter(
    (o) => !(o.direction === "income" && o.personId === estimatedSalaryPersonId)
  );
  return [...withoutRealSalary, ...salaryOccurrences, ...estimates];
}
