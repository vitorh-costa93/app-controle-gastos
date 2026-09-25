import { Card } from "@/components/ui/Card";
import { MonthlyOccurrence } from "@/types/domain";
import { Person } from "@/types/db";
import { formatCurrencyBRL } from "@/lib/utils/format";

/** Os maiores gastos individuais do mês — o que pesou de fato, sem agrupar por categoria. */
export function TopExpensesCard({ occurrences, people }: { occurrences: MonthlyOccurrence[]; people: Person[] }) {
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const top = occurrences
    .filter((o) => o.direction === "expense" && o.considered)
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 5);

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Maiores lançamentos do mês</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        Os 5 maiores gastos individuais, sem agrupar por categoria.
      </p>
      <ul>
        {top.map((o) => (
          <li
            key={o.id}
            className="flex items-center justify-between gap-3 border-t border-(--color-border) py-2.5 text-sm first:border-t-0"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: peopleById.get(o.personId)?.color ?? "#8e8e93" }}
              />
              <span className="truncate">{o.description ?? "Sem descrição"}</span>
              <span className="shrink-0 rounded-full bg-(--color-surface-secondary) px-2 py-0.5 text-[11px] font-semibold text-(--color-text-secondary)">
                {o.installmentTotal > 1
                  ? `${o.installmentCurrent}/${o.installmentTotal}`
                  : o.fixedVariable === "fixed"
                    ? "Fixo"
                    : "Variável"}
              </span>
            </span>
            <b className="shrink-0 tabular-nums">{formatCurrencyBRL(o.amountCents)}</b>
          </li>
        ))}
        {top.length === 0 && <li className="py-4 text-center text-xs text-(--color-text-tertiary)">Sem saídas no mês.</li>}
      </ul>
    </Card>
  );
}
