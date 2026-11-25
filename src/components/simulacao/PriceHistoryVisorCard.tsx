"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PriceHistoryPoint, TravelLeadTimeInsight } from "@/types/db";
import {
  computePriceHistoryStats,
  HISTORY_WINDOW_DAYS,
  HistoryWindowKey,
} from "@/lib/price-tracking/history-stats";
import { formatCurrencyBRL } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const WINDOW_OPTIONS: Array<{ key: HistoryWindowKey; label: string }> = [
  { key: "40d", label: "40d" },
  { key: "3m", label: "3m" },
  { key: "6m", label: "6m" },
  { key: "1a", label: "1a" },
  { key: "18m", label: "18m" },
];

const DAY_MS = 86_400_000;

function parseIsoDayUtcMs(isoDay: string): number {
  const [y, m, d] = isoDay.split("-").map(Number);
  if (!y || !m || !d) return Date.now();
  return Date.UTC(y, m - 1, d);
}

function buildWindowTicks(startMs: number, endMs: number, count: number): number[] {
  const safeCount = Math.max(2, count);
  const ticks: number[] = [];
  for (let i = 0; i < safeCount; i++) {
    ticks.push(Math.round(startMs + ((endMs - startMs) * i) / (safeCount - 1)));
  }
  return ticks;
}

