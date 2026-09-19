"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { TransactionRow } from "@/types/db";
import { Transaction } from "@/types/domain";
import { mapTransactionRow, centsToReaisString, reaisStringToCents } from "./mappers";

export interface TransactionFilters {
  referenceMonth?: string;
  personId?: string;
  direction?: "income" | "expense";
  fixedVariable?: "fixed" | "variable";
  typeId?: string;
  categoryId?: string;
  considered?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TransactionInput {
  registrationDate: string;
  referenceMonth: string;
  personId: string;
  direction: "income" | "expense";
  fixedVariable: "fixed" | "variable";
  typeId: string | null;
  categoryId: string | null;
  installmentCurrent: number;
  installmentTotal: number;
  amountCents: number;
  description: string | null;
  considered: boolean;
  source?: "manual" | "audio" | "photo" | "text" | "pdf";
}

export async function listTransactions(
  filters: TransactionFilters = {}
): Promise<{ data: Transaction[]; total: number }> {
  const supabase = createAdminClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 12;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("transactions")
    .select("*", { count: "exact" })
    .is("deleted_at", null)
    .order("registration_date", { ascending: false })
    .range(from, to);

  if (filters.referenceMonth) query = query.eq("reference_month", filters.referenceMonth);
  if (filters.personId) query = query.eq("person_id", filters.personId);
  if (filters.direction) query = query.eq("direction", filters.direction);
  if (filters.fixedVariable) query = query.eq("fixed_variable", filters.fixedVariable);
  if (filters.typeId) query = query.eq("type_id", filters.typeId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.considered !== undefined) query = query.eq("considered", filters.considered);
  if (filters.search) query = query.ilike("description", `%${filters.search}%`);

  const { data, error, count } = await query;
  if (error) {
    console.error("listTransactions failed:", error);
    throw new Error("Não foi possível carregar os lançamentos.");
  }

  return {
    data: (data as TransactionRow[]).map(mapTransactionRow),
    total: count ?? 0,
  };
}

/** Todos os lançamentos considerados de um mês (sem paginação) — usado por Análise/domínio. */
export async function listConsideredTransactionsForMonth(
  referenceMonth: string
): Promise<Transaction[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .is("deleted_at", null)
    .eq("reference_month", referenceMonth)
    .eq("considered", true);

  if (error) {
    console.error("listConsideredTransactionsForMonth failed:", error);
    throw new Error("Não foi possível carregar os lançamentos do mês.");
  }
  return (data as TransactionRow[]).map(mapTransactionRow);
}

/** Todos os lançamentos reais (considerados) num intervalo de meses — para gráficos/projeções. */
export async function listConsideredTransactionsInRange(
  fromMonth: string,
  toMonth: string
): Promise<Transaction[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .is("deleted_at", null)
    .eq("considered", true)
    .gte("reference_month", fromMonth)
    .lte("reference_month", toMonth);

  if (error) {
    console.error("listConsideredTransactionsInRange failed:", error);
    throw new Error("Não foi possível carregar os lançamentos do período.");
  }
  return (data as TransactionRow[]).map(mapTransactionRow);
}

export async function createTransaction(
  input: TransactionInput
): Promise<{ ok: true; data: Transaction } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      registration_date: input.registrationDate,
      reference_month: input.referenceMonth,
      person_id: input.personId,
      direction: input.direction,
      fixed_variable: input.fixedVariable,
      type_id: input.typeId,
      category_id: input.categoryId,
      installment_current: input.installmentCurrent,
      installment_total: input.installmentTotal,
      amount: centsToReaisString(input.amountCents),
      description: input.description,
      considered: input.considered,
      source: input.source ?? "manual",
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: "Não foi possível salvar este lançamento." };

  revalidatePath("/cadastro");
  revalidatePath("/analise");
  return { ok: true, data: mapTransactionRow(data as TransactionRow) };
}

export async function createTransactionsBatch(
  inputs: TransactionInput[]
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (inputs.length === 0) return { ok: true, count: 0 };
  const supabase = createAdminClient();
  const { error, count } = await supabase.from("transactions").insert(
    inputs.map((input) => ({
      registration_date: input.registrationDate,
      reference_month: input.referenceMonth,
      person_id: input.personId,
      direction: input.direction,
      fixed_variable: input.fixedVariable,
      type_id: input.typeId,
      category_id: input.categoryId,
      installment_current: input.installmentCurrent,
      installment_total: input.installmentTotal,
      amount: centsToReaisString(input.amountCents),
      description: input.description,
      considered: input.considered,
      source: input.source ?? "manual",
    })),
    { count: "exact" }
  );

  if (error) return { ok: false, error: "Não foi possível confirmar os lançamentos." };

  revalidatePath("/cadastro");
  revalidatePath("/analise");
  return { ok: true, count: count ?? inputs.length };
}

