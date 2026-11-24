"use client";

import { useMemo, useState } from "react";
import { Check, Scale, TriangleAlert } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MonthSummary, Simulation } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import {
  CashVsInstallmentInput,
  CashVsInstallmentResult,
  PortfolioScenario,
  compareCashVsInstallments,
} from "@/lib/domain/cash-vs-installments";
import { YieldParams, buildCashVsInstallmentInput } from "@/lib/domain/cash-vs-installments-input";
import { addMonths, formatCurrencyBRL, formatMonthLabel, formatMonthShortWithYear } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export type { YieldParams } from "@/lib/domain/cash-vs-installments-input";

export interface BaseBudget {
  summaries: MonthSummary[];
  accumulated: { referenceMonth: string; accumulatedCents: number }[];
}

export interface MonthlyLeftoverComparisonPoint {
  referenceMonth: string;
  leftoverWithoutCents: number;
  leftoverWithCents: number;
}

const pct = (value: number, digits = 2) => `${(value * 100).toFixed(digits).replace(".", ",")}%`;
const axisTick = { fontSize: 11, fill: "var(--color-text-tertiary)" };
const COLORS = { none: "var(--chart-3)", cash: "var(--chart-1)", installment: "var(--chart-2)" };
const money = (cents: number) => formatCurrencyBRL(cents);

export interface CashVsInstallmentAnalysis {
  input: CashVsInstallmentInput;
  result: CashVsInstallmentResult;
}

/** Entrada + resultado do comparativo, ou null quando não há preço à vista para comparar. */
export function analyzeSimulation(sim: Simulation | Simulation[], params: YieldParams, base: BaseBudget): CashVsInstallmentAnalysis | null {
  const input = buildCashVsInstallmentInput(sim, params, base.summaries, base.accumulated);
  return input ? { input, result: compareCashVsInstallments(input) } : null;
}

export function CashVsInstallmentSection({
  simulations,
  params,
  base,
  monthlyComparison = [],
}: {
  simulations: Simulation[];
  params: YieldParams;
  base: BaseBudget;
  monthlyComparison?: MonthlyLeftoverComparisonPoint[];
}) {
  const analysis = useMemo(() => analyzeSimulation(simulations, params, base), [simulations, params, base]);

  if (simulations.length === 0) return null;

  if (!analysis) {
    return (
      <Card className="flex gap-3 p-5">
        <Scale size={18} className="mt-0.5 shrink-0 text-(--color-text-tertiary)" />
        <p className="text-sm text-(--color-text-secondary)">
          Informe o <b>preço à vista</b> {simulations.length > 1 ? "das simulações" : "desta simulação"} (menu ⋮ → Editar) para ver o impacto no seu dinheiro guardado e
          se compensa pagar à vista ou parcelar.
        </p>
      </Card>
    );
  }

  const { input, result } = analysis;
  const startMonth = simulations.map((s) => s.startDate.slice(0, 7)).sort()[0];
  const combined: Simulation = {
    ...simulations[0],
    id: simulations.map((s) => s.id).join("+"),
    description: simulations.map((s) => s.description).join(" + "),
    startDate: `${startMonth}-01`,
    installments: input.installments,
    totalAmountCents: input.installmentTotalCents,
    installmentAmountCents: Math.round(input.installmentTotalCents / Math.max(1, input.installments)),
    cashPriceCents: input.cashPriceCents,
  };

  return (
    <>
      <HeadlineCard simulation={combined} count={simulations.length} input={input} result={result} startMonth={startMonth} />
      <ImpactCard
        simulation={combined}
        input={input}
        result={result}
        startMonth={startMonth}
        monthlyComparison={monthlyComparison}
      />
    </>
  );
}

function SectionHeader({ title, subtitle, badge }: { title: string; subtitle: string; badge?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--color-border) px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <p className="mt-0.5 text-xs text-(--color-text-secondary)">{subtitle}</p>
      </div>
      {badge && (
        <span className="shrink-0 rounded-full bg-(--color-primary-soft) px-2.5 py-1 text-xs font-semibold text-(--color-primary)">
          {badge}
        </span>
      )}
    </div>
  );
}

