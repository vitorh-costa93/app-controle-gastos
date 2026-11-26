"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addMonths, formatCurrencyBRL, formatMonthLabel } from "@/lib/utils/format";
import type { BalanceProjectionState } from "./useBalanceProjection";

function formatShortMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export function PlannedCostsChart({
  month,
  personName,
  projection,
}: {
  month: string;
  personName: string;
  projection: BalanceProjectionState;
}) {
  const { rows, avgCents, peakRow, missingCount } = useMemo(() => {
    const byMonth = new Map((projection.budget?.baseSummaries ?? []).map((s) => [s.referenceMonth, s]));
    const list: Array<{
      referenceMonth: string;
      label: string;
      expenseCents: number;
      expenseBrl: number;
      incomeCents: number;
      leftoverCents: number;
    }> = [];
    let missing = 0;

    for (let i = 0; i < 12; i++) {
      const ym = addMonths(month, i);
      const summary = byMonth.get(ym);
      if (!summary) missing++;
      const expenseCents = summary?.expenseCents ?? 0;
      list.push({
        referenceMonth: ym,
        label: formatShortMonth(ym),
        expenseCents,
        expenseBrl: expenseCents / 100,
        incomeCents: summary?.incomeCents ?? 0,
        leftoverCents: summary?.leftoverCents ?? 0,
      });
    }

    const total = list.reduce((sum, r) => sum + r.expenseCents, 0);
    const avg = list.length > 0 ? Math.round(total / list.length) : 0;
    let peak = list[0];
    for (const r of list) {
      if (r.expenseCents > (peak?.expenseCents ?? 0)) peak = r;
    }

    return { rows: list, avgCents: avg, peakRow: peak, missingCount: missing };
  }, [month, projection.budget]);

  const endMonth = addMonths(month, 11);

  return (
    <section className="nm-panel nm-planned">
      <div className="nm-heading">
        <div>
          <h2>Custos planejados (12 meses)</h2>
          <p>
            {personName} · {formatMonthLabel(month)} → {formatMonthLabel(endMonth)} · fixos, parcelas e estimados
          </p>
        </div>
        {projection.status === "ready" && (
          <div className="nm-planned-badges">
            <span>
              Média/mês <strong>{formatCurrencyBRL(avgCents)}</strong>
            </span>
            {peakRow && (
              <span>
                Pico ({peakRow.label}) <strong>{formatCurrencyBRL(peakRow.expenseCents)}</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {projection.status === "loading" ? (
        <div className="nm-planned-status" role="status">
          Carregando projeção de custos planejados…
        </div>
      ) : projection.status === "error" ? (
        <div className="nm-planned-status" role="alert">
          Não foi possível carregar os custos planejados.{" "}
          <button type="button" className="nm-link" onClick={projection.retry}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="nm-planned-chart">
          <ResponsiveContainer key={`${month}-${personName}`} width="100%" height={215} minWidth={0}>
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#edf0f5" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#69758a" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#69758a" }}
                axisLine={false}
                tickLine={false}
                width={64}
                tickFormatter={(v) => `R$ ${Number(v).toLocaleString("pt-BR")}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const item = payload[0]?.payload as (typeof rows)[number];
                  return (
                    <div className="rounded-[10px] border border-[#e1e6ef] bg-white px-3 py-2 text-[11px] shadow-md">
                      <div className="font-semibold text-[#141b2a]">{formatMonthLabel(item.referenceMonth)}</div>
                      <div className="mt-0.5 text-[#dc4056] font-bold">
                        Custos: {formatCurrencyBRL(item.expenseCents)}
                      </div>
                      <div className="text-[#69758a]">Entradas: {formatCurrencyBRL(item.incomeCents)}</div>
                      <div className={item.leftoverCents < 0 ? "text-[#dc4056]" : "text-[#0ca94b]"}>
                        Sobra: {formatCurrencyBRL(item.leftoverCents)}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="expenseBrl" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {rows.map((entry) => (
                  <Cell
                    key={entry.referenceMonth}
                    fill={entry.referenceMonth === month ? "#1768fa" : "#93c5fd"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {missingCount > 0 && projection.status === "ready" && (
        <p className="nm-footnote">Meses fora do horizonte disponível da Simulação aparecem zerados.</p>
      )}
    </section>
  );
}
