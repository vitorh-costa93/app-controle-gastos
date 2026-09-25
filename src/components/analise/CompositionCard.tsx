import { Card } from "@/components/ui/Card";
import { MonthCommitment } from "@/lib/domain/insights";
import { formatCurrencyBRL } from "@/lib/utils/format";

const pct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

/** Quanto da renda do mês já estava travada em fixos e parcelas antes dos gastos variáveis. */
export function CompositionCard({ commitment }: { commitment: MonthCommitment }) {
  const { incomeCents, fixedCents, installmentCents, variableCents } = commitment;
  const leftoverCents = incomeCents - fixedCents - installmentCents - variableCents;
  const base = Math.max(incomeCents, fixedCents + installmentCents + variableCents);

  const rows = [
    { label: "Gastos fixos", cents: fixedCents, color: "var(--chart-1)" },
    { label: "Parcelas em andamento", cents: installmentCents, color: "#7fb0ec" },
    { label: "Gastos variáveis", cents: variableCents, color: "var(--chart-2)" },
    { label: "Folga (sobrou)", cents: Math.max(leftoverCents, 0), color: "var(--color-primary-soft)" },
  ];

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Fixo × variável</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        Quanto da renda do mês já estava travado antes de você gastar.
      </p>
      <div className="mb-4 flex h-7 overflow-hidden rounded-lg bg-(--color-surface-secondary)">
        {rows.map((r) => (
          <div key={r.label} style={{ width: `${pct(r.cents, base)}%`, backgroundColor: r.color }} />
        ))}
      </div>
      <ul>
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between border-t border-(--color-border) py-2.5 text-sm first:border-t-0"
          >
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: r.color }} />
              {r.label}
            </span>
            <span className="tabular-nums">
              <span className="font-medium">{formatCurrencyBRL(r.cents)}</span>
              <span className="ml-2 text-(--color-text-tertiary)">
                {pct(r.cents, incomeCents).toFixed(1).replace(".", ",")}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