/** Conclusão no topo: juros do parcelamento × rendimento da Caixinha, e o aviso de saldo apertado. */
function HeadlineCard({
  simulation,
  count = 1,
  input,
  result,
  startMonth,
}: {
  simulation: Simulation;
  count?: number;
  input: CashVsInstallmentInput;
  result: CashVsInstallmentResult;
  startMonth: string;
}) {
  const inst = result.installment;
  const alerts = balanceAlerts(input, result, startMonth);

  return (
    <Card className="overflow-hidden p-0">
      <SectionHeader
        title={simulation.description}
        subtitle={
          count > 1
            ? `${count} compras combinadas · ${inst ? `à vista × parcelado em até ${simulation.installments}×` : "à vista"} · início em ${formatMonthLabel(startMonth)}`
            : inst
              ? `À vista × parcelado em ${simulation.installments}× · compra em ${formatMonthLabel(startMonth)}`
              : `À vista · compra em ${formatMonthLabel(startMonth)}`
        }
      />
      <div className="space-y-4 p-5">
        {inst ? (
          <div
            className={cn(
              "flex items-start gap-4 rounded-(--radius-md) p-4 sm:items-center",
              inst.winner === "tie"
                ? "bg-black/[0.04]"
                : inst.winner === "cash"
                  ? "bg-(--color-positive-soft)"
                  : "bg-(--color-primary-soft)"
            )}
          >
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white",
                inst.winner === "tie" ? "bg-(--color-text-tertiary)" : inst.winner === "cash" ? "bg-(--color-positive)" : "bg-(--color-primary)"
              )}
            >
              <Check size={22} strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-(--color-text-secondary)">
                {inst.winner === "tie" ? "Tanto faz" : inst.winner === "cash" ? "Compensa pagar à vista" : "Compensa parcelar"}
              </p>
              <p className="mt-0.5 text-xl font-bold tracking-tight tabular-nums">
                {inst.winner === "tie"
                  ? "Diferença menor que R$ 1"
                  : `${formatCurrencyBRL(Math.abs(inst.advantageCashCents))} a mais no seu saldo final ${inst.winner === "cash" ? "pagando à vista" : "parcelando"}`}
              </p>
              <p className="mt-0.5 text-sm text-(--color-text-secondary)">
                {inst.interestCents > 0 ? (
                  <>
                    Parcelar custa <b>{pct(inst.impliedMonthlyRate)} ao mês</b> ({pct(inst.impliedAnnualRate, 1)} ao ano); a
                    Caixinha rende <b>{pct(result.netMonthlyRate)} ao mês</b> líquido de IR. O desconto à vista é de{" "}
                    {pct(inst.cashDiscount)}.
                  </>
                ) : (
                  <>O parcelado não tem juros embutidos: seu dinheiro continua rendendo enquanto você paga.</>
                )}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-(--color-text-secondary)">
            Pagar à vista tira <b>{formatCurrencyBRL(input.cashPriceCents)}</b> do saldo e reduz o rendimento em{" "}
            <b>{formatCurrencyBRL(result.cashYieldLostCents)}</b> até {formatMonthLabel(addMonths(startMonth, result.monthsHorizon))}.
          </p>
        )}

        {alerts.length > 0 && (
          <ul className="space-y-1.5 rounded-(--radius-md) bg-(--color-warning-soft) p-3">
            {alerts.map((a) => (
              <li key={a} className="flex items-start gap-2 text-xs text-(--color-text-secondary)">
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-(--color-warning)" />
                {a}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function balanceAlerts(input: CashVsInstallmentInput, result: CashVsInstallmentResult, startMonth: string): string[] {
  const out: string[] = [];
  const threshold = result.installment?.installmentCents ?? 0;
  const check = (name: string, s: PortfolioScenario) => {
    if (s.firstNegativeMonth !== null) {
      out.push(
        `${name}: o saldo acumulado fica negativo em ${formatMonthLabel(addMonths(startMonth, s.firstNegativeMonth))} (mínimo de ${formatCurrencyBRL(s.lowestBalanceCents)}).`
      );
    } else if (threshold > 0 && s.lowestBalanceCents < threshold) {
      out.push(
        `${name}: o saldo acumulado chega a ${formatCurrencyBRL(s.lowestBalanceCents)}, menos que uma parcela (${formatCurrencyBRL(threshold)}).`
      );
    }
  };
  check("À vista", result.cash);
  if (result.installment) check("Parcelado", result.installment.scenario);
  if (out.length > 0 && input.openingBalanceCents <= 0) out.push("O saldo acumulado inicial não é positivo, então nada rende no começo.");
  return out;
}

/** Os cenários (não comprar, à vista, parcelado) e o gráfico com alternador Saldo acumulado × Dinheiro guardado por mês. */
function ImpactCard({
  simulation,
  input,
  result,
  startMonth,
  monthlyComparison,
}: {
  simulation: Simulation;
  input: CashVsInstallmentInput;
  result: CashVsInstallmentResult;
  startMonth: string;
  monthlyComparison: MonthlyLeftoverComparisonPoint[];
}) {
  const [chartMode, setChartMode] = useState<"accumulated" | "monthly">("accumulated");
  const inst = result.installment;
  const last = result.monthsHorizon;
  const monthLabel = (i: number) => formatMonthShortWithYear(addMonths(startMonth, i));
  const data = result.none.balanceSeriesCents.map((_, i) => ({
    label: monthLabel(i),
    none: result.none.balanceSeriesCents[i],
    cash: result.cash.balanceSeriesCents[i],
    installment: inst?.scenario.balanceSeriesCents[i],
  }));

  const monthlyData = useMemo(
    () =>
      monthlyComparison.map((m) => ({
        label: formatMonthShortWithYear(m.referenceMonth),
        semCompra: m.leftoverWithoutCents,
        comCompra: m.leftoverWithCents,
      })),
    [monthlyComparison]
  );

  return (
    <Card className="overflow-hidden p-0">
      <SectionHeader
        title="Impacto no seu dinheiro guardado"
        subtitle={`Saldo acumulado de ${formatCurrencyBRL(input.openingBalanceCents)} no fim de ${formatMonthLabel(addMonths(startMonth, -1))} (o da Análise) mais as sobras de cada mês, aplicado na Caixinha até ${formatMonthLabel(addMonths(startMonth, last))}`}
        badge={`${input.percentOfCdi}% do CDI · IR já descontado`}
      />
      <div className="space-y-4 p-5">
        {/* Faixa compacta de saldos finais líquidos (visão direta) */}
        <div className={cn("grid grid-cols-1 gap-2.5", inst ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          <div className="rounded-(--radius-md) border border-(--color-border) px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-xs text-(--color-text-secondary)">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS.none }} />
              Não comprar
            </p>
            <p className="mt-1 text-base font-bold tabular-nums">{money(result.none.finalNetCents)}</p>
          </div>
          <div
            className={cn(
              "rounded-(--radius-md) px-3.5 py-2.5",
              inst?.winner === "cash" ? "border-2 border-(--color-positive)" : "border border-(--color-border)"
            )}
          >
            <p className="flex items-center gap-1.5 text-xs text-(--color-text-secondary)">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS.cash }} />
              À vista
            </p>
            <p className="mt-1 text-base font-bold tabular-nums">{money(result.cash.finalNetCents)}</p>
          </div>
          {inst && (
            <div
              className={cn(
                "rounded-(--radius-md) px-3.5 py-2.5",
                inst.winner === "installment" ? "border-2 border-(--color-positive)" : "border border-(--color-border)"
              )}
            >
              <p className="flex items-center gap-1.5 text-xs text-(--color-text-secondary)">
                <i className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS.installment }} />
                Parcelado {simulation.installments}×
              </p>
              <p className="mt-1 text-base font-bold tabular-nums">{money(inst.scenario.finalNetCents)}</p>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold">
                {chartMode === "accumulated" ? "Saldo acumulado mês a mês" : "Dinheiro guardado por mês"}
              </h4>
              <p className="text-[11px] text-(--color-text-tertiary)">
                {chartMode === "accumulated"
                  ? "Evolução do saldo acumulado entre Não comprar, À vista e Parcelado."
                  : "Sobra líquida mensal (quanto entra menos gastos e parcelas) Sem compra × Com compra."}
              </p>
            </div>
            <div className="flex items-center gap-0.5 rounded-(--radius-md) border border-(--color-border) bg-black/[0.025] p-0.5">
              <button
                type="button"
                onClick={() => setChartMode("accumulated")}
                className={cn(
                  "rounded-[calc(var(--radius-md)-2px)] px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  chartMode === "accumulated"
                    ? "bg-(--color-surface) text-(--color-text-primary) shadow-xs"
                    : "text-(--color-text-tertiary) hover:text-(--color-text-primary)"
                )}
              >
                Saldo acumulado
              </button>
              <button
                type="button"
                onClick={() => setChartMode("monthly")}
                disabled={monthlyData.length === 0}
                className={cn(
                  "rounded-[calc(var(--radius-md)-2px)] px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40",
                  chartMode === "monthly"
                    ? "bg-(--color-surface) text-(--color-text-primary) shadow-xs"
                    : "text-(--color-text-tertiary) hover:text-(--color-text-primary)"
                )}
              >
                Dinheiro guardado por mês
              </button>
            </div>
          </div>

          <div
            className="h-64 min-w-0 w-full"
            role="img"
            aria-label={
              chartMode === "accumulated"
                ? "Saldo acumulado em cada cenário ao longo dos meses"
                : "Dinheiro guardado por mês sem compra versus com compra"
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === "accumulated" ? (
                <LineChart data={data} margin={{ top: 8, right: 22, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-border)" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={axisTick}
                    interval="preserveStartEnd"
                    padding={{ left: 10, right: 14 }}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={axisTick} width={74} tickFormatter={(v) => formatCurrencyBRL(Number(v)).replace(",00", "")} />
                  <Tooltip
                    formatter={(v) => formatCurrencyBRL(Number(v))}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12 }}
                  />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-(--color-text-secondary)">{v}</span>} />
                  <Line type="monotone" dataKey="none" name="Não comprar" stroke={COLORS.none} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                  <Line type="monotone" dataKey="cash" name="À vista" stroke={COLORS.cash} strokeWidth={2.5} dot={false} />
                  {inst && <Line type="monotone" dataKey="installment" name="Parcelado" stroke={COLORS.installment} strokeWidth={2.5} dot={false} />}
                </LineChart>
              ) : (
                <BarChart data={monthlyData} margin={{ top: 8, right: 22, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-border)" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={axisTick}
                    interval="preserveStartEnd"
                    padding={{ left: 10, right: 14 }}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={axisTick} width={74} tickFormatter={(v) => formatCurrencyBRL(Number(v)).replace(",00", "")} />
                  <Tooltip
                    formatter={(v) => formatCurrencyBRL(Number(v))}
                    contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12 }}
                  />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-(--color-text-secondary)">{v}</span>} />
                  <Bar dataKey="semCompra" name="Sem compra (sobra/mês)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="comCompra" name="Com compra (sobra/mês)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
          {chartMode === "accumulated" && (
            <p className="mt-1 text-xs text-(--color-text-tertiary)">
              Saldos brutos (antes do IR do resgate). O à vista cai de uma vez no mês da compra; o parcelado cai um pouco por mês e, por isso, rende mais no começo.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
