import { Transaction, RecurrenceRule, RecurrenceFrequency, MonthlyOccurrence } from "@/types/domain";
import { addMonths } from "@/lib/utils/format";

export const RECURRENCE_FREQUENCIES: { value: RecurrenceFrequency; label: string; months: number }[] = [
  { value: "monthly", label: "Mensal", months: 1 },
  { value: "bimonthly", label: "Bimestral", months: 2 },
  { value: "quarterly", label: "Trimestral", months: 3 },
  { value: "semiannual", label: "Semestral", months: 6 },
  { value: "annual", label: "Anual", months: 12 },
];

export function frequencyLabel(frequency: RecurrenceFrequency): string {
  return RECURRENCE_FREQUENCIES.find((f) => f.value === frequency)?.label ?? "Mensal";
}

/** Quantos meses separam uma ocorrência da próxima. */
function frequencyIntervalMonths(frequency: RecurrenceFrequency): number {
  return RECURRENCE_FREQUENCIES.find((f) => f.value === frequency)?.months ?? 1;
}

function monthsBetween(fromMonth: string, toMonth: string): number {
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function isRuleActiveInMonth(rule: RecurrenceRule, referenceMonth: string): boolean {
  const startMonth = rule.startDate.slice(0, 7);
  if (referenceMonth < startMonth) return false;
  // Bimestral, trimestral etc.: só os meses que caem no ritmo a partir do mês inicial.
  if (monthsBetween(startMonth, referenceMonth) % frequencyIntervalMonths(rule.frequency ?? "monthly") !== 0) return false;
  if (rule.endDate) {
    const endMonth = rule.endDate.slice(0, 7);
    if (referenceMonth > endMonth) return false;
  }
  return true;
}

/** Valor vigente da regra num mês: a versão mais recente cujo "a partir de" já começou, nunca retroativa. */
function effectiveAmountCents(rule: RecurrenceRule, referenceMonth: string): number {
  if (!rule.amountHistory || rule.amountHistory.length === 0) return rule.amountCents;
  const applicable = rule.amountHistory
    .filter((v) => v.effectiveFrom <= referenceMonth)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return applicable[0]?.amountCents ?? rule.amountCents;
}

/**
 * Combina lançamentos reais de um mês com ocorrências projetadas a partir de
 * regras de recorrência ativas — sem duplicar quando já existe um lançamento
 * real vinculado àquela regra naquele mês.
 */
export function buildMonthOccurrences(
  referenceMonth: string,
  realTransactions: Transaction[],
  activeRules: RecurrenceRule[]
): MonthlyOccurrence[] {
  const real = realTransactions
    .filter((t) => t.referenceMonth === referenceMonth)
    .map<MonthlyOccurrence>((t) => ({
      id: t.id,
      origin: "real",
      registrationDate: t.registrationDate,
      referenceMonth: t.referenceMonth,
      personId: t.personId,
      direction: t.direction,
      fixedVariable: t.fixedVariable,
      typeId: t.typeId,
      categoryId: t.categoryId,
      installmentCurrent: t.installmentCurrent,
      installmentTotal: t.installmentTotal,
      amountCents: t.amountCents,
      description: t.description,
      considered: t.considered,
      recurrenceRuleId: t.recurrenceRuleId,
    }));

  const rulesAlreadyMaterialized = new Set(
    real.map((t) => t.recurrenceRuleId).filter((id): id is string => Boolean(id))
  );

  const projected = activeRules
    .filter((rule) => isRuleActiveInMonth(rule, referenceMonth))
    .filter((rule) => !rulesAlreadyMaterialized.has(rule.id))
    .map<MonthlyOccurrence>((rule) => ({
      id: `projected:${rule.id}:${referenceMonth}`,
      origin: "projected",
      registrationDate: `${referenceMonth}-01`,
      referenceMonth,
      personId: rule.personId,
      direction: rule.direction,
      fixedVariable: "fixed",
      typeId: rule.typeId,
      categoryId: rule.categoryId,
      installmentCurrent: 1,
      installmentTotal: 1,
      amountCents: effectiveAmountCents(rule, referenceMonth),
      description: rule.description,
      considered: true,
      recurrenceRuleId: rule.id,
    }));

  return [...real, ...projected];
}

/** Gera a lista de meses "YYYY-MM" entre `from` e `to`, inclusive. */
export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 240) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
    guard += 1;
  }
  return months;
}
