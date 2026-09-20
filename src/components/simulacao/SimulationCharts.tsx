"use client";

import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ScenarioComparisonMonth } from "@/lib/domain/simulation";
import { formatCurrencyBRL, formatMonthShortWithYear, formatMonthLabel } from "@/lib/utils/format";

export interface AccumulatedPoint {
  referenceMonth: string;
  accumulatedCents: number;
}

/** Saldo acumulado projetado, sem nenhuma simulação — só com o que já está cadastrado. */
export function BaseAccumulatedChart({ points }: { points: AccumulatedPoint[] }) {
  const data = points.map((p) => ({ ...p, label: formatMonthShortWithYear(p.referenceMonth) }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
          <YAxis hide />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as AccumulatedPoint & { label: string };
              return (
                <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs shadow-(--shadow-md)">
                  <p className="mb-1 font-medium">{formatMonthLabel(d.referenceMonth)}</p>
                  <p style={{ color: "var(--chart-1)" }}>Saldo acumulado: {formatCurrencyBRL(d.accumulatedCents)}</p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="accumulatedCents"
            name="Saldo acumulado"
            stroke="var(--chart-1)"
            fill="var(--chart-1)"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LeftoverComparisonChart({ comparison }: { comparison: ScenarioComparisonMonth[] }) {
  const data = comparison.map((c) => ({
    ...c,
    label: formatMonthShortWithYear(c.referenceMonth),
    semCompra: c.leftoverWithoutCents,
    comCompra: c.leftoverWithCents,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
          <YAxis hide />
          <Tooltip content={<ComparisonTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span className="text-xs text-(--color-text-secondary)">{value}</span>}
          />
          <Bar dataKey="semCompra" name="Sem compra" fill="var(--chart-1)" radius={[4, 4, 4, 4]} maxBarSize={10} />
          <Bar dataKey="comCompra" name="Com compra" fill="var(--color-negative)" radius={[4, 4, 4, 4]} maxBarSize={10} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AccumulatedBalanceChart({ comparison }: { comparison: ScenarioComparisonMonth[] }) {
  const data = comparison.map((c) => ({
    ...c,
    label: formatMonthShortWithYear(c.referenceMonth),
    semCompra: c.accumulatedWithoutCents,
    comCompra: c.accumulatedWithCents,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }} />
          <YAxis hide />
          <Tooltip content={<ComparisonTooltip accumulated />} />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span className="text-xs text-(--color-text-secondary)">{value}</span>}
          />
          <Area
            type="monotone"
            dataKey="semCompra"
            name="Sem compra"
            stroke="var(--chart-1)"
            fill="var(--chart-1)"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="comCompra"
            name="Com compra"
            stroke="var(--color-negative)"
            fill="var(--color-negative)"
            fillOpacity={0.15}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ComparisonTooltip({
  active,
  payload,
  accumulated,
}: {
  active?: boolean;
  payload?: { payload: ScenarioComparisonMonth & { label: string } }[];
  accumulated?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const withoutValue = accumulated ? d.accumulatedWithoutCents : d.leftoverWithoutCents;
  const withValue = accumulated ? d.accumulatedWithCents : d.leftoverWithCents;
  const diff = withValue - withoutValue;

  return (
    <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs shadow-(--shadow-md)">
      <p className="mb-1 font-medium">{formatMonthLabel(d.referenceMonth)}</p>
      <p style={{ color: "var(--chart-1)" }}>Sem compra: {formatCurrencyBRL(withoutValue)}</p>
      <p style={{ color: "var(--color-negative)" }}>Com compra: {formatCurrencyBRL(withValue)}</p>
      <p className="mt-1 font-medium">Diferença acumulada: {formatCurrencyBRL(diff)}</p>
    </div>
  );
}