export async function updateTransaction(
  id: string,
  input: Partial<TransactionInput>
): Promise<{ ok: true; data: Transaction } | { ok: false; error: string }> {
  const supabase = createAdminClient();

  const patch: Record<string, unknown> = {};
  if (input.registrationDate !== undefined) patch.registration_date = input.registrationDate;
  if (input.referenceMonth !== undefined) patch.reference_month = input.referenceMonth;
  if (input.personId !== undefined) patch.person_id = input.personId;
  if (input.direction !== undefined) patch.direction = input.direction;
  if (input.fixedVariable !== undefined) patch.fixed_variable = input.fixedVariable;
  if (input.typeId !== undefined) patch.type_id = input.typeId;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.installmentCurrent !== undefined) patch.installment_current = input.installmentCurrent;
  if (input.installmentTotal !== undefined) patch.installment_total = input.installmentTotal;
  if (input.amountCents !== undefined) patch.amount = centsToReaisString(input.amountCents);
  if (input.description !== undefined) patch.description = input.description;
  if (input.considered !== undefined) patch.considered = input.considered;

  const { data, error } = await supabase
    .from("transactions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { ok: false, error: "Não foi possível salvar as alterações." };

  revalidatePath("/cadastro");
  revalidatePath("/analise");
  return { ok: true, data: mapTransactionRow(data as TransactionRow) };
}

export async function setTransactionConsidered(
  id: string,
  considered: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("transactions").update({ considered }).eq("id", id);
  if (error) return { ok: false, error: "Não foi possível atualizar este lançamento." };

  revalidatePath("/cadastro");
  revalidatePath("/analise");
  return { ok: true };
}

export async function deleteTransaction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: "Não foi possível excluir este lançamento." };

  revalidatePath("/cadastro");
  revalidatePath("/analise");
  return { ok: true };
}

export interface DuplicateCandidate {
  personId: string | null;
  amountCents: number;
  registrationDate: string | null;
  description: string | null;
}

export interface DuplicateMatch {
  transactionId: string;
  registrationDate: string;
  description: string | null;
}

const DUPLICATE_WINDOW_DAYS = 10;

/**
 * Para cada candidato (ex.: linhas extraídas de uma fatura), procura um lançamento
 * já existente (mesma pessoa, valor igual e data próxima) — usado para avisar sobre
 * possível duplicata quando a mesma compra é enviada duas vezes (print parcial +
 * fatura fechada). Nunca bloqueia: só sinaliza para revisão humana.
 */
export async function findPotentialDuplicates(
  candidates: DuplicateCandidate[]
): Promise<(DuplicateMatch | null)[]> {
  const datedCandidates = candidates.filter((c) => c.personId && c.registrationDate);
  if (datedCandidates.length === 0) return candidates.map(() => null);

  const times = datedCandidates.map((c) => new Date(c.registrationDate as string).getTime());
  const windowMs = DUPLICATE_WINDOW_DAYS * 86_400_000;
  const minDate = new Date(Math.min(...times) - windowMs).toISOString().slice(0, 10);
  const maxDate = new Date(Math.max(...times) + windowMs).toISOString().slice(0, 10);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, person_id, amount, registration_date, description")
    .is("deleted_at", null)
    .gte("registration_date", minDate)
    .lte("registration_date", maxDate);

  if (error) {
    console.error("findPotentialDuplicates failed:", error);
    return candidates.map(() => null);
  }

  const existing = data as {
    id: string;
    person_id: string;
    amount: string;
    registration_date: string;
    description: string | null;
  }[];

  return candidates.map((candidate) => {
    if (!candidate.personId || !candidate.registrationDate) return null;
    const candidateTime = new Date(candidate.registrationDate).getTime();

    const match = existing.find((e) => {
      if (e.person_id !== candidate.personId) return false;
      if (Math.abs(reaisStringToCents(e.amount) - candidate.amountCents) > 1) return false;
      const dayDiff = Math.abs(new Date(e.registration_date).getTime() - candidateTime) / 86_400_000;
      return dayDiff <= DUPLICATE_WINDOW_DAYS;
    });

    return match
      ? { transactionId: match.id, registrationDate: match.registration_date, description: match.description }
      : null;
  });
}
