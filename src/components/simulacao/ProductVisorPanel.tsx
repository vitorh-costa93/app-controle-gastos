"use client";

import { useMemo, useState } from "react";
import { Bell, Camera, ChevronDown, ChevronUp, ExternalLink, ShoppingBag } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VerifiedProductOffer } from "@/types/db";
import type { Simulation, SimulationPriceSnapshot } from "@/types/domain";
import {
  computePriceHistoryStats,
  HISTORY_WINDOW_DAYS,
  HistoryWindowKey,
  mergePriceHistoryPoints,
} from "@/lib/price-tracking/history-stats";
import { formatCurrencyBRL } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const WINDOW_OPTIONS: Array<{ key: HistoryWindowKey; label: string }> = [
  { key: "40d", label: "40d" },
  { key: "3m", label: "3m" },
  { key: "6m", label: "6m" },
  { key: "1a", label: "1a" },
];

const DAY_MS = 86_400_000;

function getStoreInitials(store: string): string {
  const cleaned = store.replace(/[^a-zA-Z0-9À-ÿ ]/g, " ").trim();
  if (!cleaned) return "L";
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function parseIsoDayUtcMs(isoDay: string): number {
  const [y, m, d] = isoDay.split("-").map(Number);
  if (!y || !m || !d) return Date.now();
  return Date.UTC(y, m - 1, d);
}

function buildWindowTicks(windowStartMs: number, nowMs: number, windowKey: HistoryWindowKey): number[] {
  const count = windowKey === "1a" || windowKey === "6m" ? 7 : windowKey === "3m" ? 4 : 5;
  const ticks: number[] = [];
  for (let i = 0; i < count; i++) {
    ticks.push(Math.round(windowStartMs + ((nowMs - windowStartMs) * i) / (count - 1)));
  }
  return ticks;
}

function formatAxisTick(ts: number, windowKey: HistoryWindowKey): string {
  const d = new Date(ts);
  if (windowKey === "1a" || windowKey === "6m") {
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

export function ProductVisorPanel({
  sim,
  history,
  isRefreshing,
  onSelectOffer,
  onOpenAlerts,
  onUploadScreenshot,
}: {
  sim: Simulation;
  history: SimulationPriceSnapshot[];
  isRefreshing: boolean;
  onSelectOffer: (sim: Simulation, offer: VerifiedProductOffer) => void;
  onOpenAlerts: () => void;
  onUploadScreenshot: (simId: string, file: File) => void;
}) {
  const [showAllOffers, setShowAllOffers] = useState(false);
  const [windowKey, setWindowKey] = useState<HistoryWindowKey>("1a");

  const meta = sim.bestOfferMeta;
  const offers = meta?.productOffers ?? [];
  const visibleOffers = showAllOffers ? offers : offers.slice(0, 4);

  const currentCashCents =
    sim.cashPriceCents && sim.cashPriceCents > 0
      ? sim.cashPriceCents
      : meta?.cashPriceCents && meta.cashPriceCents > 0
      ? meta.cashPriceCents
      : sim.totalAmountCents;

  const mergedPoints = useMemo(
    () => mergePriceHistoryPoints(meta?.historicalPrices, history, currentCashCents),
    [meta?.historicalPrices, history, currentCashCents]
  );

  const stats = useMemo(
    () => computePriceHistoryStats(mergedPoints, windowKey, currentCashCents),
    [mergedPoints, windowKey, currentCashCents]
  );

  const { nowMs, windowStartMs, xTicks } = useMemo(() => {
    const today = new Date();
    const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const start = end - HISTORY_WINDOW_DAYS[windowKey] * DAY_MS;
    return {
      nowMs: end,
      windowStartMs: start,
      xTicks: buildWindowTicks(start, end, windowKey),
    };
  }, [windowKey]);

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

  const absDeltaPct = Math.round(Math.abs(stats.deltaFromMedianPct));
  const gradientId = `visor-hist-${sim.id.slice(0, 8)}`;

  return (
    <div className="space-y-4">
      {/* Topo: Imagem do Produto + Lista de Ofertas */}
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="flex flex-col gap-2">
          <div className="flex h-48 items-center justify-center overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-white p-3">
            {sim.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sim.imageUrl}
                alt={sim.description}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-(--color-text-tertiary)">
                <ShoppingBag size={36} strokeWidth={1.5} />
                <span className="text-[11px]">Sem imagem</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenAlerts}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2.5 py-1.5 text-[11px] font-semibold text-(--color-text-primary) hover:bg-black/5"
            >
              <Bell size={12} className="text-(--color-primary)" />
              Avisar quando baixar
            </button>
            <label
              title="Ler print de oferta do app"
              className={cn(
                "inline-flex cursor-pointer items-center justify-center gap-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2.5 py-1.5 text-[11px] font-semibold text-(--color-text-primary) hover:bg-black/5",
                isRefreshing && "pointer-events-none opacity-50"
              )}
            >
              <Camera size={12} className="text-(--color-primary)" />
              Print
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isRefreshing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadScreenshot(sim.id, f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </div>

        {/* Coluna de Ofertas */}
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h5 className="text-xs font-bold text-(--color-text-primary)">Ofertas</h5>
              <p className="text-[11px] text-(--color-text-tertiary)">Preço e estoque são da loja.</p>
            </div>
            {meta?.checkedAt && (
              <span className="text-[11px] text-(--color-text-tertiary)">
                Checado em {new Date(meta.checkedAt).toLocaleString("pt-BR")}
              </span>
            )}
          </div>

          {offers.length === 0 ? (
            <div className="rounded-(--radius-md) border border-dashed border-(--color-border) bg-black/[0.015] px-4 py-5 text-center text-xs text-(--color-text-secondary)">
              Clique em <b>Atualizar</b> acima para buscar ofertas nas lojas oficiais e o histórico de preço.
            </div>
          ) : (
            <div className="space-y-2 pt-2.5">
              {visibleOffers.map((offer, idx) => {
                const isBest = idx === 0;
                const isActiveStore =
                  sim.cashPriceCents === offer.cashPriceCents &&
                  sim.totalAmountCents === offer.installmentTotalCents;
                const parcelValue = Math.round(offer.installmentTotalCents / Math.max(1, offer.installments));

                return (
                  <div
                    key={`${offer.store}-${idx}`}
                    className={cn(
                      "relative flex flex-wrap items-center justify-between gap-3 rounded-(--radius-lg) border bg-(--color-surface) px-3.5 py-2.5",
                      isBest ? "border-(--color-positive) pt-3.5" : "border-(--color-border)"
                    )}
                  >
                    {isBest && (
                      <span className="absolute -top-2.5 left-3 rounded-full bg-(--color-positive) px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                        Menor preço
                      </span>
                    )}

                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-(--color-border) bg-black/[0.03] text-[11px] font-bold text-(--color-text-secondary)">
                        {getStoreInitials(offer.store)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-(--color-text-primary)">
                            {offer.store}
                          </span>
                          {isActiveStore && (
                            <span className="rounded-full bg-(--color-positive-soft) px-2 py-0.5 text-[10px] font-semibold text-(--color-positive)">
                              Na simulação
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-(--color-text-tertiary)">
                          Novo · {offer.installments}x de {formatCurrencyBRL(parcelValue)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 tabular-nums">
                      <div className="text-left sm:text-right">
                        <div className="text-sm font-bold text-(--color-text-primary)">
                          {formatCurrencyBRL(offer.cashPriceCents)}
                        </div>
                        {offer.installmentTotalCents !== offer.cashPriceCents && (
                          <div className="text-[10px] text-(--color-text-tertiary)">
                            {formatCurrencyBRL(offer.installmentTotalCents)} parc.
                          </div>
                        )}
                      </div>

                      {!isActiveStore && (
                        <button
                          type="button"
                          onClick={() => onSelectOffer(sim, offer)}
                          className="rounded-(--radius-md) border border-(--color-primary)/30 bg-(--color-primary-soft) px-2.5 py-1.5 text-[11px] font-semibold text-(--color-primary) hover:opacity-85"
                        >
                          Aplicar
                        </button>
                      )}

                      <a
                        href={offer.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-(--radius-md) bg-(--color-primary) px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90"
                      >
                        Ir à loja <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                );
              })}

              {offers.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllOffers((prev) => !prev)}
                  className="flex w-full items-center justify-center gap-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) py-1.5 text-xs font-semibold text-(--color-text-secondary) hover:bg-black/5"
                >
                  {showAllOffers ? (
                    <>
                      Mostrar menos ofertas <ChevronUp size={13} />
                    </>
                  ) : (
                    <>
                      Ver todas as ofertas ({offers.length}) <ChevronDown size={13} />
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Base: Histórico de Preço + Termômetro "Como está o preço hoje" */}
      <div className="space-y-2.5 border-t border-(--color-border)/60 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 className="text-xs font-bold text-(--color-text-primary)">Histórico de preço</h5>
          <div className="flex items-center gap-1 rounded-(--radius-md) border border-(--color-border) bg-black/[0.02] p-0.5">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setWindowKey(opt.key)}
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

        <div className="grid gap-3 lg:grid-cols-[1.65fr_1fr]">
          {/* Gráfico de Área (Estilo Visor) */}
          <div className="min-w-0 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-3.5">
            {chartData.length >= 2 ? (
              <div className="h-44 w-full">
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
                      domain={[windowStartMs, nowMs]}
                      ticks={xTicks}
                      padding={{ left: 10, right: 16 }}
                      tickFormatter={(v) => formatAxisTick(Number(v), windowKey)}
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

            <p className="mt-2 text-[11px] leading-relaxed text-(--color-text-secondary) tabular-nums">
              Nos últimos {stats.windowDays} dias: menor preço{" "}
              <b className="text-(--color-text-primary)">{formatCurrencyBRL(stats.minCents)}</b>, maior preço{" "}
              <b className="text-(--color-text-primary)">{formatCurrencyBRL(stats.maxCents)}</b>, mediana{" "}
              <b className="text-(--color-text-primary)">{formatCurrencyBRL(stats.medianCents)}</b>, em{" "}
              {stats.observedDays} {stats.observedDays === 1 ? "dia observado" : "dias observados"}.
            </p>
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
                  title={`Preço atual: ${formatCurrencyBRL(currentCashCents)}`}
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
    </div>
  );
}
