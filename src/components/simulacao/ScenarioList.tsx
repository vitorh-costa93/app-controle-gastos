"use client";

import { useState, useTransition } from "react";
import { Luggage, MoreVertical, Pencil, Trash2, Undo2 } from "lucide-react";
import { Simulation } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function ScenarioList({
  simulations,
  archived,
  primaryId,
  onSelectPrimary,
  includeOthers,
  onIncludeOthersChange,
  selectedOtherIds,
  onToggleOther,
  onEdit,
  onDelete,
  onRestore,
  verdictFor,
}: {
  simulations: Simulation[];
  archived: Simulation[];
  primaryId: string | null;
  onSelectPrimary: (id: string) => void;
  includeOthers: boolean;
  onIncludeOthersChange: (value: boolean) => void;
  selectedOtherIds: string[];
  onToggleOther: (id: string) => void;
  onEdit: (sim: Simulation) => void;
  onDelete: (sim: Simulation) => Promise<void>;
  onRestore: (sim: Simulation) => Promise<void>;
  verdictFor: (sim: Simulation) => { label: string; tone: "cash" | "installment" | "neutral" } | null;
}) {
  const [, startTransition] = useTransition();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold">Cenários</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-(--color-text-secondary)">Incluir outras simulações?</span>
          <Select
            className="h-8 w-20"
            value={includeOthers ? "sim" : "nao"}
            onChange={(e) => onIncludeOthersChange(e.target.value === "sim")}
          >
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </Select>
        </div>
      </div>

      <ul className="space-y-2">
        {simulations.map((sim) => {
          const isPrimary = sim.id === primaryId;
          const isOther = includeOthers && selectedOtherIds.includes(sim.id);
          return (
            <li key={sim.id}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-(--radius-lg) border p-3 transition-colors",
                  isPrimary
                    ? "border-(--color-primary) bg-(--color-primary-soft)/50"
                    : "border-(--color-border) hover:bg-black/[0.015]"
                )}
              >
                {includeOthers && !isPrimary && (
                  <input
                    type="checkbox"
                    checked={isOther}
                    onChange={() => onToggleOther(sim.id)}
                    className="h-4 w-4 accent-(--color-primary)"
                  />
                )}
                <button className="flex flex-1 items-center gap-3 text-left" onClick={() => onSelectPrimary(sim.id)}>
                  {sim.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sim.imageUrl}
                      alt=""
                      className="h-12 w-16 shrink-0 rounded-(--radius-md) object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary-soft) text-(--color-primary)">
                      <Luggage size={16} />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">{sim.description}</p>
                    <p className="text-xs text-(--color-text-tertiary)">
                      {sim.installments}x · {formatCurrencyBRL(sim.installmentAmountCents)} · Criado em{" "}
                      {formatDateBR(sim.createdAt.slice(0, 10))}
                      {isOther && " · Com outras simulações"}
                    </p>
                  </div>
                </button>
                {(() => {
                  const verdict = verdictFor(sim);
                  return verdict ? (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                        verdict.tone === "cash" && "bg-(--color-negative-soft) text-(--color-negative)",
                        verdict.tone === "installment" && "bg-(--color-primary-soft) text-(--color-primary)",
                        verdict.tone === "neutral" && "bg-black/5 text-(--color-text-secondary)"
                      )}
                    >
                      {verdict.label}
                    </span>
                  ) : null;
                })()}
                <div className="relative">
                  <button
                    className="rounded-full p-1.5 text-(--color-text-tertiary) hover:bg-black/5"
                    aria-label="Mais opções"
                    aria-expanded={menuId === sim.id}
                    onClick={() => setMenuId((cur) => (cur === sim.id ? null : sim.id))}
                  >
                    <MoreVertical size={16} />
                  </button>
                  {menuId === sim.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                      <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) py-1 text-sm shadow-(--shadow-md)">
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-black/5"
                          onClick={() => {
                            setMenuId(null);
                            onEdit(sim);
                          }}
                        >
                          <Pencil size={14} /> Editar
                        </button>
                        <button
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-(--color-negative) hover:bg-black/5"
                          onClick={() => {
                            setMenuId(null);
                            if (window.confirm(`Excluir a simulação "${sim.description}"? Você pode restaurá-la depois.`)) {
                              startTransition(async () => {
                                await onDelete(sim);
                              });
                            }
                          }}
                        >
                          <Trash2 size={14} /> Excluir
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {archived.length > 0 && (
        <div className="mt-4 border-t border-(--color-border) pt-3">
          <button
            className="text-xs font-medium text-(--color-text-secondary) hover:text-(--color-text-primary)"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Ocultar" : "Ver"} excluídas ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-2 space-y-1.5">
              {archived.map((sim) => (
                <li key={sim.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-(--color-text-secondary)">
                    {sim.description} · {sim.installments}x · {formatCurrencyBRL(sim.installmentAmountCents)}
                  </span>
                  <button
                    className="flex shrink-0 items-center gap-1 rounded-(--radius-md) px-2 py-1 text-xs font-medium text-(--color-primary) hover:bg-black/5"
                    onClick={() =>
                      startTransition(async () => {
                        await onRestore(sim);
                      })
                    }
                  >
                    <Undo2 size={12} /> Restaurar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
