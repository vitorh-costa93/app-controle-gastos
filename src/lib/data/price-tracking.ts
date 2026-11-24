"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BestOfferMeta,
  ProductTrackerConfig,
  SimulationCategory,
  SimulationPriceAlertRow,
  SimulationPriceSnapshotRow,
  SimulationRow,
  SimulationTrackerConfig,
  TravelTrackerConfig,
} from "@/types/db";
import { Simulation, SimulationPriceAlert, SimulationPriceSnapshot } from "@/types/domain";
import {
  centsToReaisString,
  mapSimulationPriceAlertRow,
  mapSimulationPriceSnapshotRow,
  mapSimulationRow,
  reaisStringToCents,
} from "./mappers";
import { auditOfferFromScreenshot, trackProductPrices, trackTravelPrices } from "@/lib/price-tracking/engine";
import {
  buildDefaultProductTrackerConfig,
  buildDefaultTravelTrackerConfig,
  inferCategoryFromDescription,
} from "@/lib/price-tracking/catalog";
import { formatCurrencyBRL } from "@/lib/utils/format";

export interface NotificationChannelsConfig {
  telegramBotToken?: string;
  telegramChatId?: string;
  browserPushEnabled?: boolean;
  dropThresholdPercent?: number; // padrão: 4% de queda real dispara alerta
}

export async function getNotificationChannelsConfig(): Promise<NotificationChannelsConfig> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "price_alert_channels")
    .maybeSingle();
  const val = (data?.value ?? {}) as NotificationChannelsConfig;
  return {
    telegramBotToken: val.telegramBotToken ?? "",
    telegramChatId: val.telegramChatId ?? "",
    browserPushEnabled: val.browserPushEnabled ?? true,
    dropThresholdPercent: typeof val.dropThresholdPercent === "number" ? val.dropThresholdPercent : 4,
  };
}

