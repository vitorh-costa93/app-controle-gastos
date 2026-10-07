"use server";

import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { RecurrenceRule as RecurrenceRuleRow } from "@/types/db";
import { RecurrenceRule, RecurrenceAmountVersion, RecurrenceFrequency } from "@/types/domain";
import { mapRecurrenceRuleRow, centsToReaisString, reaisStringToCents } from "./mappers";

export interface RecurrenceRuleInput {
  description: string;
  personId: string;
  direction: "income" | "expense";
  typeId: string | null;
  categoryId: string | null;
  amountCents: number;
  startDate: string;
  endDate: string | null;
  frequency?: RecurrenceFrequency;
}

interface RecurrenceAmountVersionRow {
  recurrence_rule_id: string;
  effective_from: string;
  amount: string;
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
    const rules = data as RecurrenceRuleRow[];
    const versionsByRule = new Map<string, RecurrenceAmountVersion[]>();

    if (rules.length > 0) {
      const { data: versionsData, error: versionsError } = await supabase
        .from("recurrence_rule_amount_versions")
        .select("recurrence_rule_id, effective_from, amount")
        .in("recurrence_rule_id", rules.map((r) => r.id))
        .order("effective_from", { ascending: true });
      if (versionsError) {
        console.error("listActiveRecurrenceRules (versions) failed:", versionsError);
      }
      for (const row of (versionsData as RecurrenceAmountVersionRow[] | null) ?? []) {
        const arr = versionsByRule.get(row.recurrence_rule_id) ?? [];
        arr.push({ effectiveFrom: row.effective_from, amountCents: reaisStringToCents(row.amount) });
        versionsByRule.set(row.recurrence_rule_id, arr);
      }
    }

    return rules.map((row) => mapRecurrenceRuleRow(row, versionsByRule.get(row.id) ?? []));
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
    frequency: input.frequency ?? "monthly",
  });
  if (error) return { ok: false, error: "Não foi possível criar a recorrência." };
  revalidateTag("recurrence-rules");
  revalidateTag("analysis");
  revalidatePath("/configuracoes");
  revalidatePath("/cadastro");
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
  revalidatePath("/cadastro");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true };
}

/**
 * Registra uma nova versão de valor pra uma recorrência, vigente a partir de um mês —
 * nunca retroativa, e a versão anterior fica guardada no histórico. `recurrence_rules.amount`
 * também é atualizado pro valor mais recente (por vigência), pra continuar servindo como
 * valor "atual" em telas que não olham o histórico.
 */
export async function addRecurrenceAmountVersion(
  ruleId: string,
  effectiveFrom: string,
  amountCents: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();

  const { error: versionError } = await supabase
    .from("recurrence_rule_amount_versions")
    .upsert(
      { recurrence_rule_id: ruleId, effective_from: effectiveFrom, amount: centsToReaisString(amountCents) },
      { onConflict: "recurrence_rule_id,effective_from" }
    );
  if (versionError) {
    console.error("addRecurrenceAmountVersion failed:", versionError);
    return { ok: false, error: "Não foi possível salvar a nova versão de valor." };
  }

  // Recalcula o valor "atual" da regra como o da versão de vigência mais recente.
  const { data: versions } = await supabase
    .from("recurrence_rule_amount_versions")
    .select("effective_from, amount")
    .eq("recurrence_rule_id", ruleId)
    .order("effective_from", { ascending: false })
    .limit(1);
  const latest = (versions as { effective_from: string; amount: string }[] | null)?.[0];
  if (latest) {
    await supabase.from("recurrence_rules").update({ amount: latest.amount }).eq("id", ruleId);
  }

  revalidateTag("recurrence-rules");
  revalidateTag("analysis");
  revalidatePath("/configuracoes");
  revalidatePath("/cadastro");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true };
}

/** Muda a frequência de uma recorrência fixa (mensal, bimestral, trimestral, semestral, anual). */
export async function setRecurrenceFrequency(
  ruleId: string,
  frequency: RecurrenceFrequency
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("recurrence_rules").update({ frequency }).eq("id", ruleId);
  if (error) {
    console.error("setRecurrenceFrequency failed:", error);
    return { ok: false, error: "Não foi possível salvar a frequência." };
  }
  revalidateTag("recurrence-rules");
  revalidateTag("analysis");
  revalidatePath("/configuracoes");
  revalidatePath("/cadastro");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true };
}

/**
 * Define (ou remove) o mês final de uma recorrência fixa — a partir do mês seguinte
 * ao informado, ela para de ser projetada em Análise/Simulação. Vazio (null) = sem
 * data de término, projeta indefinidamente (comportamento padrão de sempre).
 */
export async function setRecurrenceEndDate(
  ruleId: string,
  endDate: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("recurrence_rules").update({ end_date: endDate }).eq("id", ruleId);
  if (error) {
    console.error("setRecurrenceEndDate failed:", error);
    return { ok: false, error: "Não foi possível salvar a data de término." };
  }
  revalidateTag("recurrence-rules");
  revalidateTag("analysis");
  revalidatePath("/configuracoes");
  revalidatePath("/cadastro");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true };
}

/**
 * Lança (ou corrige) o valor real de UM mês específico de uma recorrência fixa, sem
 * alterar a estimativa usada nos outros meses — ex.: valor real da conta de luz do mês
 * atual, mantendo a estimativa nos demais meses pra fins de simulação. Um lançamento
 * real vinculado à regra nesse mês "vence" a projeção só naquele mês (ver
 * buildMonthOccurrences); os outros meses continuam projetando normalmente.
 */
export async function setRecurrenceMonthOverride(
  ruleId: string,
  referenceMonth: string,
  amountCents: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createAdminClient().rpc("set_recurrence_month_override", { p_rule_id: ruleId, p_month: referenceMonth, p_amount: centsToReaisString(amountCents) });
  if (error) {
    return { ok: false, error: error.message.startsWith("Lote:") ? error.message.slice(5).trim() : "Não foi possível concluir a operação. Nenhum registro foi alterado." };
  }

  revalidateTag("analysis");
  revalidatePath("/cadastro");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true };
}

export type RecurringDeleteScope = "month" | "following";

/**
 * Exclui um registro recorrente:
 * - "month": só aquele mês — apaga o lançamento real do mês (se houver) e marca o mês como pulado na regra,
 *   para a projeção não voltar; os outros meses seguem normais.
 * - "following": aquele mês e todos os seguintes — apaga os lançamentos reais daí em diante e encerra a regra no
 *   mês anterior (ou a desativa, se aquele era o primeiro mês dela).
 */
export async function deleteRecurringOccurrence(
  ruleId: string,
  referenceMonth: string,
  scope: RecurringDeleteScope
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createAdminClient().rpc("delete_recurring_occurrence", { p_rule_id: ruleId, p_month: referenceMonth, p_scope: scope });
  if (error) {
    return { ok: false, error: error.message.startsWith("Lote:") ? error.message.slice(5).trim() : "Não foi possível concluir a operação. Nenhum registro foi alterado." };
  }

  revalidateTag("recurrence-rules");
  revalidateTag("analysis");
  revalidatePath("/configuracoes");
  revalidatePath("/cadastro");
  revalidatePath("/analise");
  revalidatePath("/simulacao");
  return { ok: true };
}
