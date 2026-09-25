import { Card } from "@/components/ui/Card";
import { Person } from "@/types/db";
import { formatCurrencyBRL } from "@/lib/utils/format";

/** Quem entra, quem gasta e quanto cada pessoa poupa no mês. */
export function PersonComparisonCard({
  summaries,
  people,
}: {
  summaries: { personId: string; incomeCents: number; expenseCents: number }[];
  people: Person[];
}) {
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const cards = summaries
    .flatMap((s) => {
      const person = peopleById.get(s.personId);
      return person ? [{ ...s, person, leftover: s.incomeCents - s.expenseCents }] : [];
    })
    .sort((a, b) => a.person.name.localeCompare(b.person.name, "pt-BR"));

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Por pessoa</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">Quem entra, quem gasta e quanto cada um poupa.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => {
          const rate = c.incomeCents > 0 ? Math.max((c.leftover / c.incomeCents) * 100, 0) : 0;
          const color = c.person.color ?? "#8e8e93";
          return (
            <div key={c.personId} className="rounded-(--radius-lg) border border-(--color-border) p-3.5">
              <div className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {c.person.name}
              </div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-(--color-text-secondary)">Entrou</span>
                <b className="tabular-nums text-(--color-positive)">{formatCurrencyBRL(c.incomeCents)}</b>
              </div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-(--color-text-secondary)">Gastou</span>
                <b className="tabular-nums">{formatCurrencyBRL(c.expenseCents)}</b>
              </div>
              <div className="mb-2.5 flex justify-between text-xs">
                <span className="text-(--color-text-secondary)">Sobrou</span>
                <b className="tabular-nums text-(--color-primary)">{formatCurrencyBRL(c.leftover)}</b>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-(--color-surface-secondary)">
                <div className="h-full rounded-full" style={{ width: `${Math.min(rate, 100)}%`, backgroundColor: color }} />
              </div>
              <p className="mt-1 text-[11px] text-(--color-text-tertiary)">
                {c.incomeCents > 0 ? `Poupa ${rate.toFixed(1).replace(".", ",")}% da renda` : "Sem entradas no mês"}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
