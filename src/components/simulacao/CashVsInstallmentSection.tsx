"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Scale, Sparkles, TriangleAlert } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Simulation } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { compareCashVsInstallments, CashVsInstallmentResult } from "@/lib/domain/cash-vs-installments";
import { generateCashVsInstallmentAiSummary } from "@/lib/data/simulation-analysis";
import { addMonths, formatCurrencyBRL, formatMonthLabel, formatMonthShortWithYear } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const pct = (value: number, digits = 2) => `${(value * 100).toFixed(digits).replace(".", ",")}%`;
const axisTick = { fontSize: 11, fill: "var(--color-text-tertiary)" };

export interface YieldParams {
  cdiAnnualPercent: number;
  percentOfCdi: number;
}

/** Resultado do comparativo de uma simulação, ou null quando ela não tem parcelado/preço à vista para comparar. */
export function comparisonFor(sim: Simulation, params: YieldParams): CashVsInstallmentResult | null {
  if (sim.cashPriceCents == null || sim.cashPriceCents <= 0) return null;
  return compareCashVsInstallments({
    cashPriceCents: sim.cashPriceCents,
    installmentTotalCents: sim.installments > 1 ? sim.totalAmountCents : sim.cashPriceCents,
    installments: sim.installments > 1 ? sim.installments : 1,
    ...params,
  });
}

export function CashVsInstallmentSection({
  simulation,
  params,
  lowestBalanceCents,
}: {
  simulation: Simulation;
  params: YieldParams;
  lowestBalanceCents: number | null;
}) {
  const result = useMemo(() => comparisonFor(simulation, params), [simulation, params]);
  const hasInstallments = simulation.installments > 1;

  if (!result || simulation.cashPriceCents == null) {
    return (
      <Card className="flex gap-3 p-5">
        <Scale size={18} className="mt-0.5 shrink-0 text-(--color-text-tertiary)" />
        <p className="text-sm text-(--color-text-secondary)">
          Informe o <b>preço à vista</b> desta simulação (menu ⋮ → Editar) para ver quanto o dinheiro renderia e se
          compensa pagar à vista ou parcelar.
        </p>
      </Card>
    );
  }

  return (
    <>
      <IdleYieldCard simulation={simulation} cashPriceCents={simulation.cashPriceCents} result={result} params={params} />
      {hasInstallments && (
        <>
          <VerdictCard simulation={simulation} cashPriceCents={simulation.cashPriceCents} result={result} />
          <AiAnalysisCard
            simulation={simulation}
            cashPriceCents={simulation.cashPriceCents}
            params={params}
            lowestBalanceCents={lowestBalanceCents}
          />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <BreakEvenCard simulation={simulation} cashPriceCents={simulation.cashPriceCents} result={result} />
            <SensitivityCard simulation={simulation} cashPriceCents={simulation.cashPriceCents} params={params} />
          </div>
        </>
      )}
    </>
  );
}

