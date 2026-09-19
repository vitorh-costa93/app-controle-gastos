"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export interface StartingBalance {
  month: string;
  amountCents: number;
}

/**
 * Saldo real de referência num mês fechado — usado como base do saldo acumulado
 * projetado em Simulação, no lugar de somar a sobra desde o início do histórico.
 */
export async function getStartingBalance(): Promise<StartingBalance | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "starting_balance")
    .maybeSingle();

  if (error) {
    console.error("getStartingBalance failed:", error);
    return null;
  }
  if (!data?.value) return null;

  const value = data.value as StartingBalance;
  if (!value.month || typeof value.amountCents !== "number") return null;
  return value;
}

export async function setStartingBalance(
  month: string,
  amountCents: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "starting_balance", value: { month, amountCents }, updated_at: new Date().toISOString() });

  if (error) {
    console.error("setStartingBalance failed:", error);
    return { ok: false, error: "Não foi possível salvar o saldo inicial." };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/simulacao");
  return { ok: true };
}
