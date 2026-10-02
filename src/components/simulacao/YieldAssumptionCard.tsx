"use client";

import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils/cn";
import { monthlyYieldRate } from "@/lib/domain/cash-vs-installments";
import { formatDateBR } from "@/lib/utils/format";
import type { CdiRate } from "@/lib/data/cdi";

export const YIELD_OPTIONS = [
  { percent: 100, label: "100% · Padrão" },
  { percent: 115, label: "115% · Turbo" },
  { percent: 120, label: "120% · Ultravioleta" },
] as const;

const pt = (value: number, digits = 2) => value.toFixed(digits).replace(".", ",");

/** Premissa de rendimento do comparativo: Caixinha do Nubank (% do CDI) e o CDI do Banco Central. */
export function YieldAssumptionCard({
  cdi,
  percentOfCdi,
  onChange,
}: {
  cdi: CdiRate;
  percentOfCdi: number;
  onChange: (percent: number) => void;
}) {
  const monthly = monthlyYieldRate(cdi.annualPercent, percentOfCdi);
  const stats = [
    { label: "% do CDI", value: `${percentOfCdi}%` },
    { label: "CDI atual", value: `${pt(cdi.annualPercent)}%` },
    { label: "Rende ao mês", value: `${pt(monthly * 100)}%` },
  ];

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">Rendimento considerado</h3>
          <p className="mt-1 text-xs text-(--color-text-secondary)">Mesma regra da Caixinha do Nubank</p>
        </div>
        <span className="rounded-full bg-(--color-primary-soft) px-2.5 py-1 text-xs font-semibold text-(--color-primary)">
          {cdi.source === "bcb" ? "Automático" : "Valor de referência"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-xs text-(--color-text-tertiary)">{s.label}</dt>
            <dd className="mt-0.5 text-xl font-bold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Percentual do CDI">
        {YIELD_OPTIONS.map((o) => (
          <button
            key={o.percent}
            type="button"
            aria-pressed={percentOfCdi === o.percent}
            onClick={() => onChange(o.percent)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              percentOfCdi === o.percent
                ? "bg-(--color-primary) text-white"
                : "bg-black/5 text-(--color-text-secondary) hover:bg-black/10"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-(--color-text-tertiary)">
        {cdi.source === "bcb"
          ? `CDI do Banco Central em ${formatDateBR(cdi.asOf)}.`
          : `Não foi possível consultar o Banco Central; usando o último CDI conhecido (${formatDateBR(cdi.asOf)}).`}{" "}
        IR regressivo descontado só do rendimento: 22,5% até 180 dias, 20% de 181 a 360 dias, 17,5% de 361 a 720 dias.
      </p>
    </Card>
  );
}
