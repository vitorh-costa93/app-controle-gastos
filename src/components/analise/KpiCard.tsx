import { Card } from "@/components/ui/Card";
import { formatCurrencyBRL, formatCompactPercent } from "@/lib/utils/format";
import { percentChange } from "@/lib/domain/finance";
import { cn } from "@/lib/utils/cn";

export function KpiCard({
  label,
  currentCents,
  previousCents,
  tone,
}: {
  label: string;
  currentCents: number;
  previousCents: number | null;
  tone: "positive" | "negative" | "info";
}) {
  const change = previousCents !== null ? percentChange(currentCents, previousCents) : null;

  const toneClass = {
    positive: "text-(--color-positive)",
    negative: "text-(--color-negative)",
    info: "text-(--color-primary)",
  }[tone];

  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-(--color-text-secondary)">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", toneClass)}>
        {formatCurrencyBRL(currentCents)}
      </p>
      {change !== null && (
        <p
          className={cn(
            "mt-1 text-xs font-medium tabular-nums",
            change >= 0 ? "text-(--color-positive)" : "text-(--color-negative)"
          )}
        >
          {change >= 0 ? "↑" : "↓"} {formatCompactPercent(Math.abs(change))} vs. mês anterior
        </p>
      )}
    </Card>
  );
}
