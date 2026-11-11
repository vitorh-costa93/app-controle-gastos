"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const startingBalanceSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), amountCents: z.number().int().safe() });

export interface StartingBalance {
  month: string;
  amountCents: number;
}

/**
 * Saldo real de referência num mês fechado — usado como base do saldo acumulado
 * projetado em Simulação, no lugar de somar a sobra desde o início do histórico.
 */
export async function getStartingBalance(strict = false): Promise<StartingBalance | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "starting_balance")
    .maybeSingle();

  if (error) {
    if (strict) throw new Error("Não foi possível carregar o saldo de referência.");
    console.error("getStartingBalance failed:", error);
    return null;
  }
  if (!data?.value) return null;

  const parsed = startingBalanceSchema.safeParse(data.value);
  if (!parsed.success) {
    if (strict) throw new Error("O saldo de referência está inválido. Confira em Configurações.");
    return null;
  }
  return parsed.data;
}

export async function setStartingBalance(
  month: string,
  amountCents: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!startingBalanceSchema.safeParse({ month, amountCents }).success) return { ok: false, error: "Informe um mês válido e um saldo em centavos inteiros." };
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
  revalidatePath("/analise");
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
