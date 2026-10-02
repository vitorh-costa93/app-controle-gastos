"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Scale, Sparkles, TriangleAlert } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MonthSummary, Simulation } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import {
  CashVsInstallmentInput,
  CashVsInstallmentResult,
  PortfolioScenario,
  compareCashVsInstallments,
} from "@/lib/domain/cash-vs-installments";
import { YieldParams, buildCashVsInstallmentInput } from "@/lib/domain/cash-vs-installments-input";
import { generateCashVsInstallmentAiSummary } from "@/lib/data/simulation-analysis";
import { addMonths, formatCurrencyBRL, formatMonthLabel, formatMonthShortWithYear } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export type { YieldParams } from "@/lib/domain/cash-vs-installments-input";

export interface BaseBudget {
  summaries: MonthSummary[];
  accumulated: { referenceMonth: string; accumulatedCents: number }[];
}

const pct = (value: number, digits = 2) => `${(value * 100).toFixed(digits).replace(".", ",")}%`;
const axisTick = { fontSize: 11, fill: "var(--color-text-tertiary)" };
const COLORS = { none: "var(--chart-3)", cash: "var(--chart-1)", installment: "var(--chart-2)" };

export interface CashVsInstallmentAnalysis {
  input: CashVsInstallmentInput;
  result: CashVsInstallmentResult;
}

/** Entrada + resultado do comparativo, ou null quando a simulação não tem preço à vista para comparar. */
export function analyzeSimulation(sim: Simulation, params: YieldParams, base: BaseBudget): CashVsInstallmentAnalysis | null {
  const input = buildCashVsInstallmentInput(sim, params, base.summaries, base.accumulated);
  return input ? { input, result: compareCashVsInstallments(input) } : null;
}

