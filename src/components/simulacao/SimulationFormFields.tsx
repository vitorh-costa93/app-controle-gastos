"use client";

import { useState, useTransition } from "react";
import { FieldGroup, Input } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, Info, Plane, Search, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import { Simulation } from "@/types/domain";
import type { SimulationInput } from "@/lib/data/simulations";
import type {
  BestOfferMeta,
  ProductTrackerConfig,
  SimulationCategory,
  TravelTrackerConfig,
} from "@/types/db";
import { previewTrackedPrices } from "@/lib/data/price-tracking";
import {
  DESTINATION_AIRPORTS,
  ORIGIN_AIRPORTS,
  buildDefaultProductTrackerConfig,
  buildDefaultTravelTrackerConfig,
  formatTravelersSummary,
  inferCategoryFromDescription,
} from "@/lib/price-tracking/catalog";
import { impliedInstallmentRate, netMonthlyYieldRate } from "@/lib/domain/cash-vs-installments";
import { addMonths, formatCurrencyBRL, formatMonthLabel, toISODate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export interface SimulationFormValue {
  category: SimulationCategory;
  autoTrack: boolean;
  description: string;
  cashPriceCents: number;
  useInstallments: boolean;
  installmentTotalCents: number;
  installments: number;
  startDate: string;
  // Campos específicos de Viagem (Destino + Estadia + Datas de Ida e Volta)
  destinationAirport: string;
  destinationLabel: string;
  accommodationName: string;
  outboundDate: string;
  returnDate: string;
  sameDatesForFlight: boolean;
  flightOutboundDate: string;
  flightReturnDate: string;
  originAirports: string[];
  adults: number;
  children: number;
  pets: number;
  allowStops: boolean;
  // Campos opcionais de Produto
  customUrlInput: string;
  targetCashCents: number;
  bestOfferMeta: BestOfferMeta | null;
}

export function emptySimulationForm(): SimulationFormValue {
  const today = toISODate(new Date());
  const defaultOut = addMonths(today.slice(0, 7), 3) + "-10";
  const outTime = new Date(`${defaultOut}T12:00:00Z`).getTime();
  const defaultRet = new Date(outTime + 6 * 86400000).toISOString().slice(0, 10);

  return {
    category: "product",
    autoTrack: true,
    description: "",
    cashPriceCents: 0,
    useInstallments: true,
    installmentTotalCents: 0,
    installments: 10,
    startDate: today,
    destinationAirport: "MCZ",
    destinationLabel: "Maceió - AL (MCZ)",
    accommodationName: "",
    outboundDate: defaultOut,
    returnDate: defaultRet,
    sameDatesForFlight: true,
    flightOutboundDate: defaultOut,
    flightReturnDate: defaultRet,
    originAirports: ["RAO", "VCP"],
    adults: 2,
    children: 0,
    pets: 0,
    allowStops: true,
    customUrlInput: "",
    targetCashCents: 0,
    bestOfferMeta: null,
  };
}

export function formFromSimulation(sim: Simulation): SimulationFormValue {
  const hasInstallments = sim.installments > 1;
  const category = sim.category ?? inferCategoryFromDescription(sim.description);
  const rawCfg = (sim.trackerConfig ?? {}) as Partial<TravelTrackerConfig & ProductTrackerConfig>;
  const defaultTravel = buildDefaultTravelTrackerConfig(sim.description, sim.startDate);

  return {
    category,
    autoTrack: sim.autoTrack ?? true,
    description: sim.description,
    cashPriceCents: sim.cashPriceCents ?? (hasInstallments ? 0 : sim.totalAmountCents),
    useInstallments: hasInstallments,
    installmentTotalCents: hasInstallments ? sim.totalAmountCents : sim.totalAmountCents,
    installments: hasInstallments ? sim.installments : 10,
    startDate: sim.startDate,
    destinationAirport: rawCfg.destinationAirport || defaultTravel.destinationAirport,
    destinationLabel: rawCfg.destinationLabel || defaultTravel.destinationLabel,
    accommodationName: rawCfg.accommodationName || (category === "travel" ? sim.description : ""),
    outboundDate: rawCfg.outboundDate || defaultTravel.outboundDate,
    returnDate: rawCfg.returnDate || defaultTravel.returnDate,
    sameDatesForFlight: rawCfg.sameDatesForFlight !== false,
    flightOutboundDate: rawCfg.flightOutboundDate || rawCfg.outboundDate || defaultTravel.outboundDate,
    flightReturnDate: rawCfg.flightReturnDate || rawCfg.returnDate || defaultTravel.returnDate,
    originAirports:
      rawCfg.originAirports && rawCfg.originAirports.length > 0 ? rawCfg.originAirports : ["RAO", "VCP"],
    adults: rawCfg.adults ?? 2,
    children: rawCfg.children ?? 0,
    pets: rawCfg.pets ?? 0,
    allowStops: rawCfg.allowStops ?? true,
    customUrlInput: (rawCfg.customUrls ?? [])[0] ?? "",
    targetCashCents: rawCfg.targetCashCents ?? rawCfg.targetTotalCents ?? 0,
    bestOfferMeta: sim.bestOfferMeta ?? null,
  };
}

export function isSimulationFormValid(v: SimulationFormValue): boolean {
  if (v.category === "travel") {
    const hasTravelIdentity = Boolean(v.destinationAirport.trim() && v.accommodationName.trim());
    const hasValidStayDates = Boolean(v.outboundDate && v.returnDate && v.returnDate > v.outboundDate);
    const hasValidFlightDates =
      v.sameDatesForFlight ||
      Boolean(v.flightOutboundDate && v.flightReturnDate && v.flightReturnDate >= v.flightOutboundDate);
    if (!hasTravelIdentity || !hasValidStayDates || !hasValidFlightDates) return false;
    // Com rastreamento automático ativo, o usuário não precisa digitar valor manual!
    if (v.autoTrack) return true;
  } else {
    if (!v.description.trim()) return false;
    if (v.autoTrack) return true;
  }

  if (v.cashPriceCents <= 0) return false;
  return !v.useInstallments || (v.installmentTotalCents > 0 && v.installments >= 2);
}

export function simulationFormToInput(v: SimulationFormValue): SimulationInput {
  const customUrls = v.customUrlInput.trim() ? [v.customUrlInput.trim()] : [];
  const effectiveDescription =
    v.category === "travel"
      ? v.description.trim() || `${v.accommodationName.trim()} (${v.destinationAirport})`
      : v.description.trim();

  const trackerConfig =
    v.category === "travel"
      ? ({
          destinationAirport: v.destinationAirport,
          destinationLabel: v.destinationLabel,
          originAirports: v.originAirports.length > 0 ? v.originAirports : ["RAO", "VCP"],
          accommodationName: v.accommodationName.trim(),
          outboundDate: v.outboundDate,
          returnDate: v.returnDate,
          sameDatesForFlight: v.sameDatesForFlight,
          flightOutboundDate: v.sameDatesForFlight ? v.outboundDate : v.flightOutboundDate,
          flightReturnDate: v.sameDatesForFlight ? v.returnDate : v.flightReturnDate,
          includeStay: true,
          includeFlight: true,
          adults: v.adults,
          children: v.children,
          pets: v.pets,
          allowStops: v.allowStops,
          highFrequencyBlackFriday: true,
          targetTotalCents: v.targetCashCents > 0 ? v.targetCashCents : null,
          customUrls,
        } satisfies TravelTrackerConfig)
      : ({
          ...buildDefaultProductTrackerConfig(effectiveDescription),
          targetCashCents: v.targetCashCents > 0 ? v.targetCashCents : null,
          highFrequencyBlackFriday: true,
          customUrls,
        } satisfies ProductTrackerConfig);

  const hasInstallments = v.useInstallments && v.installments >= 2;
  const cashCents = v.cashPriceCents;
  const instTotalCents = hasInstallments ? (v.installmentTotalCents || cashCents) : cashCents;

  return {
    description: effectiveDescription,
    cashPriceCents: cashCents > 0 ? cashCents : null,
    totalAmountCents: instTotalCents,
    installments: hasInstallments ? v.installments : 1,
    startDate: v.startDate,
    category: v.category,
    autoTrack: v.autoTrack,
    trackerConfig,
    bestOfferMeta: v.bestOfferMeta,
  };
}

export function SimulationFormFields({
  value,
  onChange,
  cdiAnnualPercent,
  percentOfCdi,
}: {
  value: SimulationFormValue;
  onChange: (next: SimulationFormValue) => void;
  cdiAnnualPercent: number;
  percentOfCdi: number;
}) {
  const [isSearching, startSearch] = useTransition();
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showManualPrices, setShowManualPrices] = useState(!value.autoTrack);

  const set = (patch: Partial<SimulationFormValue>) => onChange({ ...value, ...patch });

  const nights =
    value.outboundDate && value.returnDate && value.returnDate > value.outboundDate
      ? Math.max(
          1,
          Math.round(
            (new Date(`${value.returnDate}T12:00:00Z`).getTime() -
              new Date(`${value.outboundDate}T12:00:00Z`).getTime()) /
              86400000
          )
        )
      : 0;

  function handleCategorySwitch(nextCat: SimulationCategory) {
    setSearchError(null);
    if (nextCat === "travel") {
      const acc = value.accommodationName || value.description || "";
      set({
        category: "travel",
        accommodationName: acc,
        description: acc || "",
        autoTrack: true,
      });
    } else {
      set({
        category: "product",
        autoTrack: true,
      });
    }
  }

  function toggleOriginAirport(code: string) {
    const exists = value.originAirports.includes(code);
    if (exists && value.originAirports.length <= 1) return; // mantém pelo menos 1 aeroporto
    const next = exists ? value.originAirports.filter((c) => c !== code) : [...value.originAirports, code];
    set({ originAirports: next });
  }

  function handleFetchBestPrices() {
    setSearchError(null);
    const input = simulationFormToInput(value);
    if (!input.description.trim()) {
      setSearchError(
        value.category === "travel"
          ? "Informe o destino e o nome da estadia/resort antes de buscar."
          : "Informe o nome do produto (ex.: PlayStation 5) antes de buscar."
      );
      return;
    }

    startSearch(async () => {
      const res = await previewTrackedPrices({
        category: value.category,
        description: input.description,
        startDate: value.startDate,
        trackerConfig: input.trackerConfig,
      });
      if (!res.ok) {
        setSearchError(res.error);
        return;
      }
      const meta = res.meta;
      set({
        bestOfferMeta: meta,
        cashPriceCents: meta.cashPriceCents,
        useInstallments: meta.installments >= 2,
        installmentTotalCents: meta.installmentTotalCents,
        installments: Math.max(2, meta.installments),
      });
    });
  }

  const installmentAmountCents =
    value.useInstallments && value.installments >= 2
      ? Math.round(value.installmentTotalCents / value.installments)
      : 0;

  const preview =
    value.useInstallments &&
    value.cashPriceCents > 0 &&
    value.installmentTotalCents > 0 &&
    value.installments >= 2
      ? {
          impliedMonthlyRate: impliedInstallmentRate(
            value.cashPriceCents,
            value.installmentTotalCents,
            value.installments
          ),
          netMonthlyRate: netMonthlyYieldRate(cdiAnnualPercent, percentOfCdi, value.installments),
        }
      : null;
  const extraCents = value.installmentTotalCents - value.cashPriceCents;

  return (
    <div className="space-y-4">
      {/* Seletor de Categoria: Compra / Produto vs Viagem (Voo + Estadia) */}
      <div className="grid grid-cols-2 gap-2 rounded-(--radius-lg) bg-black/[0.04] p-1">
        <button
          type="button"
          onClick={() => handleCategorySwitch("product")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-(--radius-md) px-3 py-2 text-xs font-semibold transition-all",
            value.category === "product"
              ? "bg-(--color-surface) text-(--color-primary) shadow-xs"
              : "text-(--color-text-secondary) hover:text-(--color-text-primary)"
          )}
        >
          <ShoppingBag size={14} />
          Compra / Produto
        </button>
        <button
          type="button"
          onClick={() => handleCategorySwitch("travel")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-(--radius-md) px-3 py-2 text-xs font-semibold transition-all",
            value.category === "travel"
              ? "bg-(--color-surface) text-(--color-primary) shadow-xs"
              : "text-(--color-text-secondary) hover:text-(--color-text-primary)"
          )}
        >
          <Plane size={14} />
          Viagem (Voo + Estadia)
        </button>
      </div>

      {value.category === "product" ? (
        <div className="space-y-3">
          <FieldGroup label="Produto que deseja comprar">
            <Input
              value={value.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Ex.: PlayStation 5 Slim 1TB"
            />
          </FieldGroup>
        </div>
      ) : (
        <div className="space-y-3 rounded-(--radius-lg) border border-(--color-primary)/25 bg-(--color-primary-soft)/20 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-(--color-primary)">
              Configuração da Viagem (Voos + Hospedagem por Data)
            </span>
            {nights > 0 && (
              <span className="rounded-full bg-(--color-primary-soft) px-2 py-0.5 text-[11px] font-semibold text-(--color-primary)">
                {nights} {nights === 1 ? "diária" : "diárias"} ·{" "}
                {formatTravelersSummary(value.adults, value.children, value.pets)}
              </span>
            )}
          </div>

          <FieldGroup label="1. Destino / Aeroporto de chegada">
            <select
              value={value.destinationAirport}
              onChange={(e) => {
                const code = e.target.value;
                const found = DESTINATION_AIRPORTS.find((d) => d.code === code);
                set({
                  destinationAirport: code,
                  destinationLabel: found?.label ?? code,
                });
              }}
              className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-sm"
            >
              {DESTINATION_AIRPORTS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="2. Estadia / Resort / Hotel">
            <Input
              value={value.accommodationName}
              onChange={(e) =>
                set({
                  accommodationName: e.target.value,
                  description: e.target.value,
                })
              }
              placeholder="Ex.: Japaratinga Lounge Resort ou Salinas Maragogi"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
                { name: "Japaratinga Lounge Resort", airport: "MCZ", label: "Maceió - AL (MCZ)" },
                { name: "Salinas Maragogi All Inclusive", airport: "MCZ", label: "Maceió - AL (MCZ)" },
                { name: "Salinas Maceió All Inclusive", airport: "MCZ", label: "Maceió - AL (MCZ)" },
              ].map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() =>
                    set({
                      accommodationName: preset.name,
                      description: preset.name,
                      destinationAirport: preset.airport,
                      destinationLabel: preset.label,
                    })
                  }
                  className="rounded-full border border-(--color-border) bg-(--color-surface) px-2.5 py-0.5 text-[11px] font-medium text-(--color-text-secondary) hover:border-(--color-primary) hover:text-(--color-primary)"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </FieldGroup>

          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Entrada na hospedagem (Check-in)">
              <Input
                type="date"
                value={value.outboundDate}
                onChange={(e) => {
                  const nextOut = e.target.value;
                  const patch: Partial<SimulationFormValue> = { outboundDate: nextOut };
                  if (nextOut && (!value.returnDate || value.returnDate <= nextOut)) {
                    const outMs = new Date(`${nextOut}T12:00:00Z`).getTime();
                    if (!Number.isNaN(outMs)) {
                      patch.returnDate = new Date(outMs + 5 * 86400000).toISOString().slice(0, 10);
                    }
                  }
                  if (value.sameDatesForFlight) {
                    patch.flightOutboundDate = nextOut;
                    if (patch.returnDate) patch.flightReturnDate = patch.returnDate;
                  }
                  set(patch);
                }}
              />
            </FieldGroup>
            <FieldGroup label="Saída da hospedagem (Check-out)">
              <Input
                type="date"
                min={value.outboundDate}
                value={value.returnDate}
                onChange={(e) => {
                  const nextRet = e.target.value;
                  set(
                    value.sameDatesForFlight
                      ? { returnDate: nextRet, flightReturnDate: nextRet }
                      : { returnDate: nextRet }
                  );
                }}
              />
            </FieldGroup>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-(--radius-md) border border-(--color-primary)/25 bg-(--color-surface) px-3 py-2">
            <span>
              <span className="block text-xs font-semibold text-(--color-text-primary)">
                Usar as mesmas datas para o voo
              </span>
              <span className="block text-[11px] text-(--color-text-secondary)">
                Desmarque se o voo sair antes ou voltar depois da hospedagem
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={value.sameDatesForFlight}
              onChange={(e) => {
                const same = e.target.checked;
                set(
                  same
                    ? {
                        sameDatesForFlight: true,
                        flightOutboundDate: value.outboundDate,
                        flightReturnDate: value.returnDate,
                      }
                    : { sameDatesForFlight: false }
                );
              }}
              className="h-4 w-4 accent-(--color-primary)"
            />
          </label>

          {!value.sameDatesForFlight && (
            <div className="grid grid-cols-2 gap-3 rounded-(--radius-md) border border-dashed border-(--color-border) bg-(--color-surface) p-3">
              <FieldGroup label="Ida do voo">
                <Input
                  type="date"
                  value={value.flightOutboundDate}
                  onChange={(e) => set({ flightOutboundDate: e.target.value })}
                />
              </FieldGroup>
              <FieldGroup label="Volta do voo">
                <Input
                  type="date"
                  min={value.flightOutboundDate}
                  value={value.flightReturnDate}
                  onChange={(e) => set({ flightReturnDate: e.target.value })}
                />
              </FieldGroup>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            <FieldGroup label="Adultos">
              <Input
                type="number"
                min={1}
                max={10}
                value={value.adults}
                onChange={(e) => set({ adults: Math.max(1, Number(e.target.value) || 1) })}
              />
            </FieldGroup>
            <FieldGroup label="Crianças">
              <Input
                type="number"
                min={0}
                max={10}
                value={value.children}
                onChange={(e) => set({ children: Math.max(0, Number(e.target.value) || 0) })}
              />
            </FieldGroup>
            <FieldGroup label="Pets">
              <Input
                type="number"
                min={0}
                max={5}
                value={value.pets}
                onChange={(e) => set({ pets: Math.max(0, Number(e.target.value) || 0) })}
              />
            </FieldGroup>
          </div>

          <div>
            <span className="mb-1 block text-xs font-medium text-(--color-text-secondary)">
              Aeroportos de saída monitorados (saindo de Araraquara)
            </span>
            <div className="flex flex-wrap gap-2">
              {ORIGIN_AIRPORTS.map((airport) => {
                const active = value.originAirports.includes(airport.code);
                return (
                  <button
                    key={airport.code}
                    type="button"
                    onClick={() => toggleOriginAirport(airport.code)}
                    className={cn(
                      "rounded-(--radius-md) border px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-(--color-primary) bg-(--color-primary-soft) text-(--color-primary)"
                        : "border-(--color-border) bg-(--color-surface) text-(--color-text-secondary)"
                    )}
                  >
                    {active ? "✓ " : ""}
                    {airport.code} ({airport.city})
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Card de Rastreamento Inteligente & Pipeline Anti-Falso-Positivo de 4 Camadas */}
      <div className="space-y-3 rounded-(--radius-lg) border border-(--color-primary)/30 bg-(--color-primary-soft)/25 p-3.5">
        <label className="flex cursor-pointer items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-(--color-primary)" />
            <div>
              <span className="block text-xs font-semibold text-(--color-text-primary)">
                {value.category === "travel"
                  ? "Rastrear menor Voo (RAO/VCP) + Estadia por data automaticamente"
                  : "Rastrear menor preço automaticamente"}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-(--color-text-secondary)">
                {value.category === "travel"
                  ? "Busca tarifas aéreas e diárias do resort para as datas escolhidas (incluindo Black Friday) e preenche o valor à vista e parcelado."
                  : "Busca o menor preço à vista (PIX) e parcelado na mesma loja automaticamente."}
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            role="switch"
            checked={value.autoTrack}
            onChange={(e) => {
              const checked = e.target.checked;
              set({ autoTrack: checked });
              if (!checked) setShowManualPrices(true);
            }}
            className="mt-1 h-4 w-4 accent-(--color-primary)"
          />
        </label>

        {value.autoTrack && (
          <div className="space-y-2.5">
            <Button
              type="button"
              variant="secondary"
              onClick={handleFetchBestPrices}
              disabled={isSearching}
              className="w-full justify-center gap-2 border-(--color-primary)/40 bg-(--color-surface) text-xs font-semibold text-(--color-primary) hover:bg-(--color-primary-soft)"
            >
              <Search size={14} />
              {isSearching
                ? value.category === "travel"
                  ? "Consultando voos (RAO/VCP) e tarifas do resort nas datas..."
                  : "Buscando menores preços..."
                : value.category === "travel"
                  ? "Buscar melhor Voo + Estadia agora"
                  : "Buscar menor preço à vista e parcelado agora"}
            </Button>

            {searchError && <p className="text-xs text-(--color-negative)">{searchError}</p>}

            {value.bestOfferMeta && (
              <div className="space-y-2 rounded-(--radius-md) border border-(--color-positive)/30 bg-(--color-surface) p-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold text-(--color-positive)">
                    <CheckCircle2 size={14} className="shrink-0" />
                    {value.category === "travel"
                      ? "Melhor combinação Voo + Resort encontrada"
                      : `Menor preço: ${value.bestOfferMeta.storeOrProvider}`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-(--radius-md) bg-black/[0.03] p-2">
                  <div>
                    <span className="block text-[10px] uppercase text-(--color-text-tertiary)">
                      Menor à vista (PIX)
                    </span>
                    <span className="text-sm font-bold tabular-nums text-(--color-text-primary)">
                      {formatCurrencyBRL(value.bestOfferMeta.cashPriceCents)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-(--color-text-tertiary)">
                      Parcelado ({value.bestOfferMeta.installments}x na mesma fonte)
                    </span>
                    <span className="text-sm font-bold tabular-nums text-(--color-text-primary)">
                      {formatCurrencyBRL(value.bestOfferMeta.installmentTotalCents)}
                    </span>
                  </div>
                </div>

                {value.category === "travel" && value.bestOfferMeta.stayQuote && (
                  <div className="space-y-1 text-[11px] text-(--color-text-secondary)">
                    {value.bestOfferMeta.flightQuotes?.map((fq) => (
                      <div key={fq.originAirport} className="flex justify-between gap-2">
                        <span>
                          ✈️ Voo {fq.originAirport}→{fq.destinationAirport} ({fq.airline} ·{" "}
                          {fq.stopsCount === 0 ? "Direto" : `${fq.stopsCount} escala`})
                        </span>
                        <b className="tabular-nums">{formatCurrencyBRL(fq.cashTotalCents)}</b>
                      </div>
                    ))}
                    <div className="flex justify-between gap-2 border-t border-(--color-border)/60 pt-1">
                      <span>
                        🏨 {value.bestOfferMeta.stayQuote.accommodationName} ({value.bestOfferMeta.stayQuote.nights}{" "}
                        noites · {value.bestOfferMeta.stayQuote.boardBasis})
                      </span>
                      <b className="tabular-nums">{formatCurrencyBRL(value.bestOfferMeta.stayQuote.cashTotalCents)}</b>
                    </div>
                  </div>
                )}

              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="flex items-center gap-1 text-[11px] text-(--color-text-tertiary)">
                <Sparkles size={12} />
                {value.cashPriceCents > 0
                  ? `Valores preenchidos: ${formatCurrencyBRL(value.cashPriceCents)} à vista / ${formatCurrencyBRL(value.installmentTotalCents)} (${value.installments}x)`
                  : "Se você clicar em Adicionar direto, buscamos os valores automaticamente."}
              </span>
              <button
                type="button"
                onClick={() => setShowManualPrices((s) => !s)}
                className="text-[11px] font-semibold text-(--color-primary) hover:underline"
              >
                {showManualPrices ? "Ocultar ajuste manual" : "Ajustar valores manualmente"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Campos de valor à vista e parcelado (exibidos quando ajuste manual está aberto ou autoTrack desligado) */}
      {(showManualPrices || !value.autoTrack) && (
        <div className="grid grid-cols-1 gap-4 rounded-(--radius-lg) border border-dashed border-(--color-border) p-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldGroup label="Preço à vista">
              <CurrencyInput valueCents={value.cashPriceCents} onChange={(cents) => set({ cashPriceCents: cents })} />
            </FieldGroup>
          </div>

          <div className="space-y-3 sm:col-span-2">
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <span>
                <span className="block text-sm font-medium">Também vou considerar parcelar</span>
                <span className="block text-xs text-(--color-text-tertiary)">
                  Ativa o comparativo à vista × parcelado na mesma loja
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={value.useInstallments}
                onChange={(e) => set({ useInstallments: e.target.checked })}
                className="mt-1 h-4 w-4 accent-(--color-primary)"
              />
            </label>

            {value.useInstallments && (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <FieldGroup label="Valor total parcelado">
                    <CurrencyInput
                      valueCents={value.installmentTotalCents}
                      onChange={(cents) => set({ installmentTotalCents: cents })}
                    />
                  </FieldGroup>
                  <FieldGroup label="Nº de parcelas">
                    <Input
                      type="number"
                      min={2}
                      value={value.installments}
                      onChange={(e) => set({ installments: Math.max(2, Number(e.target.value) || 2) })}
                    />
                  </FieldGroup>
                  <FieldGroup label="Valor da parcela">
                    <Input
                      readOnly
                      value={installmentAmountCents ? formatCurrencyBRL(installmentAmountCents) : "—"}
                      className="bg-black/[0.03] text-(--color-text-secondary)"
                    />
                  </FieldGroup>
                </div>
                {preview && (
                  <p className="flex items-start gap-2 rounded-(--radius-md) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-text-secondary)">
                    <Info size={14} className="mt-0.5 shrink-0 text-(--color-warning)" />
                    <span>
                      {extraCents > 0 ? (
                        <>
                          Parcelar custa <b>{formatCurrencyBRL(extraCents)} a mais</b> (juros implícitos de{" "}
                          <b>{(preview.impliedMonthlyRate * 100).toFixed(2).replace(".", ",")}% a.m.</b>).
                        </>
                      ) : (
                        <>Parcelar não tem juros embutidos neste valor.</>
                      )}{" "}
                      A Caixinha rende {(preview.netMonthlyRate * 100).toFixed(2).replace(".", ",")}% a.m. líquido de
                      IR.
                    </span>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldGroup label={value.category === "travel" ? "Mês de pagamento / compra" : "Data prevista da compra"}>
          <Input type="date" value={value.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </FieldGroup>
        {value.useInstallments && (
          <FieldGroup label="1ª parcela no cartão">
            <Input
              readOnly
              value={`${formatMonthLabel(addMonths(value.startDate.slice(0, 7), 1))} · 30 dias depois`}
              className="bg-black/[0.03] text-(--color-text-secondary)"
            />
          </FieldGroup>
        )}
      </div>
    </div>
  );
}