export async function saveNotificationChannelsConfig(
  config: NotificationChannelsConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("app_settings").upsert({
    key: "price_alert_channels",
    value: {
      telegramBotToken: config.telegramBotToken?.trim() || "",
      telegramChatId: config.telegramChatId?.trim() || "",
      browserPushEnabled: Boolean(config.browserPushEnabled),
      dropThresholdPercent: Math.max(1, Math.min(50, Number(config.dropThresholdPercent) || 4)),
    },
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: "Não foi possível salvar as configurações de alerta." };
  revalidatePath("/simulacao");
  return { ok: true };
}

async function sendTelegramAlertIfConfigured(title: string, message: string, offerUrl?: string | null): Promise<boolean> {
  try {
    const cfg = await getNotificationChannelsConfig();
    const token = cfg.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = cfg.telegramChatId || process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return false;

    const text = `🔥 *${title}*\n\n${message}${offerUrl ? `\n\n👉 [Abrir Oferta Verificada](${offerUrl})` : ""}`;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Busca e audita o menor preço real disponível hoje (4 camadas anti-falso-positivo)
 * para preencher automaticamente o formulário antes mesmo de salvar, ou ao criar a simulação.
 */
export async function previewTrackedPrices(input: {
  category: SimulationCategory;
  description: string;
  startDate: string;
  trackerConfig?: SimulationTrackerConfig | null;
}): Promise<{ ok: true; meta: BestOfferMeta } | { ok: false; error: string }> {
  try {
    const meta =
      input.category === "travel"
        ? await trackTravelPrices(
            input.description,
            input.startDate,
            (input.trackerConfig as Partial<TravelTrackerConfig>) ?? null
          )
        : await trackProductPrices(
            input.description,
            (input.trackerConfig as Partial<ProductTrackerConfig>) ?? null
          );
    return { ok: true, meta };
  } catch (err) {
    console.error("previewTrackedPrices failed:", err);
    return { ok: false, error: "Não foi possível consultar os preços agora. Tente novamente em instantes." };
  }
}

/**
 * Grava um snapshot histórico para uma simulação e avalia se houve queda de preço para disparar alerta.
 */
export async function recordSnapshotAndEvaluateAlerts(
  sim: SimulationRow,
  meta: BestOfferMeta
): Promise<{ snapshot: SimulationPriceSnapshot | null; alert: SimulationPriceAlert | null }> {
  const supabase = createAdminClient();

  // Busca snapshots anteriores desta simulação para comparar histórico real
  const { data: prevRows } = await supabase
    .from("simulation_price_snapshots")
    .select("*")
    .eq("simulation_id", sim.id)
    .order("captured_at", { ascending: false })
    .limit(30);

  const history = (prevRows ?? []) as SimulationPriceSnapshotRow[];
  const bestFlight =
    meta.category === "travel" && meta.flightQuotes?.length
      ? meta.flightQuotes.find((f) => f.originAirport === meta.selectedFlightOrigin) ?? meta.flightQuotes[0]
      : null;

  const { data: insertedSnap, error: snapErr } = await supabase
    .from("simulation_price_snapshots")
    .insert({
      simulation_id: sim.id,
      category: meta.category,
      store_or_provider: meta.storeOrProvider,
      cash_price: centsToReaisString(meta.cashPriceCents),
      installment_total: centsToReaisString(meta.installmentTotalCents),
      installments: meta.installments,
      flight_cash_price: bestFlight ? centsToReaisString(bestFlight.cashTotalCents) : null,
      flight_origin: bestFlight ? bestFlight.originAirport : null,
      stay_cash_price: meta.stayQuote ? centsToReaisString(meta.stayQuote.cashTotalCents) : null,
      stay_installment_total: meta.stayQuote ? centsToReaisString(meta.stayQuote.installmentTotalCents) : null,
      offer_url: meta.offerUrl ?? null,
      verified_new: true,
      verification_meta: {
        verificationSummary: meta.verificationSummary,
        rejectedCount: meta.rejectedCount ?? 0,
      },
    })
    .select("*")
    .single();

  if (snapErr || !insertedSnap) {
    console.error("recordSnapshot error:", snapErr);
    return { snapshot: null, alert: null };
  }

  const snapshot = mapSimulationPriceSnapshotRow(insertedSnap as SimulationPriceSnapshotRow);

  // Avalia se houve queda de preço frente ao snapshot anterior / média ou frente ao preço anterior da simulação
  const previousSimCashCents = sim.cash_price ? reaisStringToCents(sim.cash_price) : null;
  const latestPrevSnapshotCents = history[0] ? reaisStringToCents(history[0].cash_price) : previousSimCashCents;
  const historicalMinCents =
    history.length > 0
      ? Math.min(...history.map((h) => reaisStringToCents(h.cash_price)))
      : previousSimCashCents ?? meta.cashPriceCents;

  const cfg = await getNotificationChannelsConfig();
  const thresholdPct = cfg.dropThresholdPercent ?? 4;

  let alertRow: SimulationPriceAlertRow | null = null;
  const refOldCents = latestPrevSnapshotCents ?? previousSimCashCents;

  if (refOldCents && refOldCents > meta.cashPriceCents) {
    const dropCents = refOldCents - meta.cashPriceCents;
    const dropPercent = Number(((dropCents / refOldCents) * 100).toFixed(2));
    const isNewLow = meta.cashPriceCents < historicalMinCents;

    if (dropPercent >= thresholdPct || isNewLow) {
      // Marca alertas anteriores não lidos desta simulação como lidos para nunca empilhar alertas repetidos
      await supabase
        .from("simulation_price_alerts")
        .update({ read_at: new Date().toISOString() })
        .eq("simulation_id", sim.id)
        .is("read_at", null);

      const alertType = isNewLow ? "new_low" : "drop_detected";
      const title =
        meta.category === "travel"
          ? `Queda de preço na Viagem: ${sim.description} (-${dropPercent.toFixed(1).replace(".", ",")}%)`
          : `Menor preço verificado: ${sim.description} (-${dropPercent.toFixed(1).replace(".", ",")}%)`;

      const message =
        meta.category === "travel"
          ? `Caiu ${formatCurrencyBRL(dropCents)}! Pacote Voo + Hospedagem agora sai por ${formatCurrencyBRL(meta.cashPriceCents)} à vista ou ${meta.installments}x de ${formatCurrencyBRL(Math.round(meta.installmentTotalCents / meta.installments))} (${meta.storeOrProvider}).`
          : `Caiu ${formatCurrencyBRL(dropCents)} na loja oficial ${meta.storeOrProvider}! Item 100% novo e sem condição oculta: ${formatCurrencyBRL(meta.cashPriceCents)} à vista (PIX) ou ${meta.installments}x de ${formatCurrencyBRL(Math.round(meta.installmentTotalCents / meta.installments))} (total ${formatCurrencyBRL(meta.installmentTotalCents)}).`;

      const sentTg = await sendTelegramAlertIfConfigured(title, message, meta.offerUrl);
      const channels = ["in_app", ...(cfg.browserPushEnabled ? ["web_push"] : []), ...(sentTg ? ["telegram"] : [])];

      const { data: createdAlert } = await supabase
        .from("simulation_price_alerts")
        .insert({
          simulation_id: sim.id,
          snapshot_id: snapshot.id,
          alert_type: alertType,
          title,
          message,
          previous_cash_price: centsToReaisString(refOldCents),
          new_cash_price: centsToReaisString(meta.cashPriceCents),
          drop_percent: String(dropPercent),
          offer_url: meta.offerUrl ?? null,
          notified_channels: channels,
        })
        .select("*")
        .single();

      if (createdAlert) alertRow = createdAlert as SimulationPriceAlertRow;
    }
  } else if (history.length === 0) {
    // Primeiro rastreamento: registra alerta informativo de linha de base verificada
    const title =
      meta.category === "travel"
        ? `Rastreamento iniciado: ${sim.description}`
        : `Preço real auditado (4 camadas): ${sim.description}`;
    const message =
      meta.category === "travel"
        ? `Menor combinação hoje (${meta.storeOrProvider}): ${formatCurrencyBRL(meta.cashPriceCents)} à vista ou ${meta.installments}x totalizando ${formatCurrencyBRL(meta.installmentTotalCents)}.`
        : `Menor oferta 100% nova e oficial hoje em ${meta.storeOrProvider}: ${formatCurrencyBRL(meta.cashPriceCents)} à vista (PIX) e ${meta.installments}x totalizando ${formatCurrencyBRL(meta.installmentTotalCents)} na mesma loja.`;

    const { data: createdAlert } = await supabase
      .from("simulation_price_alerts")
      .insert({
        simulation_id: sim.id,
        snapshot_id: snapshot.id,
        alert_type: "initial_baseline",
        title,
        message,
        previous_cash_price: refOldCents ? centsToReaisString(refOldCents) : null,
        new_cash_price: centsToReaisString(meta.cashPriceCents),
        drop_percent: null,
        offer_url: meta.offerUrl ?? null,
        notified_channels: ["in_app"],
      })
      .select("*")
      .single();
    if (createdAlert) alertRow = createdAlert as SimulationPriceAlertRow;
  }

  return {
    snapshot,
    alert: alertRow ? mapSimulationPriceAlertRow(alertRow) : null,
  };
}

/**
 * Atualiza imediatamente o rastreamento de preços de uma simulação salva,
 * sincronizando o menor valor à vista e parcelado da mesma loja (ou Voo + Resort) com a simulação.
 */
export async function refreshSimulationPriceTracking(
  simulationId: string
): Promise<
  | {
      ok: true;
      simulation: Simulation;
      snapshot: SimulationPriceSnapshot | null;
      alert: SimulationPriceAlert | null;
    }
  | { ok: false; error: string }
> {
  const supabase = createAdminClient();
  const { data: row, error: readErr } = await supabase
    .from("simulations")
    .select("*")
    .eq("id", simulationId)
    .single();

  if (readErr || !row) {
    return { ok: false, error: "Simulação não encontrada." };
  }

  const sim = row as SimulationRow;
  const category: SimulationCategory =
    sim.category && (sim.category === "product" || sim.category === "travel")
      ? sim.category
      : inferCategoryFromDescription(sim.description);

  const hasConfig = sim.tracker_config && Object.keys(sim.tracker_config).length > 0;
  const trackerConfig: SimulationTrackerConfig = hasConfig
    ? sim.tracker_config!
    : category === "travel"
      ? buildDefaultTravelTrackerConfig(sim.description, sim.start_date)
      : buildDefaultProductTrackerConfig(sim.description);

  const meta =
    category === "travel"
      ? await trackTravelPrices(sim.description, sim.start_date, trackerConfig as Partial<TravelTrackerConfig>)
      : await trackProductPrices(sim.description, trackerConfig as Partial<ProductTrackerConfig>);

  const mergeHist = (prev?: { date: string; priceCents: number; source?: string }[], next?: { date: string; priceCents: number; source?: string }[]) => {
    const p = prev ?? [];
    const n = next ?? [];
    if (p.length === 0 && n.length === 0) return undefined;
    const map = new Map(p.map((pt) => [pt.date, pt]));
    for (const pt of n) map.set(pt.date, pt);
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  };

  const mergedAll = mergeHist(sim.best_offer_meta?.historicalPrices, meta.historicalPrices);
  const mergedStay = mergeHist(sim.best_offer_meta?.stayHistoricalPrices, meta.stayHistoricalPrices);
  const mergedFlight = mergeHist(sim.best_offer_meta?.flightHistoricalPrices, meta.flightHistoricalPrices);
  if (mergedAll) meta.historicalPrices = mergedAll;
  if (mergedStay) meta.stayHistoricalPrices = mergedStay;
  if (mergedFlight) meta.flightHistoricalPrices = mergedFlight;

  const { snapshot, alert } = await recordSnapshotAndEvaluateAlerts(sim, meta);

  const { data: updatedRow, error: updErr } = await supabase
    .from("simulations")
    .update({
      category,
      auto_track: true,
      tracker_config: trackerConfig,
      best_offer_meta: meta,
      last_tracked_at: meta.checkedAt,
      cash_price: centsToReaisString(meta.cashPriceCents),
      total_amount: centsToReaisString(meta.installmentTotalCents),
      installments: meta.installments,
      updated_at: new Date().toISOString(),
    })
    .eq("id", simulationId)
    .select("*")
    .single();

  if (updErr || !updatedRow) {
    return { ok: false, error: "Não foi possível atualizar a simulação com os preços rastreados." };
  }

  revalidatePath("/simulacao");
  return {
    ok: true,
    simulation: mapSimulationRow(updatedRow as SimulationRow),
    snapshot,
    alert,
  };
}

/**
 * Audita um print/screenshot de oferta (ex.: app da Amazon no celular com desconto Pix/NuPay logado)
 * nas 4 camadas anti-falso-positivo e atualiza a simulação se for uma oferta válida.
 */
export async function importOfferScreenshotToSimulation(
  simulationId: string,
  imageDataUrl: string
): Promise<
  | {
      ok: true;
      simulation: Simulation;
      snapshot: SimulationPriceSnapshot | null;
      alert: SimulationPriceAlert | null;
    }
  | { ok: false; error: string }
> {
  const supabase = createAdminClient();
  const { data: row, error: readErr } = await supabase
    .from("simulations")
    .select("*")
    .eq("id", simulationId)
    .single();

  if (readErr || !row) return { ok: false, error: "Simulação não encontrada." };
  const sim = row as SimulationRow;

  const audited = await auditOfferFromScreenshot(
    sim.description,
    imageDataUrl,
    sim.best_offer_meta,
    (sim.tracker_config as Partial<ProductTrackerConfig>) ?? null
  );
  if (!audited.ok) return audited;

  const meta = audited.meta;
  const { snapshot, alert } = await recordSnapshotAndEvaluateAlerts(sim, meta);

  const { data: updatedRow, error: updErr } = await supabase
    .from("simulations")
    .update({
      auto_track: true,
      best_offer_meta: meta,
      last_tracked_at: meta.checkedAt,
      cash_price: centsToReaisString(meta.cashPriceCents),
      total_amount: centsToReaisString(meta.installmentTotalCents),
      installments: meta.installments,
      updated_at: new Date().toISOString(),
    })
    .eq("id", simulationId)
    .select("*")
    .single();

  if (updErr || !updatedRow) {
    return { ok: false, error: "Não foi possível salvar a oferta auditada do print." };
  }

  revalidatePath("/simulacao");
  return {
    ok: true,
    simulation: mapSimulationRow(updatedRow as SimulationRow),
    snapshot,
    alert,
  };
}

/**
 * Atualiza todas as simulações ativas que possuem rastreamento ativo (ou todas as selecionadas).
 */
export async function refreshMultipleSimulationsTracking(
  simulationIds?: string[]
): Promise<{
  ok: true;
  updatedSimulations: Simulation[];
  newAlerts: SimulationPriceAlert[];
}> {
  const supabase = createAdminClient();
  let query = supabase.from("simulations").select("*").eq("active", true);
  if (simulationIds && simulationIds.length > 0) {
    query = query.in("id", simulationIds);
  } else {
    query = query.eq("auto_track", true).in("category", ["product", "travel"]);
  }

  const { data: rows } = await query;
  const updatedSimulations: Simulation[] = [];
  const newAlerts: SimulationPriceAlert[] = [];

  const settled = await Promise.allSettled(
    ((rows ?? []) as SimulationRow[]).map((r) => refreshSimulationPriceTracking(r.id))
  );

  for (const item of settled) {
    if (item.status === "fulfilled" && item.value.ok) {
      updatedSimulations.push(item.value.simulation);
      if (item.value.alert) newAlerts.push(item.value.alert);
    }
  }

  revalidatePath("/simulacao");
  return { ok: true, updatedSimulations, newAlerts };
}

export async function getPriceTrackingDashboardData(simulationIds?: string[]): Promise<{
  snapshotsBySimId: Record<string, SimulationPriceSnapshot[]>;
  alerts: SimulationPriceAlert[];
}> {
  const supabase = createAdminClient();
  let snapQuery = supabase
    .from("simulation_price_snapshots")
    .select("*")
    .order("captured_at", { ascending: true })
    .limit(300);

  const alertQuery = supabase
    .from("simulation_price_alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  if (simulationIds && simulationIds.length > 0) {
    snapQuery = snapQuery.in("simulation_id", simulationIds);
  }

  const [{ data: snapRows }, { data: alertRows }] = await Promise.all([snapQuery, alertQuery]);

  const snapshotsBySimId: Record<string, SimulationPriceSnapshot[]> = {};
  for (const r of (snapRows ?? []) as SimulationPriceSnapshotRow[]) {
    const mapped = mapSimulationPriceSnapshotRow(r);
    if (!snapshotsBySimId[mapped.simulationId]) {
      snapshotsBySimId[mapped.simulationId] = [];
    }
    snapshotsBySimId[mapped.simulationId].push(mapped);
  }

  const alerts = ((alertRows ?? []) as SimulationPriceAlertRow[]).map(mapSimulationPriceAlertRow);
  return { snapshotsBySimId, alerts };
}

export async function markPriceAlertRead(alertId: string): Promise<{ ok: true }> {
  const supabase = createAdminClient();
  await supabase
    .from("simulation_price_alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("id", alertId);
  revalidatePath("/simulacao");
  return { ok: true };
}
