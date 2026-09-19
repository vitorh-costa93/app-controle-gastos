"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Transaction } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { InputMethodCards, InputMethod } from "./InputMethodCards";
import { FiltersBar } from "./FiltersBar";
import { TransactionTable } from "./TransactionTable";
import { TransactionEditor } from "./TransactionEditor";
import { CaptureFlow } from "@/components/ingest/CaptureFlow";

export function CadastroPageClient({
  transactions,
  total,
  page,
  pageSize,
  people,
  categories,
  types,
}: {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  people: Person[];
  categories: Category[];
  types: TransactionType[];
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [captureMethod, setCaptureMethod] = useState<InputMethod | null>(null);

  return (
    <div>
      <PageHeader
        title="Cadastro"
        subtitle="Registre suas entradas e saídas de forma rápida e prática. Você pode usar áudio, foto, texto ou PDF."
        action={
          <Button
            onClick={() => {
              setEditingTransaction(null);
              setEditorOpen(true);
            }}
          >
            <Plus size={16} /> Nova entrada
          </Button>
        }
      />

      <InputMethodCards onSelect={setCaptureMethod} />

      <FiltersBar people={people} types={types} />

      {transactions.length === 0 ? (
        <EmptyState
          title="Você ainda não possui lançamentos neste mês."
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditingTransaction(null);
                setEditorOpen(true);
              }}
            >
              <Plus size={14} /> Adicionar lançamento
            </Button>
          }
        />
      ) : (
        <>
          <TransactionTable
            transactions={transactions}
            people={people}
            categories={categories}
            types={types}
            onEdit={(t) => {
              setEditingTransaction(t);
              setEditorOpen(true);
            }}
          />
          <Pagination page={page} pageSize={pageSize} total={total} />
        </>
      )}

      <TransactionEditor
        key={editingTransaction?.id ?? "new"}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        people={people}
        categories={categories}
        types={types}
        transaction={editingTransaction}
      />

      {captureMethod && (
        <CaptureFlow
          method={captureMethod}
          people={people}
          categories={categories}
          types={types}
          onClose={() => setCaptureMethod(null)}
        />
      )}
    </div>
  );
}
