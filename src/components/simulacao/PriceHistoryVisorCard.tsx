"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PriceHistoryPoint } from "@/types/db";
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
}: {
  idPrefix: string;
  points: PriceHistoryPoint[];
  currentPriceCents: number;
  title?: string;
  headerExtra?: ReactNode;
}) {
  const [windowKey, setWindowKey] = useState<HistoryWindowKey>("1a");
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setZoomDomain(null);
  }, [idPrefix]);

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
                    formatter={(v) => [formatCurrencyBRL(Math.round(Number(v) * 100)), "Preço"]}
                    labelFormatter={(v) => `Data: ${formatTooltipDate(Number(v))}`}
                    contentStyle={{ borderRadius: 10, border: "1px solid var(--color-border)", fontSize: 11 }}
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

        {/* Card "Como está o preço hoje" (Anti-Black-Fraude) */}
        <div className="flex flex-col justify-between rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-3.5">
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
          </div>
        </div>
      </div>
    </div>
  );
}
