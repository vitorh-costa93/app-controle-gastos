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

export interface FixedSalaryTaxRates {
  dasRate: number;
  darfRate: number;
}

// Médias calculadas a partir do histórico real informado (3 salários distintos):
// DAS ~3,05-3,06% e DARF ~3,08-3,17% do salário do mês, em todos os casos — bem
// próximo de uma alíquota fixa (não uma tabela progressiva visível nesses 3 pontos).
//   Salário 8.000  → DAS 244,32 (3,054%) · DARF 246,40 (3,080%)
//   Salário 9.100  → DAS 278,58 (3,061%) · DARF 280,58 (3,083%)
//   Salário 11.900 → DAS 363,43 (3,054%) · DARF 377,51 (3,172%)
const DEFAULT_DAS_RATE = 0.03056;
const DEFAULT_DARF_RATE = 0.03112;

/**
 * Alíquotas simples usadas para estimar o imposto da pessoa de salário fixo (trabalho
 * para o exterior) — sem uma tabela oficial confirmada, usamos % editáveis sobre o
 * salário do mês (DAS + DARF, que é como o usuário acompanha na prática) em vez de
 * tentar adivinhar a regra tributária exata.
 */
export async function getFixedSalaryTaxRates(): Promise<FixedSalaryTaxRates> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "fixed_salary_tax_rates")
    .maybeSingle();

  if (error) {
    console.error("getFixedSalaryTaxRates failed:", error);
    return { dasRate: DEFAULT_DAS_RATE, darfRate: DEFAULT_DARF_RATE };
  }
  const value = data?.value as Partial<FixedSalaryTaxRates> | undefined;
  return {
    dasRate: typeof value?.dasRate === "number" ? value.dasRate : DEFAULT_DAS_RATE,
    darfRate: typeof value?.darfRate === "number" ? value.darfRate : DEFAULT_DARF_RATE,
  };
}

export async function setFixedSalaryTaxRates(
  rates: FixedSalaryTaxRates
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "fixed_salary_tax_rates", value: rates, updated_at: new Date().toISOString() });

  if (error) {
    console.error("setFixedSalaryTaxRates failed:", error);
    return { ok: false, error: "Não foi possível salvar as alíquotas." };
  }

  revalidatePath("/configuracoes");
  return { ok: true };
}
