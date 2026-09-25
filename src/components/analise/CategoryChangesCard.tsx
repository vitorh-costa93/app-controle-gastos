import { Card } from "@/components/ui/Card";
import { CategoryChange } from "@/lib/domain/insights";
import { Category } from "@/types/db";
import { formatCurrencyBRL } from "@/lib/utils/format";

function Column({
  title,
  items,
  tone,
  categoriesById,
}: {
  title: string;
  items: CategoryChange[];
  tone: "up" | "down";
  categoriesById: Map<string, string>;
}) {
  const max = Math.max(...items.map((i) => Math.abs(i.deltaCents)), 1);
  const color = tone === "up" ? "var(--color-negative)" : "var(--color-positive)";
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold tracking-wide text-(--color-text-secondary)">{title}</p>
      {items.length === 0 && <p className="text-xs text-(--color-text-tertiary)">Nenhuma variação relevante.</p>}
      {items.map((c) => (
        <div key={c.categoryId ?? "none"} className="py-2">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span>{c.categoryId ? categoriesById.get(c.categoryId) ?? "Outros" : "Sem categoria"}</span>
            <span className="font-semibold tabular-nums" style={{ color }}>
              {c.deltaCents > 0 ? "+" : "−"}
              {formatCurrencyBRL(Math.abs(c.deltaCents))}
              <span className="ml-1 font-normal text-(--color-text-tertiary)">
                ·{" "}
                {c.deltaPercent === null
                  ? "novo"
                  : `${c.deltaPercent > 0 ? "+" : "−"}${Math.abs(c.deltaPercent).toFixed(0)}%`}
              </span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-(--color-surface-secondary)">
            <div
              className="h-full rounded-full"
              style={{ width: `${(Math.abs(c.deltaCents) / max) * 100}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Categorias que mais subiram e mais caíram contra a média dos 3 meses anteriores. */
export function CategoryChangesCard({ changes, categories }: { changes: CategoryChange[]; categories: Category[] }) {
  const categoriesById = new Map(categories.map((c) => [c.id, c.name]));
  const ups = changes.filter((c) => c.deltaCents > 0).slice(0, 3);
  const downs = changes.filter((c) => c.deltaCents < 0).slice(-3).reverse();

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">O que mudou</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        Categorias que mais subiram ou caíram em relação à média dos 3 meses anteriores.
      </p>
      {changes.length === 0 ? (
        <p className="py-6 text-center text-xs text-(--color-text-tertiary)">
          Ainda não há meses anteriores suficientes para comparar.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Column title="SUBIRAM" items={ups} tone="up" categoriesById={categoriesById} />
          <Column title="CAÍRAM" items={downs} tone="down" categoriesById={categoriesById} />
        </div>
      )}
    </Card>
  );
}
