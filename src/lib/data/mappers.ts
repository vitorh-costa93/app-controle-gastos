import { TransactionRow, RecurrenceRule as RecurrenceRuleRow, SimulationRow } from "@/types/db";
import { Transaction, RecurrenceRule, Simulation } from "@/types/domain";

/** Postgres NUMERIC chega como string ("1234.56") — converte para centavos exatos. */
export function reaisStringToCents(value: string | number): number {
  const [reais, cents = "0"] = String(value).split(".");
  const sign = reais.startsWith("-") ? -1 : 1;
  const reaisAbs = reais.replace("-", "");
  return sign * (Number(reaisAbs) * 100 + Number(cents.padEnd(2, "0").slice(0, 2)));
}

export function centsToReaisString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    registrationDate: row.registration_date,
    referenceMonth: row.reference_month,
    personId: row.person_id,
    direction: row.direction,
    fixedVariable: row.fixed_variable,
    typeId: row.type_id,
    categoryId: row.category_id,
    installmentCurrent: row.installment_current,
    installmentTotal: row.installment_total,
    amountCents: reaisStringToCents(row.amount),
    description: row.description,
    considered: row.considered,
    source: row.source,
    aiConfidence: row.ai_confidence,
    recurrenceRuleId: row.recurrence_rule_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRecurrenceRuleRow(row: RecurrenceRuleRow): RecurrenceRule {
  return {
    id: row.id,
    description: row.description,
    personId: row.person_id,
    direction: row.direction,
    typeId: row.type_id,
    categoryId: row.category_id,
    amountCents: reaisStringToCents(row.amount),
    frequency: row.frequency,
    startDate: row.start_date,
    endDate: row.end_date,
    active: row.active,
  };
}

export function mapSimulationRow(row: SimulationRow): Simulation {
  const totalAmountCents = reaisStringToCents(row.total_amount);
  return {
    id: row.id,
    description: row.description,
    totalAmountCents,
    installments: row.installments,
    installmentAmountCents: Math.round(totalAmountCents / row.installments),
    startDate: row.start_date,
    active: row.active,
    aiSummary: row.ai_summary,
    createdAt: row.created_at,
  };
}
