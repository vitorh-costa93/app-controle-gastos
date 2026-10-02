"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Trash2 } from "lucide-react";
import { Person, Category } from "@/types/db";
import { Transaction } from "@/types/domain";
import { DuplicatePair } from "@/lib/domain/duplicates";
import { approveDuplicate, approveDuplicateKeys, rejectDuplicate, rejectDuplicateGroup } from "@/lib/data/duplicates";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils/format";

export function DuplicateReviewList({
  pairs: initialPairs,
  people,
  categories,
}: {
  pairs: DuplicatePair[];
  people: Person[];
  categories: Category[];
}) {
  const [pairs, setPairs] = useState(initialPairs);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const peopleById = new Map(people.map((p) => [p.id, p.name]));
  const categoriesById = new Map(categories.map((c) => [c.id, c.name]));

  function resolve(pair: DuplicatePair, action: "approve" | "reject") {
    const group = pair.group;
    const confirmText = group
      ? `Excluir a compra parcelada repetida "${pair.suspect.description ?? "sem descrição"}" (todas as parcelas do grupo repetido)?`
      : `Excluir o lançamento repetido "${pair.suspect.description ?? "sem descrição"}"?`;
    if (action === "reject" && !window.confirm(confirmText)) {
      return;
    }
    setError(null);
    setPendingKey(pair.key);
    startTransition(async () => {
      const result = group
        ? action === "approve"
          ? await approveDuplicateKeys(group.keys)
          : await rejectDuplicateGroup(group.suspectGroupId)
        : action === "approve"
          ? await approveDuplicate(pair.original.id, pair.suspect.id)
          : await rejectDuplicate(pair.suspect.id);
      setPendingKey(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Recusar tira o suspeito de qualquer outro par em que ele apareça.
      setPairs((prev) =>
        prev.filter((p) => {
          if (group) {
            if (action === "approve") return p.key !== pair.key && !group.keys.includes(p.key);
            return p.suspect.installmentGroupId !== group.suspectGroupId && p.original.installmentGroupId !== group.suspectGroupId;
          }
          return action === "approve" ? p.key !== pair.key : p.suspect.id !== pair.suspect.id && p.original.id !== pair.suspect.id;
        })
      );
    });
  }

  if (pairs.length === 0) {
    return <EmptyState title="Nenhum lançamento parecendo duplicado por aqui." />;
  }

  const renderTransaction = (label: string, t: Transaction) => (
    <div className="min-w-0 flex-1 rounded-(--radius-md) bg-(--color-surface-secondary) p-3">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-(--color-text-tertiary)">{label}</p>
      <p className="truncate text-sm font-medium">{t.description ?? "Sem descrição"}</p>
      <p className="text-xs text-(--color-text-secondary)">
        {formatDateBR(t.registrationDate)} · {peopleById.get(t.personId) ?? "—"}
        {t.categoryId ? ` · ${categoriesById.get(t.categoryId) ?? "—"}` : ""}
        {t.installmentTotal > 1 ? ` · parcela ${t.installmentCurrent}/${t.installmentTotal}` : ""}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{formatCurrencyBRL(t.amountCents)}</p>
      <p className="mt-1 text-xs text-(--color-text-tertiary)">
        Cadastrado em {formatDateBR(t.createdAt.slice(0, 10))}
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-(--color-negative)">{error}</p>}
      {pairs.map((pair) => (
        <Card key={pair.key} className="p-4">
          <p className="mb-3 flex items-center gap-2 text-sm text-(--color-warning)">
            <AlertTriangle size={16} />
            {pair.reason}
          </p>
          {pair.group && (
            <p className="-mt-2 mb-3 text-xs text-(--color-text-tertiary)">
              Revise só esta primeira parcela: aprovar ou recusar vale para as {pair.group.installments} parcelas da compra.
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            {renderTransaction("Original", pair.original)}
            {renderTransaction("Possível duplicado", pair.suspect)}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pendingKey === pair.key}
              onClick={() => resolve(pair, "approve")}
            >
              <Check size={14} /> Aprovar (não é duplicado)
            </Button>
            <Button variant="danger" size="sm" disabled={pendingKey === pair.key} onClick={() => resolve(pair, "reject")}>
              <Trash2 size={14} /> Recusar (excluir repetido)
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