function formatAxisTick(ts: number, spanDays: number): string {
  const d = new Date(ts);
  if (spanDays > 95) {
    return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function formatTooltipDate(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function PriceHistoryVisorCard({
  idPrefix,
  points,
  currentPriceCents,
  title = "Histórico de preço",
  headerExtra,
  leadTimeInsight,
  defaultWindowKey,
}: {
  idPrefix: string;
  points: PriceHistoryPoint[];
  currentPriceCents: number;
  title?: string;
  headerExtra?: ReactNode;
  leadTimeInsight?: TravelLeadTimeInsight | null;
  defaultWindowKey?: HistoryWindowKey;
}) {
  const [windowKey, setWindowKey] = useState<HistoryWindowKey>(
    defaultWindowKey ?? (leadTimeInsight ? "18m" : "1a")
  );
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setZoomDomain(null);
    if (defaultWindowKey) setWindowKey(defaultWindowKey);
  }, [idPrefix, defaultWindowKey]);

  const stats = useMemo(
    () => computePriceHistoryStats(points, windowKey, currentPriceCents),
    [points, windowKey, currentPriceCents]
  );

  const { nowMs, windowStartMs } = useMemo(() => {
    const today = new Date();
    const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const start = end - HISTORY_WINDOW_DAYS[windowKey] * DAY_MS;
    return { nowMs: end, windowStartMs: start };
  }, [windowKey]);

  const [activeStartMs, activeEndMs] = zoomDomain ?? [windowStartMs, nowMs];
  const activeSpanDays = Math.max(1, (activeEndMs - activeStartMs) / DAY_MS);

  const xTicks = useMemo(
    () => buildWindowTicks(activeStartMs, activeEndMs, activeSpanDays > 120 ? 7 : 5),
    [activeStartMs, activeEndMs, activeSpanDays]
  );

  const chartData = useMemo(
    () =>
      stats.points.map((pt) => ({
        ts: parseIsoDayUtcMs(pt.date),
        date: pt.date,
        price: pt.priceCents / 100,
        source: pt.source,
        leadMonthsBeforeTrip: pt.leadMonthsBeforeTrip,
        targetTripMonth: pt.targetTripMonth,
        eventLabel: pt.eventLabel,
      })),
    [stats.points]
  );

  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el || chartData.length < 2) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const plotWidth = Math.max(1, rect.width - 96);
      const rawRatio = (e.clientX - rect.left - 76) / plotWidth;
      const ratio = Math.max(0, Math.min(1, rawRatio));

      setZoomDomain((prev) => {
        const [curStart, curEnd] = prev ?? [windowStartMs, nowMs];
        const curSpan = curEnd - curStart;
        const fullSpan = nowMs - windowStartMs;
        const anchor = curStart + curSpan * ratio;
        const factor = e.deltaY < 0 ? 0.78 : 1.28;
        const nextSpan = Math.max(5 * DAY_MS, Math.min(fullSpan, curSpan * factor));

        if (nextSpan >= fullSpan * 0.98) {
          return null;
        }

        const nextStart = Math.max(windowStartMs, Math.min(nowMs - nextSpan, anchor - nextSpan * ratio));
        return [Math.round(nextStart), Math.round(nextStart + nextSpan)];
      });
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [chartData.length, windowStartMs, nowMs]);

  const absDeltaPct = Math.round(Math.abs(stats.deltaFromMedianPct));
  const gradientId = `visor-hist-${idPrefix.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 14)}`;

  return (
    <div className="space-y-2.5 border-t border-(--color-border)/60 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h5 className="text-xs font-bold text-(--color-text-primary)">{title}</h5>
          {headerExtra}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {zoomDomain !== null && (
            <button
              type="button"
              onClick={() => setZoomDomain(null)}
              className="inline-flex items-center gap-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 py-1 text-[11px] font-semibold text-(--color-primary) hover:bg-(--color-primary-soft)"
            >
              <RotateCcw size={11} /> Resetar zoom
            </button>
          )}
          <div className="flex items-center gap-1 rounded-(--radius-md) border border-(--color-border) bg-black/[0.02] p-0.5">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setWindowKey(opt.key);
                  setZoomDomain(null);
                }}
                className={cn(
                  "rounded-[calc(var(--radius-md)-2px)] px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  windowKey === opt.key
                    ? "bg-(--color-surface) text-(--color-text-primary) shadow-xs"
                    : "text-(--color-text-tertiary) hover:text-(--color-text-primary)"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {leadTimeInsight && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-(--color-text-secondary)">
          <span className="rounded-full bg-(--color-primary-soft) px-2 py-0.5 font-medium text-(--color-primary)">
            Viagem em {leadTimeInsight.targetTripMonthLabel} · Compra planejada: {leadTimeInsight.plannedPurchaseLabel} (
            {leadTimeInsight.plannedLeadMonths}m antes)
          </span>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.65fr_1fr]">
        {/* Gráfico de Área (Estilo Visor com Zoom via scroll) */}
        <div className="min-w-0 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-3.5">
          {chartData.length >= 2 ? (
            <div ref={chartWrapRef} className="h-44 w-full cursor-zoom-in select-none">
              <ResponsiveContainer width="100%" height={176}>
                <AreaChart data={chartData} margin={{ top: 8, right: 20, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    scale="time"
                    allowDataOverflow
                    domain={[activeStartMs, activeEndMs]}
                    ticks={xTicks}
                    padding={{ left: 10, right: 16 }}
                    tickFormatter={(v) => formatAxisTick(Number(v), activeSpanDays)}
                    tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                    domain={["auto", "auto"]}
                    tickFormatter={(v) => `R$ ${Number(v).toLocaleString("pt-BR")}`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const item = payload[0]?.payload as {
                        ts: number;
                        price: number;
                        source?: string;
                        leadMonthsBeforeTrip?: number;
                        targetTripMonth?: string;
                        eventLabel?: string;
                      };
                      return (
                        <div className="rounded-[10px] border border-(--color-border) bg-(--color-surface) px-2.5 py-2 text-[11px] shadow-sm">
                          <div className="font-semibold text-(--color-text-primary)">
                            Data: {formatTooltipDate(item.ts)}
                          </div>
                          <div className="font-bold text-(--color-positive)">
                            Preço: {formatCurrencyBRL(Math.round(Number(item.price) * 100))}
                          </div>
                          {(item.targetTripMonth || item.leadMonthsBeforeTrip !== undefined) && (
                            <div className="text-(--color-text-secondary)">
                              {item.targetTripMonth ? `Viagem-alvo: ${item.targetTripMonth}` : ""}
                              {item.targetTripMonth && item.leadMonthsBeforeTrip !== undefined ? " · " : ""}
                              {item.leadMonthsBeforeTrip !== undefined
                                ? `${item.leadMonthsBeforeTrip}m antes da viagem`
                                : ""}
                            </div>
                          )}
                          {item.eventLabel && (
                            <div className="text-(--color-primary) font-medium">{item.eventLabel}</div>
                          )}
                          {item.source && (
                            <div className="text-[10px] text-(--color-text-tertiary)">Fonte: {item.source}</div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill={`url(#${gradientId})`}
                    dot={{ r: 2.5, fill: "#22c55e" }}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-36 items-center justify-center text-center text-xs text-(--color-text-tertiary)">
              Clique em <b className="mx-1 text-(--color-text-primary)">Atualizar</b> para puxar o histórico de
              preços da web (últimos {stats.windowDays} dias).
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] leading-relaxed text-(--color-text-secondary) tabular-nums">
            <p>
              Nos últimos {stats.windowDays} dias: menor preço{" "}
              <b className="text-(--color-text-primary)">{formatCurrencyBRL(stats.minCents)}</b>, maior preço{" "}
              <b className="text-(--color-text-primary)">{formatCurrencyBRL(stats.maxCents)}</b>, mediana{" "}
              <b className="text-(--color-text-primary)">{formatCurrencyBRL(stats.medianCents)}</b>, em{" "}
              {stats.observedDays} {stats.observedDays === 1 ? "dia observado" : "dias observados"}.
            </p>
            {chartData.length >= 2 && (
              <span className="text-[10px] text-(--color-text-tertiary)">
                Role o mouse no gráfico para dar zoom
              </span>
            )}
          </div>
        </div>

        {/* Card "Quando comprar?" (para Viagens com Antecedência) ou "Como está o preço hoje" (Anti-Black-Fraude) */}
        <div className="flex flex-col justify-between rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-3.5">
          {leadTimeInsight ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h6 className="text-xs font-bold text-(--color-text-primary)">Quando comprar?</h6>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    leadTimeInsight.deltaLeadTimeAffectsPrice
                      ? "bg-amber-500/15 text-amber-700"
                      : "bg-emerald-500/15 text-emerald-700"
                  )}
                >
                  Antecedência:{" "}
                  {leadTimeInsight.deltaLeadTimeAffectsPrice ? "Sim, influencia" : "Baixa variação"} ·{" "}
                  {leadTimeInsight.variationPct}%
                </span>
              </div>

              <div className="rounded-(--radius-md) bg-black/[0.025] p-2 text-[11px] space-y-1 tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-(--color-text-secondary)">Melhor antecedência:</span>
                  <b className="text-(--color-positive)">
                    {leadTimeInsight.bestWindowLabel} ({formatCurrencyBRL(leadTimeInsight.bestPriceCents)})
                  </b>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-(--color-text-secondary)">
                    Seu plano ({leadTimeInsight.plannedPurchaseLabel} · {leadTimeInsight.plannedLeadMonths}m):
                  </span>
                  <b className="text-(--color-text-primary)">
                    {leadTimeInsight.plannedWindowPriceCents
                      ? formatCurrencyBRL(leadTimeInsight.plannedWindowPriceCents)
                      : "Sem coleta na janela"}
                  </b>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-(--color-text-secondary)">Hoje ({leadTimeInsight.todayLeadMonths}m antes):</span>
                  <b className="text-(--color-text-primary)">
                    {currentPriceCents > 0
                      ? formatCurrencyBRL(currentPriceCents)
                      : stats.points.length > 0
                        ? formatCurrencyBRL(stats.points[stats.points.length - 1].priceCents)
                        : "Sem cotação hoje"}
                  </b>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-(--color-text-secondary)">
                {leadTimeInsight.recommendation}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <h6 className="text-xs font-bold text-(--color-text-primary)">Como está o preço hoje</h6>
              <p className="text-xs leading-relaxed text-(--color-text-secondary)">
                {stats.observedDays === 0 ? (
                  "Sem histórico suficiente para comparar com a mediana."
                ) : stats.status === "below" ? (
                  <>
                    O preço está{" "}
                    <b className="text-(--color-positive)">
                      {absDeltaPct}% abaixo da mediana
                    </b>{" "}
                    de {stats.windowDays} dias: <b>{formatCurrencyBRL(stats.medianCents)}</b>.
                  </>
                ) : stats.status === "above" ? (
                  <>
                    O preço está pelo menos{" "}
                    <b className="text-(--color-warning)">
                      {absDeltaPct}% acima da mediana
                    </b>{" "}
                    de {stats.windowDays} dias: <b>{formatCurrencyBRL(stats.medianCents)}</b>.
                  </>
                ) : (
                  <>
                    O preço está na mediana de {stats.windowDays} dias:{" "}
                    <b>{formatCurrencyBRL(stats.medianCents)}</b>.
                  </>
                )}
              </p>
            </div>
          )}

          <div className="mt-4 space-y-2">
            <div className="relative h-2 w-full rounded-full bg-gradient-to-r from-emerald-500 via-sky-500 to-amber-500">
              <span
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-900 bg-white shadow-sm"
                style={{ left: `clamp(8px, ${Math.round(stats.positionRatio * 100)}%, calc(100% - 8px))` }}
                title={`Preço atual: ${formatCurrencyBRL(currentPriceCents)}`}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] font-medium text-(--color-text-tertiary) tabular-nums">
              <span>{formatCurrencyBRL(stats.minCents)}</span>
              <span>{formatCurrencyBRL(stats.maxCents)}</span>
            </div>
            {leadTimeInsight?.methodologyNote && (
              <p className="text-[10px] leading-snug text-(--color-text-tertiary)">
                {leadTimeInsight.methodologyNote}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
