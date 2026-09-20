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

const DEFAULT_FIXED_SALARY_TAX_RATE = 0.0623; // 740,94 / 11.900 — ajustável em Configurações

/**
 * Alíquota simples usada para estimar o imposto da pessoa de salário fixo (trabalho
 * para o exterior) — sem uma tabela oficial confirmada, usamos uma % editável sobre
 * o salário do mês em vez de tentar adivinhar uma regra tributária.
 */
export async function getFixedSalaryTaxRate(): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "fixed_salary_tax_rate")
    .maybeSingle();

  if (error) {
    console.error("getFixedSalaryTaxRate failed:", error);
    return DEFAULT_FIXED_SALARY_TAX_RATE;
  }
  const value = data?.value as { rate?: number } | undefined;
  return typeof value?.rate === "number" ? value.rate : DEFAULT_FIXED_SALARY_TAX_RATE;
}

export async function setFixedSalaryTaxRate(rate: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "fixed_salary_tax_rate", value: { rate }, updated_at: new Date().toISOString() });

  if (error) {
    console.error("setFixedSalaryTaxRate failed:", error);
    return { ok: false, error: "Não foi possível salvar a alíquota." };
  }

  revalidatePath("/configuracoes");
  return { ok: true };
}
