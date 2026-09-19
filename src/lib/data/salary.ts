"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { reaisStringToCents, centsToReaisString } from "./mappers";

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
  revalidatePath("/configuracoes");
  return { ok: true, data: mapSalaryEntryRow(data as SalaryEntryRow) };
}

export async function deleteSalaryEntry(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("salary_entries").delete().eq("id", id);
  if (error) return { ok: false, error: "Não foi possível remover este mês." };
  revalidatePath("/configuracoes");
  return { ok: true };
}
