"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { Card } from "@/components/ui/Card";
import { MonthCommitment } from "@/lib/domain/insights";
import { formatCurrencyBRL, formatMonthShort, formatMonthLabel } from "@/lib/utils/format";

/** % da renda de cada mês (o selecionado + 5 seguintes) já comprometida por fixos e parcelas. */
export function CommitmentsChart({ commitments }: { commitments: MonthCommitment[] }) {
  const data = commitments.map((c) => {
    const income = c.incomeCents > 0 ? c.incomeCents : null;
    return {
      ...c,
      label: formatMonthShort(c.referenceMonth),
      fixedPct: income ? (c.fixedCents / income) * 100 : 0,
      installmentPct: income ? (c.installmentCents / income) * 100 : 0,
      totalPct: income ? ((c.fixedCents + c.installmentCents) / income) * 100 : 0,
    };
  });
  const first = data[0];
  const last = data[data.length - 1];
  const freed = first && last ? first.installmentPct - last.installmentPct : 0;

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Compromissos já assumidos — próximos 6 meses</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        % da renda prevista já comprometida por gastos fixos e parcelas, antes de qualquer gasto novo.
      </p>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 18, right: 8, left: 8, bottom: 0 }}>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "var(--color-text-tertiary)" }}
            />
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.03)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs shadow-(--shadow-md)">
                    <p className="mb-1 font-medium">{formatMonthLabel(d.referenceMonth)}</p>
                    <p>Fixos: {formatCurrencyBRL(d.fixedCents)}</p>
                    <p>Parcelas: {formatCurrencyBRL(d.installmentCents)}</p>
                    <p className="text-(--color-text-tertiary)">Renda prevista: {formatCurrencyBRL(d.incomeCents)}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="fixedPct" stackId="c" fill="var(--chart-1)" maxBarSize={44} />
            <Bar dataKey="installmentPct" stackId="c" fill="#7fb0ec" radius={[4, 4, 0, 0]} maxBarSize={44}>
              <LabelList
                dataKey="totalPct"
                position="top"
                formatter={(v: unknown) => `${Number(v).toFixed(1).replace(".", ",")}%`}
                style={{ fontSize: 11, fontWeight: 600, fill: "var(--color-text-primary)" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-(--color-text-secondary)">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-(--chart-1)" />
          Gastos fixos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-[#7fb0ec]" />
          Parcelas
        </span>
        {freed > 0.05 && (
          <span className="text-(--color-text-tertiary)">
            Parcelas liberam {freed.toFixed(1).replace(".", ",")} p.p. até {formatMonthShort(last.referenceMonth)}
          </span>
        )}
      </div>
    </Card>
  );
}
