"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { RecurrenceRule as RecurrenceRuleRow } from "@/types/db";
import { RecurrenceRule } from "@/types/domain";
import { mapRecurrenceRuleRow, centsToReaisString } from "./mappers";

export interface RecurrenceRuleInput {
  description: string;
  personId: string;
  direction: "income" | "expense";
  typeId: string | null;
  categoryId: string | null;
  amountCents: number;
  startDate: string;
  endDate: string | null;
}

export async function listActiveRecurrenceRules(): Promise<RecurrenceRule[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("recurrence_rules")
    .select("*")
    .eq("active", true);
  if (error) throw new Error("Não foi possível carregar as recorrências.");
  return (data as RecurrenceRuleRow[]).map(mapRecurrenceRuleRow);
}

export async function createRecurrenceRule(
  input: RecurrenceRuleInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("recurrence_rules").insert({
    description: input.description,
    person_id: input.personId,
    direction: input.direction,
    type_id: input.typeId,
    category_id: input.categoryId,
    amount: centsToReaisString(input.amountCents),
    start_date: input.startDate,
    end_date: input.endDate,
  });
  if (error) return { ok: false, error: "Não foi possível criar a recorrência." };
  revalidatePath("/configuracoes");
  revalidatePath("/analise");
  return { ok: true };
}

export async function deactivateRecurrenceRule(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("recurrence_rules").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: "Não foi possível desativar a recorrência." };
  revalidatePath("/configuracoes");
  revalidatePath("/analise");
  return { ok: true };
}