export function CashVsInstallmentSection({
  simulation,
  params,
  base,
}: {
  simulation: Simulation;
  params: YieldParams;
  base: BaseBudget;
}) {
  const analysis = useMemo(() => analyzeSimulation(simulation, params, base), [simulation, params, base]);

  if (!analysis) {
    return (
      <Card className="flex gap-3 p-5">
        <Scale size={18} className="mt-0.5 shrink-0 text-(--color-text-tertiary)" />
        <p className="text-sm text-(--color-text-secondary)">
          Informe o <b>preço à vista</b> desta simulação (menu ⋮ → Editar) para ver o impacto no seu dinheiro guardado e
          se compensa pagar à vista ou parcelar.
        </p>
      </Card>
    );
  }

  const { input, result } = analysis;
  const startMonth = simulation.startDate.slice(0, 7);

  return (
    <>
      <HeadlineCard simulation={simulation} input={input} result={result} startMonth={startMonth} />
      <ImpactCard simulation={simulation} input={input} result={result} startMonth={startMonth} />
      {result.installment && (
        <>
          <AiAnalysisCard simulation={simulation} input={input} />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <BreakEvenCard simulation={simulation} input={input} result={result} />
            <SensitivityCard input={input} />
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

/** Conclusão no topo: juros do parcelamento × rendimento da Caixinha, e o aviso de saldo apertado. */
function HeadlineCard({
  simulation,
  input,
  result,
  startMonth,
}: {
  simulation: Simulation;
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
          inst
            ? `À vista × parcelado em ${simulation.installments}× · compra em ${formatMonthLabel(startMonth)}`
            : `À vista · compra em ${formatMonthLabel(startMonth)}`
        }
      />
      <div className="space-y-4 p-5">
        {inst ? (
          <div
            className={cn(
              "flex items-center gap-4 rounded-(--radius-md) p-4",
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
                  : `${formatCurrencyBRL(Math.abs(inst.advantageCashCents))} ${inst.winner === "cash" ? "a mais" : "a menos"} no seu saldo final`}
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

/** Os cenários (não comprar, à vista, parcelado) lado a lado, o gráfico e a tabela mês a mês. */
function ImpactCard({
  simulation,
  input,
  result,
  startMonth,
}: {
  simulation: Simulation;
  input: CashVsInstallmentInput;
  result: CashVsInstallmentResult;
  startMonth: string;
}) {
  const inst = result.installment;
  const last = result.monthsHorizon;
  const monthLabel = (i: number) => formatMonthShortWithYear(addMonths(startMonth, i));
  const data = result.none.balanceSeriesCents.map((_, i) => ({
    label: monthLabel(i),
    none: result.none.balanceSeriesCents[i],
    cash: result.cash.balanceSeriesCents[i],
    installment: inst?.scenario.balanceSeriesCents[i],
  }));
  const rows = data.map((d, i) => ({ ...d, i, leftover: result.leftoversCents[i] }));
  const shown = rows.length > 6 ? [...rows.slice(0, 4), null, rows[rows.length - 1]] : rows;
  const installmentCents = inst?.installmentCents ?? 0;

  return (
    <Card className="overflow-hidden p-0">
      <SectionHeader
        title="Impacto no seu dinheiro guardado"
        subtitle={`Saldo acumulado de ${formatCurrencyBRL(input.openingBalanceCents)} no fim de ${formatMonthLabel(addMonths(startMonth, -1))} (o da Análise) mais as sobras de cada mês, aplicado na Caixinha até ${formatMonthLabel(addMonths(startMonth, last))}`}
        badge={`${input.percentOfCdi}% do CDI · IR já descontado`}
      />
      <div className="space-y-5 p-5">
        <div className={cn("grid grid-cols-1 gap-3", inst ? "md:grid-cols-3" : "md:grid-cols-2")}>
          <ScenarioCard
            color={COLORS.none}
            title="Não comprar"
            hint="Referência: as sobras se somam ao saldo e rendem."
            scenario={result.none}
          />
          <ScenarioCard
            color={COLORS.cash}
            title="Comprar à vista"
            hint={`Desconta ${formatCurrencyBRL(input.cashPriceCents)} só em ${formatMonthLabel(startMonth)} e segue acumulando as sobras.`}
            scenario={result.cash}
            lostCents={result.cashYieldLostCents}
            best={inst?.winner === "cash"}
          />
          {inst && (
            <ScenarioCard
              color={COLORS.installment}
              title={`Comprar parcelado ${simulation.installments}×`}
              hint={`Desconta ${formatCurrencyBRL(inst.installmentCents)} por mês, de ${formatMonthLabel(addMonths(startMonth, 1))} a ${formatMonthLabel(addMonths(startMonth, last))}, e segue acumulando as sobras.`}
              scenario={inst.scenario}
              lostCents={inst.yieldLostCents}
              best={inst.winner === "installment"}
            />
          )}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold">Saldo acumulado mês a mês</h4>
          <div className="h-64 w-full" role="img" aria-label="Saldo acumulado em cada cenário ao longo dos meses">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} interval="preserveStartEnd" />
                <YAxis axisLine={false} tickLine={false} tick={axisTick} width={64} tickFormatter={(v) => formatCurrencyBRL(Number(v)).replace(",00", "")} />
                <Tooltip
                  formatter={(v) => formatCurrencyBRL(Number(v))}
                  contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 12 }}
                />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-(--color-text-secondary)">{v}</span>} />
                <Line type="monotone" dataKey="none" name="Não comprar" stroke={COLORS.none} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                <Line type="monotone" dataKey="cash" name="À vista" stroke={COLORS.cash} strokeWidth={2.5} dot={false} />
                {inst && <Line type="monotone" dataKey="installment" name="Parcelado" stroke={COLORS.installment} strokeWidth={2.5} dot={false} />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-xs text-(--color-text-tertiary)">
            Saldos brutos (antes do IR do resgate). O à vista cai de uma vez no mês da compra; o parcelado cai um pouco por mês e, por isso, rende mais no começo.
          </p>
        </div>

        <div className="overflow-x-auto">
          <h4 className="mb-1 text-sm font-semibold">Mês a mês — saldo acumulado depois da sobra e da compra</h4>
          <table className="w-full min-w-[640px] border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="text-[11px] font-semibold text-(--color-text-secondary)">
                <Th left>Mês</Th>
                <Th>Sobra do mês</Th>
                <Th>Saída da compra</Th>
                <Th>Não comprar</Th>
                <Th>À vista</Th>
                {inst && <Th>Parcelado</Th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((m, idx) =>
                m === null ? (
                  <tr key={`gap-${idx}`}>
                    <td colSpan={inst ? 6 : 5} className="border-b border-(--color-border)/60 px-2.5 py-2 text-(--color-text-tertiary)">
                      … {rows.length - 5} meses
                    </td>
                  </tr>
                ) : (
                  <tr key={m.i} className={m.i === last ? "font-semibold" : ""}>
                    <Td left>
                      {formatMonthShortWithYear(addMonths(startMonth, m.i))}
                      {m.i === 0 ? " · compra" : inst ? ` · ${m.i}/${simulation.installments}` : ""}
                    </Td>
                    <Td className={m.leftover >= 0 ? "text-(--color-positive)" : "text-(--color-negative)"}>
                      {m.leftover >= 0 ? "+ " : "− "}
                      {formatCurrencyBRL(Math.abs(m.leftover))}
                    </Td>
                    <Td className="text-(--color-negative)">
                      {m.i === 0
                        ? `− ${formatCurrencyBRL(input.cashPriceCents)} (à vista)`
                        : inst
                          ? `− ${formatCurrencyBRL(installmentCents)} (parcela)`
                          : "—"}
                    </Td>
                    <Td>{money(m.none)}</Td>
                    <Td className={m.cash < 0 ? "text-(--color-negative)" : ""}>{money(m.cash)}</Td>
                    {inst && <Td className={cn("font-semibold", (m.installment ?? 0) < 0 && "text-(--color-negative)")}>{money(m.installment ?? 0)}</Td>}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        {inst && (
          <p className="rounded-(--radius-md) bg-black/[0.04] p-3.5 text-[13px] leading-relaxed text-(--color-text-secondary)">
            Parcelar mantém o dinheiro rendendo por mais tempo: você rende{" "}
            <b className="text-(--color-text-primary)">{formatCurrencyBRL(Math.abs(inst.extraYieldCents))} {inst.extraYieldCents >= 0 ? "a mais" : "a menos"}</b>{" "}
            do que pagando à vista. Mas os juros do parcelamento são{" "}
            <b className="text-(--color-text-primary)">{formatCurrencyBRL(inst.interestCents)}</b>, então o saldo final fica{" "}
            <b className="text-(--color-text-primary)">
              {formatCurrencyBRL(Math.abs(inst.advantageCashCents))} {inst.advantageCashCents >= 0 ? "menor" : "maior"}
            </b>{" "}
            ({formatCurrencyBRL(inst.scenario.finalNetCents)} contra {formatCurrencyBRL(result.cash.finalNetCents)} no à vista).
          </p>
        )}
      </div>
    </Card>
  );
}

const money = (cents: number) => `${cents < 0 ? "− " : ""}${formatCurrencyBRL(Math.abs(cents))}`;

function Th({ children, left }: { children: React.ReactNode; left?: boolean }) {
  return <th className={cn("border-b border-(--color-border) px-2.5 py-2", left ? "text-left" : "text-right")}>{children}</th>;
}

function Td({ children, left, className }: { children: React.ReactNode; left?: boolean; className?: string }) {
  return <td className={cn("border-b border-(--color-border)/60 px-2.5 py-2", left ? "text-left" : "text-right", className)}>{children}</td>;
}

function ScenarioCard({
  color,
  title,
  hint,
  scenario,
  lostCents,
  best,
}: {
  color: string;
  title: string;
  hint: string;
  scenario: PortfolioScenario;
  lostCents?: number;
  best?: boolean;
}) {
  return (
    <div className={cn("relative rounded-(--radius-md) p-4", best ? "border-2 border-(--color-positive)" : "border border-(--color-border)")}>
      {best && (
        <span className="absolute -top-3 left-3.5 rounded-full bg-(--color-positive-soft) px-2.5 py-1 text-xs font-semibold text-(--color-positive)">
          Melhor entre as compras
        </span>
      )}
      <p className="flex items-center gap-1.5 text-xs text-(--color-text-secondary)">
        <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {title}
      </p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-(--color-positive) tabular-nums">
        + {formatCurrencyBRL(scenario.netYieldCents)}
      </p>
      <p className="mt-0.5 text-xs text-(--color-text-secondary)">rendimento líquido no período</p>
      <p className="mt-2 text-xs leading-snug text-(--color-text-tertiary)">{hint}</p>
      <div className="mt-3 space-y-1.5 text-sm">
        <Row label="IR pago" value={`− ${formatCurrencyBRL(scenario.irCents)}`} tone="neg" />
        {lostCents !== undefined && <Row label="Rende a menos que não comprar" value={`− ${formatCurrencyBRL(Math.max(lostCents, 0))}`} tone="neg" />}
        <div className="border-t border-(--color-border) pt-1.5">
          <Row label="Saldo final (já com IR)" value={money(scenario.finalNetCents)} strong />
        </div>
      </div>
    </div>
  );
}

function AiAnalysisCard({ simulation, input }: { simulation: Simulation; input: CashVsInstallmentInput }) {
  const [nonce, setNonce] = useState(0);
  const key = `${simulation.id}|${input.cashPriceCents}|${input.installmentTotalCents}|${input.installments}|${input.cdiAnnualPercent}|${input.percentOfCdi}|${input.openingBalanceCents}|${nonce}`;
  const [state, setState] = useState<{ key: string; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    generateCashVsInstallmentAiSummary({ description: simulation.description, ...input }).then((text) => {
      if (!cancelled) setState({ key, text });
    });
    return () => {
      cancelled = true;
    };
    // `input` é derivado das mesmas partes que compõem `key`; evita refazer a chamada a cada render.
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
  input,
  result,
}: {
  simulation: Simulation;
  input: CashVsInstallmentInput;
  result: CashVsInstallmentResult;
}) {
  const inst = result.installment;
  if (!inst) return null;
  const offer = input.installmentTotalCents;
  const be = inst.breakEvenTotalCents;
  const cash = input.cashPriceCents;
  const span = Math.max(offer, be) - cash;
  const markerPct = span > 0 ? Math.min(Math.max(((be - cash) / span) * 100, 0), 100) : 100;

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold">Ponto de equilíbrio</h3>
      <p className="mt-0.5 text-xs text-(--color-text-secondary)">Até que valor parcelar ainda compensa</p>
      <p className="mt-4 text-2xl font-bold tracking-tight tabular-nums">{formatCurrencyBRL(be)}</p>
      <p className="mt-0.5 text-xs tabular-nums text-(--color-text-secondary)">
        {simulation.installments}× de {formatCurrencyBRL(inst.breakEvenInstallmentCents)} · juros máx. {pct(inst.breakEvenMonthlyRate)} a.m.
      </p>
      <div className="relative mt-4 h-2 rounded-full bg-black/[0.06]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-(--chart-3)" style={{ width: `${markerPct}%` }} />
        <div className="absolute -top-1 h-4 w-[3px] rounded bg-(--color-text-primary)" style={{ left: `calc(${markerPct}% - 1px)` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-(--color-text-tertiary)">
        <span>{formatCurrencyBRL(cash)} (à vista)</span>
        <span>{formatCurrencyBRL(offer)} (oferta)</span>
      </div>
    </Card>
  );
}

function SensitivityCard({ input }: { input: CashVsInstallmentInput }) {
  const rows = [-2.5, 0, 2.5].map((delta) => {
    const cdi = input.cdiAnnualPercent + delta;
    const inst = compareCashVsInstallments({ ...input, cdiAnnualPercent: cdi }).installment;
    return { cdi, delta, extra: inst?.extraYieldCents ?? 0, advantage: inst?.advantageCashCents ?? 0 };
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
            <th className="border-b border-(--color-border) py-2 text-right">Rendimento extra de parcelar</th>
            <th className="border-b border-(--color-border) py-2 text-right">À vista deixa a mais</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.delta} className={r.delta === 0 ? "bg-(--color-primary-soft)/50 font-bold" : ""}>
              <td className="border-b border-(--color-border)/60 py-2 pl-1.5 text-left">{r.cdi.toFixed(2).replace(".", ",")}%</td>
              <td className="border-b border-(--color-border)/60 py-2 text-right">{formatCurrencyBRL(r.extra)}</td>
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
