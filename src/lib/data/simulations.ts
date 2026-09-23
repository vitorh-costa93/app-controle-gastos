"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { SimulationRow } from "@/types/db";
import { Simulation } from "@/types/domain";
import { mapSimulationRow, centsToReaisString } from "./mappers";
import { generateSimulationImage } from "@/lib/ai/openai";
import { persistGeneratedImage } from "@/lib/supabase/storage";

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
  // Gera a foto ilustrativa antes de salvar — se falhar, a simulação é criada sem imagem
  // mesmo assim (dá pra tentar de novo depois pelo botão "Gerar imagem").
  const imageUrl = await generateAndStoreImage(input.description);
  const { data, error } = await supabase
    .from("simulations")
    .insert({
      description: input.description,
      total_amount: centsToReaisString(input.totalAmountCents),
      installments: input.installments,
      start_date: input.startDate,
      image_url: imageUrl,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: "Não foi possível salvar esta simulação." };
  revalidatePath("/simulacao");
  return { ok: true, data: mapSimulationRow(data as SimulationRow) };
}

async function generateAndStoreImage(description: string): Promise<string | null> {
  const image = await generateSimulationImage(description);
  return image ? persistGeneratedImage(image) : null;
}

/** Gera (ou refaz) a foto de uma simulação já existente. */
export async function regenerateSimulationImage(
  id: string
): Promise<{ ok: true; imageUrl: string } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { data: sim, error: readError } = await supabase.from("simulations").select("description").eq("id", id).single();
  if (readError || !sim) return { ok: false, error: "Simulação não encontrada." };

  const imageUrl = await generateAndStoreImage(sim.description as string);
  if (!imageUrl) {
    return {
      ok: false,
      error: "Não foi possível gerar a imagem agora. Verifique a chave da OpenAI (acesso a modelos de imagem) e tente de novo.",
    };
  }

  const { error } = await supabase.from("simulations").update({ image_url: imageUrl }).eq("id", id);
  if (error) return { ok: false, error: "A imagem foi gerada, mas não foi possível salvá-la." };
  revalidatePath("/simulacao");
  return { ok: true, imageUrl };
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
