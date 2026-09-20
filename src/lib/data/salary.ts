"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { reaisStringToCents, centsToReaisString } from "./mappers";
import { findVariableSalaryPerson, buildProjectedSalaryOccurrences } from "@/lib/domain/salary";
import { toReferenceMonth } from "@/lib/utils/format";
import { Person, TransactionType } from "@/types/db";
import { Transaction, MonthlyOccurrence } from "@/types/domain";

export interface SalaryEntry {
  id: string;
  personId: string;
  referenceMonth: string;
  amountCents: number;
}

interface SalaryEntryRow {
  id: string;
  person_id: string;
  reference_month: string;
  amount: string;
}

function mapSalaryEntryRow(row: SalaryEntryRow): SalaryEntry {
  return {
    id: row.id,
    personId: row.person_id,
    referenceMonth: row.reference_month,
    amountCents: reaisStringToCents(row.amount),
  };
}

export async function listSalaryEntries(personId: string): Promise<SalaryEntry[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("salary_entries")
    .select("*")
    .eq("person_id", personId)
    .order("reference_month", { ascending: true });
  if (error) throw new Error("Não foi possível carregar o histórico de salário.");
  return (data as SalaryEntryRow[]).map(mapSalaryEntryRow);
}

/** Cria ou atualiza o valor de um mês (um mês só pode ter um lançamento por pessoa). */
export async function upsertSalaryEntry(
  personId: string,
  referenceMonth: string,
  amountCents: number
): Promise<{ ok: true; data: SalaryEntry } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("salary_entries")
    .upsert(
      { person_id: personId, reference_month: referenceMonth, amount: centsToReaisString(amountCents) },
      { onConflict: "person_id,reference_month" }
    )
    .select("*")
    .single();

  if (error) return { ok: false, error: "Não foi possível salvar este mês." };
  revalidateTag("analysis");
  revalidatePath("/configuracoes");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true, data: mapSalaryEntryRow(data as SalaryEntryRow) };
}

export async function deleteSalaryEntry(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("salary_entries").delete().eq("id", id);
  if (error) return { ok: false, error: "Não foi possível remover este mês." };
  revalidateTag("analysis");
  revalidatePath("/configuracoes");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true };
}

/**
 * Monta, por mês, os lançamentos projetados de salário variável (só da pessoa
 * identificada como salário variável, e só quando o filtro de pessoa da tela
 * permite) — usado por Análise e Simulação para preencher meses futuros que
 * ainda não têm o salário real lançado.
 */
export async function getSalaryProjectionOccurrences(
  months: string[],
  people: Person[],
  types: TransactionType[],
  allTransactions: Transaction[],
  personFilter?: string
): Promise<Map<string, MonthlyOccurrence[]>> {
  const variablePerson = findVariableSalaryPerson(people);
  if (!variablePerson) return new Map();
  if (personFilter && personFilter !== variablePerson.id) return new Map();

  const salaryEntries = await listSalaryEntries(variablePerson.id);
  const currentMonth = toReferenceMonth(new Date());
  const monthsWithRealIncome = new Set(
    allTransactions
      .filter((t) => t.personId === variablePerson.id && t.direction === "income")
      .map((t) => t.referenceMonth)
  );
  const typeId = types.find((t) => /sal[aá]rio/i.test(t.name))?.id ?? null;

  const occurrences = buildProjectedSalaryOccurrences({
    months,
    currentMonth,
    personId: variablePerson.id,
    typeId,
    salaryEntries,
    monthsWithRealIncome,
  });

  const map = new Map<string, MonthlyOccurrence[]>();
  for (const occ of occurrences) {
    const arr = map.get(occ.referenceMonth);
    if (arr) arr.push(occ);
    else map.set(occ.referenceMonth, [occ]);
  }
  return map;
}
