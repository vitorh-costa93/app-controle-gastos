"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { centsToReaisString } from "./mappers";
import { setRecurrenceMonthOverride } from "./recurrence";

/** Edição contextual: uma ocorrência ou a recorrência a partir do mês aberto. */
export async function saveMovementAmount(
  occurrenceId: string,
  ruleId: string | null,
  month: string,
  amountCents: number,
  scope: "month" | "following"
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 99999999999999 ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !["month", "following"].includes(scope)) {
    return { ok: false, error: "Informe um valor válido e um mês válido." };
  }
  const supabase = createAdminClient();
  const amount = centsToReaisString(amountCents);

  if (ruleId) {
    // Um lançamento real continua editável mesmo se sua regra já foi encerrada/desativada.
    if (scope === "month" && !occurrenceId.startsWith("projected:")) {
      const { data, error } = await supabase.from("transactions").update({ amount })
        .eq("id", occurrenceId).eq("recurrence_rule_id", ruleId).eq("reference_month", month)
        .is("deleted_at", null).select("id").single();
      if (error || !data) return { ok: false, error: "Não foi possível atualizar este lançamento." };
      refresh();
      return { ok: true };
    }
    const { data: rule, error: ruleError } = await supabase.from("recurrence_rules")
      .select("start_date, end_date, active, amount, skipped_months, frequency").eq("id", ruleId).single();
    if (ruleError || !rule || !rule.active || month < rule.start_date.slice(0, 7) ||
        (rule.end_date && month > rule.end_date.slice(0, 7)) || rule.skipped_months?.includes(month)) {
      return { ok: false, error: "Recorrência indisponível neste mês. Atualize a página." };
    }
    if (scope === "month") return setRecurrenceMonthOverride(ruleId, month, amountCents);

    const { data: versions, error: readError } = await supabase.from("recurrence_rule_amount_versions")
      .select("effective_from, amount").eq("recurrence_rule_id", ruleId).order("effective_from");
    if (readError) return { ok: false, error: "Não foi possível carregar o histórico de valores." };

    // Guarda a base antes de mudar o valor atual: o fallback da projeção usa rule.amount.
    const startMonth = rule.start_date.slice(0, 7);
    if (month > startMonth && !versions?.some((v) => v.effective_from <= startMonth)) {
      const { error } = await supabase.from("recurrence_rule_amount_versions").upsert(
        { recurrence_rule_id: ruleId, effective_from: startMonth, amount: rule.amount },
        { onConflict: "recurrence_rule_id,effective_from" }
      );
      if (error) return { ok: false, error: "Não foi possível preservar o valor dos meses anteriores." };
    }
    const { error: versionError } = await supabase.from("recurrence_rule_amount_versions").upsert(
      { recurrence_rule_id: ruleId, effective_from: month, amount },
      { onConflict: "recurrence_rule_id,effective_from" }
    );
    if (versionError) return { ok: false, error: "Não foi possível salvar o novo valor." };
    const { error: futureError } = await supabase.from("recurrence_rule_amount_versions")
      .update({ amount }).eq("recurrence_rule_id", ruleId).gt("effective_from", month);
    const { error: ruleUpdateError } = await supabase.from("recurrence_rules")
      .update({ amount }).eq("id", ruleId);
    const { error: transactionsError } = await supabase.from("transactions")
      .update({ amount }).eq("recurrence_rule_id", ruleId).gte("reference_month", month).is("deleted_at", null);
    // Invalida também em falha parcial, permitindo recarregar e repetir a operação idempotente.
    refresh();
    if (futureError || ruleUpdateError || transactionsError) {
      return { ok: false, error: "A alteração não foi concluída em todos os meses. Tente salvar novamente." };
    }
  } else {
    if (scope !== "month") return { ok: false, error: "Este lançamento não é recorrente." };
    const { data, error } = await supabase.from("transactions").update({ amount })
      .eq("id", occurrenceId).eq("reference_month", month).is("recurrence_rule_id", null)
      .is("deleted_at", null).select("id").single();
    if (error || !data) return { ok: false, error: "Não foi possível atualizar este lançamento." };
    refresh();
  }
  return { ok: true };
}

function refresh() {
  revalidateTag("recurrence-rules");
  revalidateTag("analysis");
  for (const path of ["/analise", "/cadastro", "/simulacao", "/configuracoes"]) revalidatePath(path);
}
