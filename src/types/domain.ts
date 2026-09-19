import { Direction, FieldConfidence, FixedVariable, TransactionSource } from "./db";

/** Representação de app: valores sempre em centavos (inteiro), nunca float de reais. */
export interface Transaction {
  id: string;
  registrationDate: string; // ISO date
  referenceMonth: string; // "YYYY-MM"
  personId: string;
  direction: Direction;
  fixedVariable: FixedVariable;
  typeId: string | null;
  categoryId: string | null;
  installmentCurrent: number;
  installmentTotal: number;
  amountCents: number;
  description: string | null;
  considered: boolean;
  source: TransactionSource;
  aiConfidence: Record<string, FieldConfidence> | null;
  recurrenceRuleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurrenceRule {
  id: string;
  description: string;
  personId: string;
  direction: Direction;
  typeId: string | null;
  categoryId: string | null;
  amountCents: number;
  frequency: "monthly";
  startDate: string;
  endDate: string | null;
  active: boolean;
}

/** Uma ocorrência (real ou projetada) de um lançamento dentro de um mês. */
export interface MonthlyOccurrence {
  id: string;
  origin: "real" | "projected";
  registrationDate: string;
  referenceMonth: string;
  personId: string;
  direction: Direction;
  fixedVariable: FixedVariable;
  typeId: string | null;
  categoryId: string | null;
  installmentCurrent: number;
  installmentTotal: number;
  amountCents: number;
  description: string | null;
  considered: boolean;
  recurrenceRuleId: string | null;
}

export interface MonthSummary {
  referenceMonth: string;
  incomeCents: number;
  expenseCents: number;
  leftoverCents: number;
}

export interface Simulation {
  id: string;
  description: string;
  totalAmountCents: number;
  installments: number;
  installmentAmountCents: number;
  startDate: string;
  active: boolean;
  aiSummary: string | null;
  createdAt: string;
}
