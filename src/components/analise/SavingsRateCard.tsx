import { Card } from "@/components/ui/Card";
import { MonthSummary } from "@/types/domain";
import { cn } from "@/lib/utils/cn";

function rate(summary: MonthSummary | null): number | null {
  if (!summary || summary.incomeCents <= 0) return null;
  return (summary.leftoverCents / summary.incomeCents) * 100;
}

const fmt = (value: number) => value.toFixed(1).replace(".", ",");

/** Taxa de poupança = sobra ÷ entradas, comparada ao mês anterior (em pontos percentuais) e à média dos meses com renda. */
export function SavingsRateCard({
  current,
  previous,
  history,
}: {
  current: MonthSummary;
  previous: MonthSummary | null;
  history: MonthSummary[];
}) {
  const currentRate = rate(current);
  const previousRate = rate(previous);
  const rates = history.map(rate).filter((r): r is number => r !== null);
  const averageRate = rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : null;
  const delta = currentRate !== null && previousRate !== null ? currentRate - previousRate : null;

  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-(--color-text-secondary)">Taxa de poupança</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{currentRate !== null ? `${fmt(currentRate)}%` : "—"}</p>
      <p className="mt-1 text-xs tabular-nums text-(--color-text-tertiary)">
        {delta !== null && (
          <span className={cn("font-medium", delta >= 0 ? "text-(--color-positive)" : "text-(--color-negative)")}>
            {delta >= 0 ? "↑" : "↓"} {fmt(Math.abs(delta))} p.p.{" "}
          </span>
        )}
        {averageRate !== null && `· média 12 meses: ${fmt(averageRate)}%`}
      </p>
    </Card>
  );
}
