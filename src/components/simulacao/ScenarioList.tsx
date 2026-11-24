"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  Luggage,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Simulation } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatCurrencyBRL } from "@/lib/utils/format";
import type { PurchaseFeasibility } from "@/lib/utils/best-purchase-date";
import { cn } from "@/lib/utils/cn";

export function ScenarioList({
  simulations,
  archived,
  selectedIds,
  onToggle,
  onOpen,
  onEdit,
  onDelete,
  onRestore,
  onRefreshTrack,
  onAddNew,
  verdictFor,
  feasibilityFor,
}: {
  simulations: Simulation[];
  archived: Simulation[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onOpen?: (id: string) => void;
  onEdit: (sim: Simulation) => void;
  onDelete: (sim: Simulation) => Promise<void>;
  onRestore: (sim: Simulation) => Promise<void>;
  onRefreshTrack?: (sim: Simulation) => Promise<void>;
  onAddNew?: () => void;
  layout?: "list" | "grid";
  verdictFor: (sim: Simulation) => { label: string; tone: "cash" | "installment" | "neutral" } | null;
  feasibilityFor?: (sim: Simulation) => PurchaseFeasibility | null;
}) {
  const [, startTransition] = useTransition();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDropdownOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [dropdownOpen]);

  const selectedSimulations = simulations.filter((s) => selectedIds.includes(s.id));

  const summaryLabel =
    selectedSimulations.length === 0
      ? "Selecionar cenários..."
      : selectedSimulations.length <= 2
        ? `${selectedSimulations.map((s) => s.description).join(", ")} (${selectedSimulations.length})`
        : `${selectedSimulations[0].description} + ${selectedSimulations.length - 1} itens (${selectedSimulations.length})`;

  return (
    <Card className="space-y-3 p-4">
      {/* Barra superior compacta: Multi-Dropdown + Nova simulação */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div ref={dropdownRef} className="relative min-w-0 flex-1 sm:flex-initial">
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            aria-expanded={dropdownOpen}
            className="inline-flex h-9 w-full items-center justify-between gap-2 rounded-(--radius-md) border border-(--color-primary)/35 bg-(--color-primary-soft)/55 px-3 text-xs font-semibold text-(--color-primary) hover:bg-(--color-primary-soft) sm:w-auto sm:min-w-[280px]"
          >
            <span className="truncate">
              Cenários: <b className="text-(--color-text-primary)">{summaryLabel}</b>
            </span>
            <ChevronDown size={14} className={cn("shrink-0 transition-transform", dropdownOpen && "rotate-180")} />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 z-30 mt-1.5 w-[min(92vw,420px)] rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-2 shadow-(--shadow-lg)">
              <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-(--color-text-tertiary)">
                <span>Marque os cenários para comparar</span>
                <span>{simulations.length} ativos</span>
              </div>

              <ul className="max-h-72 space-y-1 overflow-y-auto py-1">
                {simulations.map((sim) => {
                  const isSelected = selectedIds.includes(sim.id);
                  return (
                    <li
                      key={sim.id}
                      className={cn(
                        "flex items-center gap-2 rounded-(--radius-md) px-2 py-1.5 transition-colors",
                        isSelected ? "bg-(--color-primary-soft)/45" : "hover:bg-black/[0.03]"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onToggle(sim.id)}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                            isSelected
                              ? "border-(--color-primary) bg-(--color-primary) text-white"
                              : "border-(--color-border) bg-(--color-surface)"
                          )}
                        >
                          {isSelected && <Check size={11} strokeWidth={3} />}
                        </span>
                        {sim.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={sim.imageUrl}
                            alt=""
                            className="h-9 w-10 shrink-0 rounded-(--radius-sm) object-cover"
                          />
                        ) : (
                          <span className="flex h-9 w-10 shrink-0 items-center justify-center rounded-(--radius-sm) bg-(--color-primary-soft) text-(--color-primary)">
                            {sim.category === "travel" ? <Luggage size={14} /> : <ShoppingBag size={14} />}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-(--color-text-primary)">
                            {sim.description}
                          </span>
                          <span className="block text-[11px] tabular-nums text-(--color-text-tertiary)">
                            {sim.cashPriceCents ? `À vista ${formatCurrencyBRL(sim.cashPriceCents)} · ` : ""}
                            {sim.installments}× de {formatCurrencyBRL(sim.installmentAmountCents)}
                          </span>
                        </span>
                      </button>

                      <div className="flex shrink-0 items-center gap-0.5">
                        {onRefreshTrack && (
                          <button
                            type="button"
                            title="Rastrear preço"
                            onClick={() => {
                              setDropdownOpen(false);
                              startTransition(async () => {
                                await onRefreshTrack(sim);
                              });
                            }}
                            className="rounded p-1.5 text-(--color-primary) hover:bg-black/5"
                          >
                            <RefreshCw size={12} />
                          </button>
                        )}
                        <button
                          type="button"
                          title="Editar"
                          onClick={() => {
                            setDropdownOpen(false);
                            onEdit(sim);
                          }}
                          className="rounded p-1.5 text-(--color-text-secondary) hover:bg-black/5"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          title="Excluir"
                          onClick={() => {
                            setDropdownOpen(false);
                            if (window.confirm(`Excluir a simulação "${sim.description}"? Você pode restaurá-la depois.`)) {
                              startTransition(async () => {
                                await onDelete(sim);
                              });
                            }
                          }}
                          className="rounded p-1.5 text-(--color-negative) hover:bg-black/5"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {archived.length > 0 && (
                <div className="mt-1 border-t border-(--color-border) pt-2 px-1">
                  <button
                    type="button"
                    className="text-[11px] font-medium text-(--color-text-secondary) hover:text-(--color-text-primary)"
                    onClick={() => setShowArchived((v) => !v)}
                  >
                    {showArchived ? "Ocultar" : "Ver"} excluídas ({archived.length})
                  </button>
                  {showArchived && (
                    <ul className="mt-1.5 max-h-32 space-y-1 overflow-y-auto">
                      {archived.map((sim) => (
                        <li key={sim.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate text-(--color-text-secondary)">
                            {sim.description}
                          </span>
                          <button
                            type="button"
                            className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-(--color-primary) hover:bg-black/5"
                            onClick={() =>
                              startTransition(async () => {
                                await onRestore(sim);
                              })
                            }
                          >
                            <Undo2 size={11} /> Restaurar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {onAddNew && (
          <Button type="button" size="sm" onClick={onAddNew} className="h-9 gap-1.5 px-3 text-xs">
            <Plus size={14} /> Nova simulação
          </Button>
        )}
      </div>

      {/* Faixa apenas com os cenários selecionados e suas imagens geradas por IA */}
      {selectedSimulations.length > 0 ? (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {selectedSimulations.map((sim) => {
            const verdict = verdictFor(sim);
            const feasibility = feasibilityFor?.(sim) ?? null;
            return (
              <div
                key={sim.id}
                className="flex items-start gap-3 rounded-(--radius-lg) border border-(--color-primary)/35 bg-(--color-primary-soft)/25 p-2.5"
              >
                <button
                  type="button"
                  onClick={() => (onOpen ?? onToggle)(sim.id)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                >
                  {sim.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sim.imageUrl}
                      alt={sim.description}
                      className="h-14 w-16 shrink-0 rounded-(--radius-md) border border-(--color-border) object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-16 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary-soft) text-(--color-primary)">
                      {sim.category === "travel" ? <Luggage size={18} /> : <ShoppingBag size={18} />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-(--color-text-primary)">{sim.description}</p>
                      {sim.bestOfferMeta && (
                        <span
                          title={`Menor preço auditado em ${sim.bestOfferMeta.storeOrProvider}`}
                          className="inline-flex items-center gap-0.5 rounded-full bg-(--color-positive-soft) px-1.5 py-0.5 text-[10px] font-semibold text-(--color-positive)"
                        >
                          <ShieldCheck size={9} /> {sim.bestOfferMeta.storeOrProvider.split(" ")[0]}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] tabular-nums text-(--color-text-secondary)">
                      {sim.cashPriceCents ? `À vista ${formatCurrencyBRL(sim.cashPriceCents)} · ` : ""}
                      {sim.installments}× de {formatCurrencyBRL(sim.installmentAmountCents)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {feasibility && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            feasibility.tone === "positive" && "bg-(--color-positive-soft) text-(--color-positive)",
                            feasibility.tone === "info" && "bg-(--color-primary-soft) text-(--color-primary)",
                            feasibility.tone === "warning" && "bg-(--color-warning-soft) text-(--color-warning)"
                          )}
                        >
                          {feasibility.label}
                        </span>
                      )}
                      {verdict && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            verdict.tone === "cash" && "bg-(--color-negative-soft) text-(--color-negative)",
                            verdict.tone === "installment" && "bg-(--color-primary-soft) text-(--color-primary)",
                            verdict.tone === "neutral" && "bg-black/5 text-(--color-text-secondary)"
                          )}
                        >
                          {verdict.label}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => onToggle(sim.id)}
                    title="Remover da simulação"
                    aria-label={`Remover ${sim.description} da simulação`}
                    className="rounded-full p-1 text-(--color-text-tertiary) hover:bg-black/5 hover:text-(--color-text-primary)"
                  >
                    <X size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(sim)}
                    title="Editar cenário"
                    aria-label={`Editar ${sim.description}`}
                    className="rounded-full p-1 text-(--color-text-tertiary) hover:bg-black/5 hover:text-(--color-text-primary)"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-(--color-text-tertiary)">
          Nenhum cenário selecionado. Abra o menu <b>Cenários</b> acima para escolher o que deseja simular.
        </p>
      )}
    </Card>
  );
}
