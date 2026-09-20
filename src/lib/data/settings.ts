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

// DAS 363,43 + DARF 377,51 = 740,94, confirmado pro salário atual (11.900). Alíquotas
// por % oscilavam entre os meses (o cálculo dependia de outros fatores que não temos
// como reproduzir), então por pedido do usuário isso virou um valor fixo em reais —
// só muda quando ele avisar de uma alteração salarial, editável em Configurações.
const DEFAULT_FIXED_SALARY_TAX_AMOUNT_CENTS = 74_094;

/**
 * Valor mensal fixo (em centavos) do imposto da pessoa de salário fixo (trabalho para
 * o exterior) — editável em Configurações sempre que o salário mudar.
 */
export async function getFixedSalaryTaxAmountCents(): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "fixed_salary_tax_amount")
    .maybeSingle();

  if (error) {
    console.error("getFixedSalaryTaxAmountCents failed:", error);
    return DEFAULT_FIXED_SALARY_TAX_AMOUNT_CENTS;
  }
  const value = data?.value as { amountCents?: number } | undefined;
  return typeof value?.amountCents === "number" ? value.amountCents : DEFAULT_FIXED_SALARY_TAX_AMOUNT_CENTS;
}

export async function setFixedSalaryTaxAmountCents(
  amountCents: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "fixed_salary_tax_amount", value: { amountCents }, updated_at: new Date().toISOString() });

  if (error) {
    console.error("setFixedSalaryTaxAmountCents failed:", error);
    return { ok: false, error: "Não foi possível salvar o valor do imposto." };
  }

  revalidatePath("/configuracoes");
  return { ok: true };
}
