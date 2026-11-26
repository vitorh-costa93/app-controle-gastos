import type { PriceHistoryPoint, TravelLeadTimeBucket, TravelLeadTimeInsight } from "@/types/db";
import type { SimulationPriceSnapshot } from "@/types/domain";

export type HistoryWindowKey = "40d" | "3m" | "6m" | "1a" | "18m";

export const HISTORY_WINDOW_DAYS: Record<HistoryWindowKey, number> = {
  "40d": 40,
  "3m": 90,
  "6m": 180,
  "1a": 365,
  "18m": 548,
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
      ...(pt.leadMonthsBeforeTrip !== undefined ? { leadMonthsBeforeTrip: pt.leadMonthsBeforeTrip } : {}),
      ...(pt.targetTripMonth ? { targetTripMonth: pt.targetTripMonth } : {}),
      ...(pt.eventLabel ? { eventLabel: pt.eventLabel } : {}),
      ...(pt.evidenceType ? { evidenceType: pt.evidenceType } : {}),
    });
  }

  for (const snap of snapshots) {
    if (!snap?.capturedAt || snap.cashPriceCents <= 0) continue;
    const day = snap.capturedAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const existing = byDate.get(day);
    byDate.set(day, {
      ...existing,
      date: day,
      priceCents: Math.round(snap.cashPriceCents),
      source: snap.storeOrProvider || existing?.source || "Rastreador",
    });
  }

  if (currentCashCents && currentCashCents > 0) {
    const today = toIsoDay(nowDate);
    const existing = byDate.get(today);
    byDate.set(today, {
      ...existing,
      date: today,
      priceCents: Math.round(currentCashCents),
      source: existing?.source ?? "Hoje",
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

function diffMonthsUtc(fromIso: string, toIso: string): number {
  const [fy, fm] = fromIso.slice(0, 7).split("-").map(Number);
  const [ty, tm] = toIso.slice(0, 7).split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return 0;
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

function formatMonthYearPtBr(isoOrYm: string): string {
  const [y, m] = isoOrYm.slice(0, 7).split("-").map(Number);
  if (!y || !m) return isoOrYm;
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return dt.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
}

function inferNextSeasonMonth(purchaseDate: string, targetMonthNum: number): string {
  const [py, pm] = purchaseDate.slice(0, 7).split("-").map(Number);
  if (!py || !pm || !targetMonthNum) return purchaseDate.slice(0, 7);
  const targetYear = pm <= targetMonthNum ? py : py + 1;
  return `${targetYear}-${String(targetMonthNum).padStart(2, "0")}`;
}

export function buildTravelLeadTimeInsight(params: {
  kind: "stay" | "flight";
  points: PriceHistoryPoint[];
  targetTripDate: string;
  plannedPurchaseDate: string;
  aiBestWindow?: {
    bestLeadMonthsMin?: number;
    bestLeadMonthsMax?: number;
    bestWindowLabel?: string;
    recommendation?: string;
  } | null;
  nowDate?: Date;
}): TravelLeadTimeInsight | null {
  const { kind, points, targetTripDate, plannedPurchaseDate, aiBestWindow, nowDate = new Date() } = params;
  if (points.length === 0) return null;

  const targetMonthNum = Number(targetTripDate.slice(5, 7)) || 9;
  const todayIso = toIsoDay(nowDate);
  const plannedLeadMonths = diffMonthsUtc(plannedPurchaseDate, targetTripDate);
  const todayLeadMonths = diffMonthsUtc(todayIso, targetTripDate);
  const targetTripMonthLabel = formatMonthYearPtBr(targetTripDate);
  const plannedPurchaseLabel = formatMonthYearPtBr(plannedPurchaseDate);

  const buckets: TravelLeadTimeBucket[] = points
    .map((pt) => {
      const refTripMonth = pt.targetTripMonth || inferNextSeasonMonth(pt.date, targetMonthNum);
      const leadMonths =
        typeof pt.leadMonthsBeforeTrip === "number" && Number.isFinite(pt.leadMonthsBeforeTrip)
          ? Math.max(0, Math.round(pt.leadMonthsBeforeTrip))
          : diffMonthsUtc(pt.date, `${refTripMonth}-01`);
      return {
        leadMonths,
        purchaseMonthLabel: formatMonthYearPtBr(pt.date),
        referenceTripMonth: refTripMonth,
        date: pt.date,
        priceCents: pt.priceCents,
        source: pt.source || "Histórico Web",
        ...(pt.eventLabel ? { eventLabel: pt.eventLabel } : {}),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  let minBucket = buckets[0];
  let maxPriceCents = buckets[0].priceCents;
  for (const b of buckets) {
    if (b.priceCents < minBucket.priceCents) minBucket = b;
    if (b.priceCents > maxPriceCents) maxPriceCents = b.priceCents;
  }

  const bestPriceCents = minBucket.priceCents;
  const variationPct =
    bestPriceCents > 0 ? Math.round(((maxPriceCents - bestPriceCents) / bestPriceCents) * 100) : 0;
  const deltaLeadTimeAffectsPrice = variationPct >= 8;

  let plannedMatch: TravelLeadTimeBucket | null = null;
  let plannedBestDist = Infinity;
  for (const b of buckets) {
    const dist = Math.abs(b.leadMonths - plannedLeadMonths);
    if (dist <= 1 && (dist < plannedBestDist || (dist === plannedBestDist && b.date > (plannedMatch?.date ?? "")))) {
      plannedMatch = b;
      plannedBestDist = dist;
    }
  }

  const bestLeadMonthsMin =
    typeof aiBestWindow?.bestLeadMonthsMin === "number" && aiBestWindow.bestLeadMonthsMin >= 0
      ? Math.round(aiBestWindow.bestLeadMonthsMin)
      : minBucket.leadMonths;
  const bestLeadMonthsMax =
    typeof aiBestWindow?.bestLeadMonthsMax === "number" && aiBestWindow.bestLeadMonthsMax >= bestLeadMonthsMin
      ? Math.round(aiBestWindow.bestLeadMonthsMax)
      : bestLeadMonthsMin;

  const bestWindowLabel =
    aiBestWindow?.bestWindowLabel?.trim() ||
    (bestLeadMonthsMin === bestLeadMonthsMax
      ? `${bestLeadMonthsMin}m antes da viagem`
      : `${bestLeadMonthsMin} a ${bestLeadMonthsMax} meses antes`);

  const recommendation =
    aiBestWindow?.recommendation?.trim() ||
    (deltaLeadTimeAffectsPrice
      ? `A antecedência influencia bastante (${variationPct}% de variação): a janela mais barata histórica para viajar em ${targetTripMonthLabel} ocorreu com ${bestWindowLabel}. Sua compra planejada em ${plannedPurchaseLabel} fica a ${plannedLeadMonths}m do embarque.`
      : `Variação moderada (${variationPct}%) ao longo da janela de compra; comprar em ${plannedPurchaseLabel} (${plannedLeadMonths}m antes) tende a manter preço próximo da melhor janela (${bestWindowLabel}).`);

  return {
    kind,
    targetTripMonthLabel,
    plannedPurchaseLabel,
    plannedLeadMonths,
    todayLeadMonths,
    bestLeadMonthsMin,
    bestLeadMonthsMax,
    bestWindowLabel,
    bestPriceCents,
    plannedWindowPriceCents: plannedMatch ? plannedMatch.priceCents : null,
    deltaLeadTimeAffectsPrice,
    variationPct,
    recommendation,
    methodologyNote:
      "Comparação por janela de antecedência (ex.: compra em nov/25 para viagem em set/26 e abertura de set/27).",
    buckets,
  };
}
