"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { SimulationRow } from "@/types/db";
import { Simulation } from "@/types/domain";
import { mapSimulationRow, centsToReaisString } from "./mappers";

export interface SimulationInput {
  description: string;
  totalAmountCents: number;
  installments: number;
  startDate: string;
}

export async function listActiveSimulations(): Promise<Simulation[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("simulations")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar as simulações.");
  return (data as SimulationRow[]).map(mapSimulationRow);
}

export async function createSimulation(
  input: SimulationInput
): Promise<{ ok: true; data: Simulation } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("simulations")
    .insert({
      description: input.description,
      total_amount: centsToReaisString(input.totalAmountCents),
      installments: input.installments,
      start_date: input.startDate,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: "Não foi possível salvar esta simulação." };
  revalidatePath("/simulacao");
  return { ok: true, data: mapSimulationRow(data as SimulationRow) };
}

export async function deleteSimulation(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("simulations").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: "Não foi possível excluir esta simulação." };
  revalidatePath("/simulacao");
  return { ok: true };
}

export async function saveSimulationAiSummary(
  id: string,
  summary: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("simulations")
    .update({ ai_summary: summary, ai_summary_generated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Não foi possível salvar o resumo da IA." };
  return { ok: true };
}
