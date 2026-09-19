"use client";

import { useTransition } from "react";
import { Luggage, MoreVertical } from "lucide-react";
import { Simulation } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils/format";
import { deleteSimulation } from "@/lib/data/simulations";
import { cn } from "@/lib/utils/cn";

export function ScenarioList({
  simulations,
  primaryId,
  onSelectPrimary,
  includeOthers,
  onIncludeOthersChange,
  selectedOtherIds,
  onToggleOther,
}: {
  simulations: Simulation[];
  primaryId: string | null;
  onSelectPrimary: (id: string) => void;
  includeOthers: boolean;
  onIncludeOthersChange: (value: boolean) => void;
  selectedOtherIds: string[];
  onToggleOther: (id: string) => void;
}) {
  const [, startTransition] = useTransition();

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
                  <div className="flex h-9 w-9 items-center justify-center rounded-(--radius-md) bg-(--color-primary-soft) text-(--color-primary)">
                    <Luggage size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{sim.description}</p>
                    <p className="text-xs text-(--color-text-tertiary)">
                      {sim.installments}x · {formatCurrencyBRL(sim.installmentAmountCents)} · Criado em{" "}
                      {formatDateBR(sim.createdAt.slice(0, 10))}
                      {isOther && " · Com outras simulações"}
                    </p>
                  </div>
                </button>
                <button
                  className="rounded-full p-1.5 text-(--color-text-tertiary) hover:bg-black/5"
                  aria-label="Mais opções"
                  onClick={() =>
                    startTransition(async () => {
                      await deleteSimulation(sim.id);
                    })
                  }
                >
                  <MoreVertical size={16} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
