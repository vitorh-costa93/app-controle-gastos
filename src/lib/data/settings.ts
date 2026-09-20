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

// Derivadas do salário atual (11.900, o mais relevante pra projeção hoje), pra bater
// exato nesse ponto: DAS 363,43 e DARF 377,51 = 740,94 no total. Nos outros dois
// salários do histórico (8.000 e 9.100) essa mesma % fica a poucos reais do valor
// real informado, então o desvio é pequeno fora do salário atual.
//   Salário 8.000  → DAS 244,32 (3,054%) · DARF 246,40 (3,080%)
//   Salário 9.100  → DAS 278,58 (3,061%) · DARF 280,58 (3,083%)
//   Salário 11.900 → DAS 363,43 (3,05403%) · DARF 377,51 (3,17235%)
const DEFAULT_DAS_RATE = 0.0305403;
const DEFAULT_DARF_RATE = 0.0317235;

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
