"use client";

import { useMemo, useState } from "react";
import { MonthSummary } from "@/types/domain";
import { projectCaixinha } from "@/lib/domain/cash-vs-installments";
import { formatCurrencyBRL, formatMonthLabel } from "@/lib/utils/format";
import { BaseAccumulatedChart, AccumulatedPoint } from "./SimulationCharts";

const inputClass =
  "h-8 w-24 rounded-(--radius-md) border border-[#cbd8d5] bg-(--color-surface) px-2 text-right text-xs tabular-nums text-(--color-text-primary)";

function parseDecimal(text: string): number {
  return Number(text.replace(",", "."));
}

/** Campo numérico com rascunho de texto: aceita vírgula e só propaga valores válidos. */
function NumberField({
  label,
  value,
  onValid,
  max,
}: {
  label: string;
  value: number;
  onValid: (value: number) => void;
  max: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-2">
      {label}
      <input
        inputMode="decimal"
        className={inputClass}
        value={draft ?? String(value).replace(".", ",")}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = parseDecimal(e.target.value);
          if (Number.isFinite(parsed) && parsed > 0 && parsed <= max) onValid(parsed);
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}

/** Saldo acumulado projetado (sem simulação) aplicado na Caixinha do Nubank, com CDI e % do CDI editáveis. */
export function BaseCaixinhaYield({
  summaries,
  accumulated,
  cdiAnnualPercent,
  onCdiAnnualPercent,
  percentOfCdi,
  onPercentOfCdi,
  horizon,
  compact = false,
  chartHeight,
}: {
  compact?: boolean;
  chartHeight?: number | string;
  summaries: MonthSummary[];
  accumulated: AccumulatedPoint[];
  cdiAnnualPercent: number;
  onCdiAnnualPercent: (value: number) => void;
  percentOfCdi: number;
  onPercentOfCdi: (value: number) => void;
  horizon: { from: string; to: string };
}) {
  const projection = useMemo(() => {
    if (accumulated.length === 0 || summaries.length === 0) return null;
    // Variação mensal do saldo acumulado (inclui o saldo real ancorado, se houver); o saldo inicial é o que sobra antes do 1º mês.
    const changes = accumulated.map((p, i) => (i === 0 ? summaries[0].leftoverCents : p.accumulatedCents - accumulated[i - 1].accumulatedCents));
    const opening = accumulated[0].accumulatedCents - changes[0];
    return projectCaixinha(opening, changes, cdiAnnualPercent, percentOfCdi);
  }, [summaries, accumulated, cdiAnnualPercent, percentOfCdi]);

  return (
    <>
      {!compact && <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-(--color-text-secondary)">
        <NumberField label="CDI a.a. (%)" value={cdiAnnualPercent} onValid={onCdiAnnualPercent} max={60} />
        <NumberField label="% do CDI" value={percentOfCdi} onValid={onPercentOfCdi} max={300} />
      </div>}

      <BaseAccumulatedChart points={accumulated} yieldSeriesCents={projection?.balanceSeriesCents} height={chartHeight} />

      {!compact && projection && (
        <>
          <p className="mt-3 text-sm font-medium">
            Rendimento projetado no período:{" "}
            <span className="tabular-nums text-(--color-positive)">{formatCurrencyBRL(projection.grossYieldCents)}</span>{" "}
            <span className="text-(--color-text-secondary)">
              (líquido{" "}
              <span className="tabular-nums">{formatCurrencyBRL(projection.netYieldCents)}</span>)
            </span>
          </p>
          <p className="mt-1 text-xs text-(--color-text-tertiary)">
            Saldo com rendimento (Caixinha) em {formatMonthLabel(horizon.to)}:{" "}
            <span className="tabular-nums">{formatCurrencyBRL(projection.finalNetCents)}</span> líquido de IR (
            <span className="tabular-nums">{formatCurrencyBRL(projection.irCents)}</span> de IR sobre o rendimento).
          </p>
        </>
      )}
      {!compact && <p className="mt-2 text-xs leading-relaxed text-(--color-text-tertiary)">
        Estimativa: todo o saldo positivo fica na Caixinha do Nubank rendendo o % do CDI informado, com capitalização
        mensal; saldo negativo não rende. IR regressivo só sobre o rendimento (22,5% até 180 dias, 20% de 181 a 360,
        17,5% de 361 a 720, 15% acima), contado por sobra mensal. O CDI fica constante: não considera mudanças da
        Selic. A linha pontilhada no gráfico é o saldo antes do IR do resgate final.
      </p>}
    </>
  );
}
