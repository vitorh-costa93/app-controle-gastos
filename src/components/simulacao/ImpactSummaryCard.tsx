import { SimulationImpactSummary } from "@/lib/domain/simulation";
import { Card } from "@/components/ui/Card";
import { formatCurrencyBRL, formatMonthLabel } from "@/lib/utils/format";

export function ImpactSummaryCard({ impact }: { impact: SimulationImpactSummary }) {
  const items: { label: string; value: string }[] = [
    { label: "Valor total", value: formatCurrencyBRL(impact.totalAmountCents) },
    { label: "Valor da parcela", value: formatCurrencyBRL(impact.installmentAmountCents) },
    { label: "Parcelas", value: `${impact.installments}x` },
    { label: "Início", value: formatMonthLabel(impact.startMonth) },
    { label: "Término", value: formatMonthLabel(impact.endMonth) },
    { label: "Impacto médio mensal", value: formatCurrencyBRL(impact.averageMonthlyImpactCents) },
    {
      label: "Menor saldo no período",
      value: impact.lowestBalanceMonth ? formatCurrencyBRL(impact.lowestBalanceMonth.accumulatedCents) : "—",
    },
    {
      label: "Diferença acumulada (final)",
      value: formatCurrencyBRL(impact.finalAccumulatedDifferenceCents),
    },
    {
      label: "Mês de maior impacto",
      value: impact.mostImpactedMonth ? formatMonthLabel(impact.mostImpactedMonth.referenceMonth) : "—",
    },
  ];

  return (
    <Card className="p-5">
      <h3 className="mb-4 text-[15px] font-semibold">Resumo do impacto</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xs text-(--color-text-tertiary)">{item.label}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
