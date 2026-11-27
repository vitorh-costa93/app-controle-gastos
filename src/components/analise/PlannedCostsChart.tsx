"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalysisData } from "@/lib/data/analysis";
import { getPlannedCostsBreakdown, type PlannedCostMonth } from "@/lib/data/simulation-analysis";
import { addMonths, formatCurrencyBRL, formatMonthLabel } from "@/lib/utils/format";
import { PlannedCostsDrawer } from "./PlannedCostsDrawer";

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
  personId,
  personName,
  data,
  onChanged,
  refreshKey,
}: {
  month: string;
  personId: string;
  personName: string;
  data: AnalysisData;
  onChanged: () => Promise<void>;
  refreshKey?: unknown;
}) {
  const [items, setItems] = useState<PlannedCostMonth[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const retry = useCallback(() => setAttempt((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    getPlannedCostsBreakdown(month, personId || undefined).then(
      (res) => {
        if (!active) return;
        setItems(res);
        setStatus("ready");
      },
      () => {
        if (!active) return;
        setStatus("error");
      }
    );
    return () => {
      active = false;
    };
  }, [month, personId, refreshKey, attempt]);

  const { rows, avgFixedCents, avgVariableCents, peakRow } = useMemo(() => {
    const list = items.map((item) => ({
      ...item,
      label: formatShortMonth(item.referenceMonth),
      fixedBrl: item.fixedCents / 100,
      variableBrl: item.variableCents / 100,
    }));
    const count = Math.max(1, list.length);
    const avgFixed = Math.round(list.reduce((s, r) => s + r.fixedCents, 0) / count);
    const avgVar = Math.round(list.reduce((s, r) => s + r.variableCents, 0) / count);
    let peak = list[0];
    for (const r of list) {
      if (r.totalCents > (peak?.totalCents ?? 0)) peak = r;
    }
    return { rows: list, avgFixedCents: avgFixed, avgVariableCents: avgVar, peakRow: peak };
  }, [items]);

  const selectedItem = useMemo(
    () => items.find((i) => i.referenceMonth === selectedMonth) ?? null,
    [items, selectedMonth]
  );

  const endMonth = addMonths(month, 11);

  return (
    <section className="nm-panel nm-planned">
      <div className="nm-heading">
        <div>
          <h2>Custos fixos e parcelados (12 meses)</h2>
          <p>
            {personName} · {formatMonthLabel(month)} → {formatMonthLabel(endMonth)} · fixos vs. parcelado/variável
          </p>
        </div>
        {status === "ready" && (
          <div className="nm-planned-badges">
            <span>
              Média fixa <strong>{formatCurrencyBRL(avgFixedCents)}</strong>
            </span>
            <span>
              Média parcelado <strong>{formatCurrencyBRL(avgVariableCents)}</strong>
            </span>
            {peakRow && (
              <span>
                Pico ({peakRow.label}) <strong>{formatCurrencyBRL(peakRow.totalCents)}</strong>
              </span>
            )}
          </div>
        )}
      </div>

      {status === "loading" ? (
        <div className="nm-planned-status" role="status">
          Carregando projeção de custos planejados…
        </div>
      ) : status === "error" ? (
        <div className="nm-planned-status" role="alert">
          Não foi possível carregar os custos planejados.{" "}
          <button type="button" className="nm-link" onClick={retry}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-4 text-[11px] font-medium text-[#69758a]">
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-xs bg-[#1768fa]" /> Fixo (todo mês)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="inline-block h-2.5 w-2.5 rounded-xs bg-[#ff9c32]" /> Parcelado / Variável
            </span>
            <span className="ml-auto text-[11px] font-normal text-[#69758a]">
              Clique em um mês para ver e editar
            </span>
          </div>
          <div className="nm-planned-chart">
            <ResponsiveContainer key={`${month}-${personName}`} width="100%" height={215} minWidth={0}>
              <BarChart
                data={rows}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                style={{ cursor: "pointer" }}
                onClick={(state) => {
                  const idx = Number(state?.activeTooltipIndex);
                  if (Number.isInteger(idx) && idx >= 0 && idx < rows.length) {
                    setSelectedMonth(rows[idx].referenceMonth);
                  }
                }}
              >
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
                    const otherVarCents = Math.max(0, item.variableCents - item.installmentCents);
                    return (
                      <div className="rounded-[10px] border border-[#e1e6ef] bg-white px-3 py-2 text-[11px] shadow-md">
                        <div className="font-semibold text-[#141b2a]">{formatMonthLabel(item.referenceMonth)}</div>
                        <div className="mt-1 text-[#1768fa] font-semibold">
                          Fixo (todo mês): {formatCurrencyBRL(item.fixedCents)}
                        </div>
                        <div className="text-[#d97706] font-semibold">
                          Parcelado: {formatCurrencyBRL(item.installmentCents)}
                        </div>
                        {otherVarCents > 0 && (
                          <div className="text-[#69758a]">
                            Outros variáveis: {formatCurrencyBRL(otherVarCents)}
                          </div>
                        )}
                        <div className="mt-1 border-t border-[#edf0f5] pt-1 font-bold text-[#141b2a]">
                          Total: {formatCurrencyBRL(item.totalCents)}
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="fixedBrl"
                  stackId="costs"
                  fill="#1768fa"
                  cursor="pointer"
                  isAnimationActive={false}
                  onClick={(barData) => {
                    const ref =
                      (barData as { payload?: { referenceMonth?: string }; referenceMonth?: string })?.payload?.referenceMonth ??
                      (barData as { referenceMonth?: string })?.referenceMonth;
                    if (ref) setSelectedMonth(ref);
                  }}
                />
                <Bar
                  dataKey="variableBrl"
                  stackId="costs"
                  fill="#ff9c32"
                  radius={[6, 6, 0, 0]}
                  cursor="pointer"
                  isAnimationActive={false}
                  onClick={(barData) => {
                    const ref =
                      (barData as { payload?: { referenceMonth?: string }; referenceMonth?: string })?.payload?.referenceMonth ??
                      (barData as { referenceMonth?: string })?.referenceMonth;
                    if (ref) setSelectedMonth(ref);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      {selectedItem && (
        <PlannedCostsDrawer
          item={selectedItem}
          data={data}
          personName={personName}
          onClose={() => setSelectedMonth(null)}
          onChanged={async () => {
            await onChanged();
            retry();
          }}
        />
      )}
    </section>
  );
}
