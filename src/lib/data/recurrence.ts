"use server";

import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
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

export const listActiveRecurrenceRules = unstable_cache(
  async (): Promise<RecurrenceRule[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("recurrence_rules")
      .select("*")
      .eq("active", true);
    if (error) {
      console.error("listActiveRecurrenceRules failed:", error);
      throw new Error("Não foi possível carregar as recorrências.");
    }
    return (data as RecurrenceRuleRow[]).map(mapRecurrenceRuleRow);
  },
  ["recurrence-rules"],
  { tags: ["recurrence-rules"], revalidate: 300 }
);

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
  revalidateTag("recurrence-rules");
  revalidateTag("analysis");
  revalidatePath("/configuracoes");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true };
}

export async function deactivateRecurrenceRule(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("recurrence_rules").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: "Não foi possível desativar a recorrência." };
  revalidateTag("recurrence-rules");
  revalidateTag("analysis");
  revalidatePath("/configuracoes");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true };
}
