"use client";

import { useMemo, useState } from "react";
import { Bell, Camera, ChevronDown, ChevronUp, ExternalLink, ShoppingBag } from "lucide-react";
import type { VerifiedProductOffer } from "@/types/db";
import type { Simulation, SimulationPriceSnapshot } from "@/types/domain";
import { mergePriceHistoryPoints } from "@/lib/price-tracking/history-stats";
import { PriceHistoryVisorCard } from "@/components/simulacao/PriceHistoryVisorCard";
import { formatCurrencyBRL } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

function getStoreInitials(store: string): string {
  const cleaned = store.replace(/[^a-zA-Z0-9À-ÿ ]/g, " ").trim();
  if (!cleaned) return "L";
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
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
      <PriceHistoryVisorCard
        idPrefix={sim.id}
        points={mergedPoints}
        currentPriceCents={currentCashCents}
      />
    </div>
  );
}
