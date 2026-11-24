import type { PriceHistoryPoint } from "@/types/db";
import type { SimulationPriceSnapshot } from "@/types/domain";

export type HistoryWindowKey = "40d" | "3m" | "6m" | "1a";

export const HISTORY_WINDOW_DAYS: Record<HistoryWindowKey, number> = {
  "40d": 40,
  "3m": 90,
  "6m": 180,
  "1a": 365,
};

export interface PriceHistoryStats {
  points: PriceHistoryPoint[];
  minCents: number;
  maxCents: number;
  medianCents: number;
  observedDays: number;
  windowDays: number;
  deltaFromMedianPct: number;
  positionRatio: number;
  status: "below" | "above" | "fair";
}

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Combina pontos históricos da web com snapshots reais capturados no banco.
 * Snapshots reais prevalecem sobre pontos web na mesma data YYYY-MM-DD.
 */
export function mergePriceHistoryPoints(
  webPoints: PriceHistoryPoint[] | undefined,
  snapshots: SimulationPriceSnapshot[],
  currentCashCents?: number | null,
  nowDate: Date = new Date()
): PriceHistoryPoint[] {
  const byDate = new Map<string, PriceHistoryPoint>();

  for (const pt of webPoints ?? []) {
    if (!pt?.date || !/^\d{4}-\d{2}-\d{2}$/.test(pt.date) || pt.priceCents <= 0) continue;
    byDate.set(pt.date, {
      date: pt.date,
      priceCents: Math.round(pt.priceCents),
      source: pt.source,
    });
  }

  for (const snap of snapshots) {
    if (!snap?.capturedAt || snap.cashPriceCents <= 0) continue;
    const day = snap.capturedAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    byDate.set(day, {
      date: day,
      priceCents: Math.round(snap.cashPriceCents),
      source: snap.storeOrProvider || "Rastreador",
    });
  }

  if (currentCashCents && currentCashCents > 0) {
    const today = toIsoDay(nowDate);
    byDate.set(today, {
      date: today,
      priceCents: Math.round(currentCashCents),
      source: byDate.get(today)?.source ?? "Hoje",
    });
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calcula menor, maior, mediana estatística e posição relativa do preço atual
 * dentro da janela selecionada (40d / 3m / 6m / 1a).
 */
export function computePriceHistoryStats(
  points: PriceHistoryPoint[],
  windowKey: HistoryWindowKey,
  currentPriceCents: number,
  nowDate: Date = new Date()
): PriceHistoryStats {
  const windowDays = HISTORY_WINDOW_DAYS[windowKey];
  const cutoff = new Date(nowDate);
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const cutoffDay = toIsoDay(cutoff);

  const inWindow = points.filter((p) => p.date >= cutoffDay);
  const effectivePoints = inWindow.length >= 2 ? inWindow : points;

  if (effectivePoints.length === 0) {
    const fallback = Math.max(0, Math.round(currentPriceCents));
    return {
      points: [],
      minCents: fallback,
      maxCents: fallback,
      medianCents: fallback,
      observedDays: 0,
      windowDays,
      deltaFromMedianPct: 0,
      positionRatio: 0.5,
      status: "fair",
    };
  }

  const sortedPrices = effectivePoints.map((p) => p.priceCents).sort((a, b) => a - b);
  const minCents = sortedPrices[0];
  const maxCents = sortedPrices[sortedPrices.length - 1];
  const mid = Math.floor(sortedPrices.length / 2);
  const medianCents =
    sortedPrices.length % 2 === 1
      ? sortedPrices[mid]
      : Math.round((sortedPrices[mid - 1] + sortedPrices[mid]) / 2);

  const safeCurrent = currentPriceCents > 0 ? currentPriceCents : effectivePoints[effectivePoints.length - 1].priceCents;
  const deltaFromMedianPct =
    medianCents > 0 ? ((safeCurrent - medianCents) / medianCents) * 100 : 0;

  const span = maxCents - minCents;
  const rawRatio = span > 0 ? (safeCurrent - minCents) / span : 0.5;
  const positionRatio = Math.max(0, Math.min(1, rawRatio));

  let status: "below" | "above" | "fair" = "fair";
  if (deltaFromMedianPct <= -3) status = "below";
  else if (deltaFromMedianPct >= 3) status = "above";

  return {
    points: effectivePoints,
    minCents,
    maxCents,
    medianCents,
    observedDays: effectivePoints.length,
    windowDays,
    deltaFromMedianPct,
    positionRatio,
    status,
  };
}
