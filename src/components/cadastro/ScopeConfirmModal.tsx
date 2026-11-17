"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { EditScope } from "@/lib/data/transactions";

const SCOPE_OPTIONS: { value: EditScope; label: string; description: string }[] = [
  {
    value: "month",
    label: "Esse mês",
    description: "Aplica a mudança somente no mês atual deste lançamento.",
  },
  {
    value: "all",
    label: "Todos os meses",
    description: "Aplica a mudança em todos os meses (anteriores, atual e próximos).",
  },
  {
    value: "following",
    label: "Esse mês e os próximos",
    description: "Preserva os meses anteriores e aplica deste mês em diante.",
  },
];

export function ScopeConfirmModal({
  open,
  mode,
  allowMultiMonth,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  mode: "save" | "delete";
  allowMultiMonth: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (scope: EditScope) => void;
}) {
  const [scope, setScope] = useState<EditScope>("month");

  if (!open) return null;

  const effectiveScope: EditScope = allowMultiMonth ? scope : "month";
  const isDelete = mode === "delete";

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onClose(); }}
      title={isDelete ? "Confirmar exclusão" : "Confirmar alteração"}
      size="sm"
    >
      <p className="mb-3 text-sm text-(--color-text-secondary)">
        {isDelete
          ? "Para quais meses esta exclusão vale?"
          : "Para quais meses esta alteração vale?"}
      </p>

      <div className="space-y-2">
        {SCOPE_OPTIONS.map((option) => {
          const disabled = busy || (!allowMultiMonth && option.value !== "month");
          const checked = effectiveScope === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-2.5 rounded-(--radius-md) border p-3 text-sm transition-colors ${
                checked
                  ? "border-(--color-primary) bg-(--color-primary-soft)/40"
                  : "border-(--color-border) bg-(--color-surface)"
              } ${disabled ? "cursor-not-allowed opacity-55" : ""}`}
            >
              <input
                type="radio"
                name="scope-confirm"
                className="mt-0.5 accent-(--color-primary)"
                checked={checked}
                disabled={disabled}
                onChange={() => setScope(option.value)}
              />
              <div>
                <div className="font-medium text-(--color-text-primary)">{option.label}</div>
                <div className="text-xs text-(--color-text-secondary)">{option.description}</div>
              </div>
            </label>
          );
        })}
      </div>

      {!allowMultiMonth && (
        <p className="mt-2.5 text-xs text-(--color-text-tertiary)">
          Lançamento pontual: existe apenas neste mês.
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
          Voltar
        </Button>
        <Button
          type="button"
          variant={isDelete ? "danger" : "primary"}
          disabled={busy}
          onClick={() => onConfirm(effectiveScope)}
        >
          {busy ? "Processando..." : isDelete ? "Confirmar exclusão" : "Confirmar e salvar"}
        </Button>
      </div>
    </Modal>
  );
}