function SectionHeader({ title, subtitle, badge }: { title: string; subtitle: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-(--color-border) px-5 py-4">
      <div>
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

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: "neg" | "pos"; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-(--color-text-secondary)">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong ? "font-bold" : "font-semibold",
          tone === "neg" && "text-(--color-negative)",
          tone === "pos" && "text-(--color-positive)"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** "Se você não comprar": quanto o preço à vista renderia na Caixinha no mesmo período. */
function IdleYieldCard({
  simulation,
  cashPriceCents,
  result,
  params,
}: {
  simulation: Simulation;
  cashPriceCents: number;
  result: CashVsInstallmentResult;
  params: YieldParams;
}) {
  const startMonth = simulation.startDate.slice(0, 7);
  const endMonth = addMonths(startMonth, result.monthsHorizon);
  const { idle } = result;
  const data = idle.series.map((p) => ({
    label: formatMonthShortWithYear(addMonths(startMonth, p.month)),
    balance: cashPriceCents + p.netBalanceCents,
  }));
  const comparisons =
    simulation.installments > 1
      ? [
          { label: "À vista", paid: cashPriceCents, lost: idle.netYieldCents, total: result.cash.realCostCents },
          {
            label: `Parcelado ${simulation.installments}×`,
            paid: simulation.totalAmountCents,
            lost: idle.netYieldCents - result.installment.netYieldCents,
            total: result.installment.realCostCents,
          },
        ]
      : [];
  const maxTotal = Math.max(...comparisons.map((c) => c.total), 1);

  return (
    <Card className="overflow-hidden p-0">
      <SectionHeader
        title="Se você não comprar"
        subtitle={`Quanto o dinheiro renderia na Caixinha de ${formatMonthLabel(startMonth)} a ${formatMonthLabel(endMonth)} (${result.monthsHorizon} meses)`}
        badge={`${params.percentOfCdi}% do CDI · IR já descontado`}
      />
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs text-(--color-text-secondary)">Rendimento líquido em {result.monthsHorizon} meses</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-(--color-positive) tabular-nums">
              + {formatCurrencyBRL(idle.netYieldCents)}
            </p>
            <p className="mt-1.5 text-sm tabular-nums text-(--color-text-secondary)">
              {formatCurrencyBRL(cashPriceCents)} viram <b className="text-(--color-text-primary)">{formatCurrencyBRL(idle.finalCents)}</b>
            </p>
            <div className="mt-4 space-y-1.5 text-sm">
              <Row label="Rendimento bruto" value={formatCurrencyBRL(idle.grossYieldCents)} />
              <Row label={`IR (${pct(idle.irRate, 1)})`} value={`− ${formatCurrencyBRL(idle.irCents)}`} tone="neg" />
              <div className="border-t border-(--color-border) pt-1.5">
                <Row label="Rendimento líquido" value={formatCurrencyBRL(idle.netYieldCents)} strong />
              </div>
            </div>
          </div>
          <div className="h-48 w-full" role="img" aria-label="Saldo da Caixinha crescendo ao longo do período">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} interval="preserveStartEnd" />
                <YAxis hide domain={[cashPriceCents, "dataMax"]} />
                <Tooltip
                  formatter={(v) => formatCurrencyBRL(Number(v))}
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12 }}
                />
                <Area type="monotone" dataKey="balance" name="Saldo líquido" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.12} strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {idle.milestones.map((m) => (
            <div key={m.months} className="rounded-(--radius-md) bg-black/[0.03] p-3">
              <p className="text-xs text-(--color-text-secondary)">{m.months} meses</p>
              <p className="mt-0.5 text-base font-bold tabular-nums">+ {formatCurrencyBRL(m.netYieldCents)}</p>
              <p className="mt-0.5 text-xs text-(--color-text-tertiary)">IR {pct(m.irRate, 1)}</p>
            </div>
          ))}
        </div>

        {comparisons.length > 0 && (
          <div className="rounded-(--radius-md) border border-(--color-border) p-4">
            <p className="mb-3 text-sm font-semibold">
              Custo real da compra{" "}
              <span className="font-normal text-(--color-text-secondary)">
                — dinheiro que sai + rendimento que você deixa de ganhar
              </span>
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {comparisons.map((c) => (
                <div key={c.label}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span>{c.label}</span>
                    <span className="font-bold tabular-nums">{formatCurrencyBRL(c.total)}</span>
                  </div>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-black/[0.06]" style={{ width: `${(c.total / maxTotal) * 100}%` }}>
                    <div className="bg-(--color-text-primary)" style={{ width: `${(c.paid / c.total) * 100}%` }} />
                    <div className="bg-(--chart-3)" style={{ width: `${(Math.max(c.lost, 0) / c.total) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs tabular-nums text-(--color-text-tertiary)">
                    {formatCurrencyBRL(c.paid)} pagos + {formatCurrencyBRL(c.lost)} de rendimento perdido
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function VerdictCard({
  simulation,
  cashPriceCents,
  result,
}: {
  simulation: Simulation;
  cashPriceCents: number;
  result: CashVsInstallmentResult;
}) {
  const { installment, cash } = result;
  const cashWins = result.winner === "cash";
  const tie = result.winner === "tie";
  const diff = Math.abs(result.advantageCashCents);
  // 1ª parcela 30 dias depois da compra.
  const firstInstallmentMonth = addMonths(simulation.startDate.slice(0, 7), 1);
  const rows = installment.months.map((m) => ({ ...m, label: formatMonthShortWithYear(addMonths(firstInstallmentMonth, m.index - 1)) }));
  const shown = rows.length > 6 ? [...rows.slice(0, 4), null, rows[rows.length - 1]] : rows;
  const lastBalanceNegative = installment.months[installment.months.length - 1].balanceCents < 0;
  const interestNegative = installment.interestCents <= 0;

  return (
    <Card className="overflow-hidden p-0">
      <SectionHeader
        title={simulation.description}
        subtitle={`Comparativo: à vista × parcelado · compra em ${formatMonthLabel(simulation.startDate.slice(0, 7))}`}
      />
      <div className="space-y-5 p-5">
        <div
          className={cn(
            "flex items-center gap-4 rounded-(--radius-md) p-4",
            tie ? "bg-black/[0.04]" : cashWins ? "bg-(--color-positive-soft)" : "bg-(--color-primary-soft)"
          )}
        >
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white",
              tie ? "bg-(--color-text-tertiary)" : cashWins ? "bg-(--color-positive)" : "bg-(--color-primary)"
            )}
          >
            <Check size={22} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-(--color-text-secondary)">
              {tie ? "Tanto faz" : cashWins ? "Compensa pagar à vista" : "Compensa parcelar"}
            </p>
            <p className="mt-0.5 text-xl font-bold tracking-tight tabular-nums">
              {tie ? "Diferença menor que R$ 1" : `${formatCurrencyBRL(diff)} ${cashWins ? "a menos no bolso" : "a mais no bolso"}`}
            </p>
            <p className="mt-0.5 text-sm text-(--color-text-secondary)">
              {interestNegative
                ? `O parcelado não tem juros embutidos e seu dinheiro rende ${formatCurrencyBRL(installment.netYieldCents)} líquidos enquanto você paga.`
                : `Os juros do parcelamento (${formatCurrencyBRL(installment.interestCents)}) ${cashWins ? "superam" : "ficam abaixo de"} o rendimento do dinheiro guardado (${formatCurrencyBRL(installment.netYieldCents)} líquidos).`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={cn("relative rounded-(--radius-md) p-4", cashWins ? "border-2 border-(--color-positive)" : "border border-(--color-border)")}>
            {cashWins && <Badge text="Melhor opção" />}
            <p className="text-xs text-(--color-text-secondary)">À vista · hoje</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{formatCurrencyBRL(cashPriceCents)}</p>
            <div className="mt-3 space-y-1.5 text-sm">
              <Row label="Dinheiro guardado" value={formatCurrencyBRL(0)} />
              <Row label="Rendimento no período" value={formatCurrencyBRL(0)} />
              <div className="border-t border-(--color-border) pt-1.5">
                <Row label="Custo total líquido" value={formatCurrencyBRL(cashPriceCents)} strong />
              </div>
            </div>
          </div>
          <div className={cn("relative rounded-(--radius-md) p-4", !cashWins && !tie ? "border-2 border-(--color-primary)" : "border border-(--color-border)")}>
            {!cashWins && !tie && <Badge text="Melhor opção" />}
            <p className="text-xs text-(--color-text-secondary)">
              Parcelado · {simulation.installments}× de {formatCurrencyBRL(simulation.installmentAmountCents)}
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{formatCurrencyBRL(installment.totalPaidCents)}</p>
            <div className="mt-3 space-y-1.5 text-sm">
              <Row label="Juros embutidos" value={`${installment.interestCents >= 0 ? "+" : "−"} ${formatCurrencyBRL(Math.abs(installment.interestCents))}`} tone={installment.interestCents > 0 ? "neg" : "pos"} />
              <Row label="Rendimento líquido (Caixinha)" value={`− ${formatCurrencyBRL(installment.netYieldCents)}`} tone="pos" />
              <div className="border-t border-(--color-border) pt-1.5">
                <Row label="Custo total líquido" value={formatCurrencyBRL(installment.netCostCents)} strong />
              </div>
            </div>
          </div>
        </div>
        <p className="-mt-2 text-xs text-(--color-text-tertiary)">
          Juros implícitos do parcelamento: {pct(installment.impliedMonthlyRate)} ao mês ({pct(installment.impliedAnnualRate, 1)} ao ano) · custo líquido à vista: {formatCurrencyBRL(cash.totalPaidCents)}.
        </p>

        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold">Juros pagos × rendimento acumulado</h4>
          </div>
          <div className="h-60 w-full" role="img" aria-label="Juros embutidos acumulados comparados ao rendimento líquido acumulado">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} interval="preserveStartEnd" />
                <YAxis axisLine={false} tickLine={false} tick={axisTick} width={56} tickFormatter={(v) => formatCurrencyBRL(Number(v)).replace(",00", "")} />
                <Tooltip
                  formatter={(v) => formatCurrencyBRL(Number(v))}
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12 }}
                />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-(--color-text-secondary)">{v}</span>} />
                <Line type="monotone" dataKey="accumulatedInterestCents" name="Juros embutidos" stroke="var(--color-negative)" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="accumulatedNetYieldCents" name="Rendimento líquido" stroke="var(--chart-3)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <h4 className="mb-1 text-sm font-semibold">Mês a mês — dinheiro que sobra guardado no parcelado</h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[13px] tabular-nums">
              <thead>
                <tr className="text-[11px] font-semibold text-(--color-text-secondary)">
                  <th className="border-b border-(--color-border) px-2.5 py-2 text-left">Mês</th>
                  <th className="border-b border-(--color-border) px-2.5 py-2 text-right">Parcela paga</th>
                  <th className="border-b border-(--color-border) px-2.5 py-2 text-right">Saldo na Caixinha</th>
                  <th className="border-b border-(--color-border) px-2.5 py-2 text-right">Rendimento do mês</th>
                  <th className="border-b border-(--color-border) px-2.5 py-2 text-right">Acumulado (líq.)</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m, i) =>
                  m === null ? (
                    <tr key={`gap-${i}`}>
                      <td colSpan={5} className="border-b border-(--color-border)/60 px-2.5 py-2 text-(--color-text-tertiary)">
                        … {rows.length - 5} meses
                      </td>
                    </tr>
                  ) : (
                    <tr key={m.index} className={m.index === rows.length ? "font-semibold" : ""}>
                      <td className="border-b border-(--color-border)/60 px-2.5 py-2 text-left">
                        {m.label} · {m.index}/{rows.length}
                      </td>
                      <td className="border-b border-(--color-border)/60 px-2.5 py-2 text-right">{formatCurrencyBRL(m.installmentCents)}</td>
                      <td className={cn("border-b border-(--color-border)/60 px-2.5 py-2 text-right", m.balanceCents < 0 && "text-(--color-negative)")}>
                        {m.balanceCents < 0 ? "− " : ""}
                        {formatCurrencyBRL(Math.abs(m.balanceCents))}
                      </td>
                      <td className="border-b border-(--color-border)/60 px-2.5 py-2 text-right">{formatCurrencyBRL(m.yieldCents)}</td>
                      <td className="border-b border-(--color-border)/60 px-2.5 py-2 text-right text-(--color-positive)">{formatCurrencyBRL(m.accumulatedNetYieldCents)}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
          {lastBalanceNegative && (
            <p className="mt-2.5 flex items-start gap-1.5 text-xs text-(--color-text-secondary)">
              <TriangleAlert size={14} className="mt-px shrink-0 text-(--color-warning)" />
              Saldo negativo no fim: o rendimento sozinho não paga todas as parcelas — a diferença sai da sobra do orçamento.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span className="absolute -top-3 left-3.5 rounded-full bg-(--color-positive-soft) px-2.5 py-1 text-xs font-semibold text-(--color-positive)">
      {text}
    </span>
  );
}

function AiAnalysisCard({
  simulation,
  cashPriceCents,
  params,
  lowestBalanceCents,
}: {
  simulation: Simulation;
  cashPriceCents: number;
  params: YieldParams;
  lowestBalanceCents: number | null;
}) {
  const [nonce, setNonce] = useState(0);
  const key = `${simulation.id}|${cashPriceCents}|${simulation.totalAmountCents}|${simulation.installments}|${params.cdiAnnualPercent}|${params.percentOfCdi}|${nonce}`;
  const [state, setState] = useState<{ key: string; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    generateCashVsInstallmentAiSummary({
      description: simulation.description,
      cashPriceCents,
      installmentTotalCents: simulation.totalAmountCents,
      installments: simulation.installments,
      lowestBalanceCents,
      ...params,
    }).then((text) => {
      if (!cancelled) setState({ key, text });
    });
    return () => {
      cancelled = true;
    };
    // lowestBalanceCents muda a cada troca de cenário, mas já está refletido em `key` via simulação/taxas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const text = state?.key === key ? state.text : null;

  return (
    <Card className="flex gap-3 border-(--color-primary)/20 bg-(--color-primary-soft)/40 p-5">
      <Sparkles size={18} className="mt-0.5 shrink-0 text-(--color-primary)" />
      <div className="flex-1">
        <p className="mb-1 text-sm font-semibold text-(--color-primary)">Análise da IA · à vista × parcelado</p>
        {text === null ? (
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-black/10" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-black/10" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-black/10" />
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-(--color-text-secondary)">{text}</p>
        )}
        <p className="mt-2 text-xs text-(--color-text-tertiary)">Gerado a partir das taxas ao lado · não é recomendação de investimento.</p>
      </div>
      <button
        type="button"
        onClick={() => setNonce((n) => n + 1)}
        disabled={text === null}
        className="self-start rounded-(--radius-md) bg-black/5 px-3 py-1.5 text-xs font-semibold text-(--color-text-primary) hover:bg-black/10 disabled:opacity-50"
      >
        Refazer
      </button>
    </Card>
  );
}

function BreakEvenCard({
  simulation,
  cashPriceCents,
  result,
}: {
  simulation: Simulation;
  cashPriceCents: number;
  result: CashVsInstallmentResult;
}) {
  const offer = simulation.totalAmountCents;
  const be = result.breakEvenTotalCents;
  const span = Math.max(offer, be) - cashPriceCents;
  const markerPct = span > 0 ? Math.min(Math.max(((be - cashPriceCents) / span) * 100, 0), 100) : 100;

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold">Ponto de equilíbrio</h3>
      <p className="mt-0.5 text-xs text-(--color-text-secondary)">Até que valor parcelar ainda compensa</p>
      <p className="mt-4 text-2xl font-bold tracking-tight tabular-nums">{formatCurrencyBRL(be)}</p>
      <p className="mt-0.5 text-xs tabular-nums text-(--color-text-secondary)">
        {simulation.installments}× de {formatCurrencyBRL(result.breakEvenInstallmentCents)} · juros máx.{" "}
        {pct(result.breakEvenMonthlyRate)} a.m.
      </p>
      <div className="relative mt-4 h-2 rounded-full bg-black/[0.06]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-(--chart-3)" style={{ width: `${markerPct}%` }} />
        <div className="absolute -top-1 h-4 w-[3px] rounded bg-(--color-text-primary)" style={{ left: `calc(${markerPct}% - 1px)` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-(--color-text-tertiary)">
        <span>{formatCurrencyBRL(cashPriceCents)} (à vista)</span>
        <span>{formatCurrencyBRL(offer)} (oferta)</span>
      </div>
    </Card>
  );
}

function SensitivityCard({
  simulation,
  cashPriceCents,
  params,
}: {
  simulation: Simulation;
  cashPriceCents: number;
  params: YieldParams;
}) {
  const rows = [-2.5, 0, 2.5].map((delta) => {
    const cdi = params.cdiAnnualPercent + delta;
    const r = compareCashVsInstallments({
      cashPriceCents,
      installmentTotalCents: simulation.totalAmountCents,
      installments: simulation.installments,
      cdiAnnualPercent: cdi,
      percentOfCdi: params.percentOfCdi,
    });
    return { cdi, delta, yieldCents: r.installment.netYieldCents, advantage: r.advantageCashCents };
  });
  const allCash = rows.every((r) => r.advantage > 0);
  const allInstallment = rows.every((r) => r.advantage < 0);

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold">E se o CDI mudar?</h3>
      <p className="mt-0.5 text-xs text-(--color-text-secondary)">Sensibilidade do resultado</p>
      <table className="mt-2 w-full border-collapse text-[13px] tabular-nums">
        <thead>
          <tr className="text-[11px] font-semibold text-(--color-text-secondary)">
            <th className="border-b border-(--color-border) py-2 text-left">CDI a.a.</th>
            <th className="border-b border-(--color-border) py-2 text-right">Rendimento (parcelado)</th>
            <th className="border-b border-(--color-border) py-2 text-right">Vantagem à vista</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.delta} className={r.delta === 0 ? "bg-(--color-primary-soft)/50 font-bold" : ""}>
              <td className="border-b border-(--color-border)/60 py-2 pl-1.5 text-left">{r.cdi.toFixed(2).replace(".", ",")}%</td>
              <td className="border-b border-(--color-border)/60 py-2 text-right">{formatCurrencyBRL(r.yieldCents)}</td>
              <td className={cn("border-b border-(--color-border)/60 py-2 pr-1.5 text-right", r.advantage >= 0 ? "text-(--color-positive)" : "text-(--color-primary)")}>
                {r.advantage >= 0 ? "" : "− "}
                {formatCurrencyBRL(Math.abs(r.advantage))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-(--color-text-tertiary)">
        {allCash
          ? "Em todos esses cenários de CDI, pagar à vista continua melhor."
          : allInstallment
            ? "Em todos esses cenários de CDI, parcelar continua melhor."
            : "O melhor caminho muda dentro dessa faixa de CDI."}
      </p>
    </Card>
  );
}
