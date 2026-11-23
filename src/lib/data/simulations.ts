"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { BestOfferMeta, SimulationCategory, SimulationRow, SimulationTrackerConfig } from "@/types/db";
import { Simulation } from "@/types/domain";
import { mapSimulationRow, centsToReaisString } from "./mappers";
import { generateSimulationImage } from "@/lib/ai/openai";
import { persistGeneratedImage } from "@/lib/supabase/storage";
import { previewTrackedPrices, recordSnapshotAndEvaluateAlerts } from "./price-tracking";

export interface SimulationInput {
  description: string;
  /** Total que impacta o orçamento: o parcelado quando installments > 1, senão o preço à vista. */
  totalAmountCents: number;
  /** Preço à vista (base do comparativo à vista × parcelado). Omitido em simulações automáticas. */
  cashPriceCents?: number | null;
  installments: number;
  startDate: string;
  category?: SimulationCategory;
  autoTrack?: boolean;
  trackerConfig?: SimulationTrackerConfig | null;
  bestOfferMeta?: BestOfferMeta | null;
  /** Não gera a foto ilustrativa (que consome a API de imagens) — para simulações criadas automaticamente. */
  skipImage?: boolean;
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
  const category: SimulationCategory = input.category ?? "product";
  const autoTrack = input.autoTrack ?? true;
  let bestOfferMeta = input.bestOfferMeta ?? null;
  let cashPriceCents = input.cashPriceCents ?? null;
  let totalAmountCents = input.totalAmountCents;
  let installments = input.installments;

  // Se o rastreamento automático está ativo e o usuário não digitou preço ou ainda não buscou a cotação,
  // busca automaticamente na internet passando pelo pipeline de 4 camadas!
  if (autoTrack && (!bestOfferMeta || totalAmountCents <= 0 || !cashPriceCents || cashPriceCents <= 0)) {
    const tracked = await previewTrackedPrices({
      category,
      description: input.description,
      startDate: input.startDate,
      trackerConfig: input.trackerConfig,
    });
    if (tracked.ok) {
      bestOfferMeta = tracked.meta;
      cashPriceCents = tracked.meta.cashPriceCents;
      totalAmountCents = tracked.meta.installmentTotalCents;
      installments = tracked.meta.installments;
    }
  }

  if (totalAmountCents <= 0) {
    return { ok: false, error: "Não foi possível obter um preço válido. Informe o valor ou tente buscar novamente." };
  }

  const imagePrompt =
    category === "travel" && input.trackerConfig && "accommodationName" in input.trackerConfig
      ? `${input.trackerConfig.accommodationName} em ${input.trackerConfig.destinationLabel || input.description}`
      : input.description;
  const imageUrl = input.skipImage ? null : await generateAndStoreImage(imagePrompt);
  const { data, error } = await supabase
    .from("simulations")
    .insert({
      description: input.description,
      total_amount: centsToReaisString(totalAmountCents),
      cash_price: cashPriceCents ? centsToReaisString(cashPriceCents) : null,
      installments: Math.max(1, installments),
      start_date: input.startDate,
      image_url: imageUrl,
      category,
      auto_track: autoTrack,
      tracker_config: input.trackerConfig ?? {},
      best_offer_meta: bestOfferMeta,
      last_tracked_at: bestOfferMeta ? bestOfferMeta.checkedAt : null,
    })
    .select("*")
    .single();

  if (error || !data) return { ok: false, error: "Não foi possível salvar esta simulação." };

  if (bestOfferMeta) {
    await recordSnapshotAndEvaluateAlerts(data as SimulationRow, bestOfferMeta);
  }

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

/** Simulações excluídas (soft-delete): ficam no banco e podem ser restauradas. */
export async function listArchivedSimulations(): Promise<Simulation[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("simulations")
    .select("*")
    .eq("active", false)
    .order("updated_at", { ascending: false });
  if (error) return [];
  return (data as SimulationRow[]).map(mapSimulationRow);
}

export async function restoreSimulation(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("simulations").update({ active: true }).eq("id", id);
  if (error) return { ok: false, error: "Não foi possível restaurar esta simulação." };
  revalidatePath("/simulacao");
  return { ok: true };
}

/** Edita descrição, preço à vista, valor parcelado, parcelas e data de início; a imagem e o resumo da IA são mantidos. */
export async function updateSimulation(
  id: string,
  input: SimulationInput
): Promise<{ ok: true; data: Simulation } | { ok: false; error: string }> {
  if (!input.description.trim()) {
    return { ok: false, error: "Preencha a descrição da simulação." };
  }
  const supabase = createAdminClient();
  const category: SimulationCategory = input.category ?? "product";
  const autoTrack = input.autoTrack ?? false;
  let bestOfferMeta = input.bestOfferMeta;
  let cashPriceCents = input.cashPriceCents ?? null;
  let totalAmountCents = input.totalAmountCents;
  let installments = input.installments;

  if (autoTrack && (totalAmountCents <= 0 || !cashPriceCents || cashPriceCents <= 0)) {
    const tracked = await previewTrackedPrices({
      category,
      description: input.description,
      startDate: input.startDate,
      trackerConfig: input.trackerConfig,
    });
    if (tracked.ok) {
      bestOfferMeta = tracked.meta;
      cashPriceCents = tracked.meta.cashPriceCents;
      totalAmountCents = tracked.meta.installmentTotalCents;
      installments = tracked.meta.installments;
    }
  }

  if (totalAmountCents <= 0 || installments < 1) {
    return { ok: false, error: "Preencha valor e parcelas ou ative a busca automática de preços." };
  }

  const updatePayload: Record<string, unknown> = {
    description: input.description.trim(),
    total_amount: centsToReaisString(totalAmountCents),
    cash_price: cashPriceCents ? centsToReaisString(cashPriceCents) : null,
    installments,
    start_date: input.startDate,
  };
  if (input.category !== undefined) updatePayload.category = input.category;
  if (input.autoTrack !== undefined) updatePayload.auto_track = input.autoTrack;
  if (input.trackerConfig !== undefined) updatePayload.tracker_config = input.trackerConfig ?? {};
  if (bestOfferMeta !== undefined) {
    updatePayload.best_offer_meta = bestOfferMeta;
    if (bestOfferMeta) updatePayload.last_tracked_at = bestOfferMeta.checkedAt;
  }

  const { data, error } = await supabase
    .from("simulations")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: "Não foi possível salvar as alterações." };

  if (bestOfferMeta) {
    await recordSnapshotAndEvaluateAlerts(data as SimulationRow, bestOfferMeta);
  }

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
