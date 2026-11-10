"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { MonthRow, transactionMonthRow } from "@/lib/domain/month-rows";
import { CadastroRecordsTable } from "./CadastroRecordsTable";
import { InstallmentEditModal } from "./InstallmentEditModal";
import { RecurrenceRuleEditModal } from "@/components/recorrencias/RecurrenceRuleEditModal";
import { Transaction, RecurrenceRule } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { InputMethodCards, InputMethod } from "./InputMethodCards";
import { FiltersBar } from "./FiltersBar";
import { TransactionEditor } from "./TransactionEditor";
import { CaptureFlow } from "@/components/ingest/CaptureFlow";
import { CadastroTabs } from "./CadastroTabs";
import { useInterface } from "@/components/layout/InterfaceProvider";
import "./modern-cadastro.css";

export function CadastroPageClient({
  transactions,
  monthRows,
  people,
  categories,
  types,
  recurrenceRules,
}: {
  transactions: Transaction[];
  /** Presente quando um mês está filtrado: todas as linhas do mês (reais + recorrentes projetadas). */
  monthRows?: MonthRow[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  recurrenceRules: RecurrenceRule[];
}) {
  const { isModern } = useInterface();
  const searchParams = useSearchParams();
  const eligiblePeople = people.filter((person) => person.name.trim().toLocaleLowerCase("pt-BR") !== "casal");
  const selectedPersonId = searchParams.get("personId");
  const editorPeople = [...eligiblePeople].sort((a, b) => Number(b.id === selectedPersonId) - Number(a.id === selectedPersonId));
  const [editorOpen, setEditorOpen] = useState(() => searchParams.get("action") === "new");
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [captureMethod, setCaptureMethod] = useState<InputMethod | null>(null);
  const [ruleEditing, setRuleEditing] = useState<{ rule: RecurrenceRule; month: string } | null>(null);
  const [installmentEditing, setInstallmentEditing] = useState<Transaction | null>(null);
  const router = useRouter();

  // O popup depende de como o lançamento foi cadastrado: recorrente edita a regra (vale dos meses
  // seguintes em diante), parcelado edita a compra a partir da parcela, pontual edita só aquele lançamento.
  function handleEditRow(row: MonthRow) {
    const rule = row.occurrence.recurrenceRuleId
      ? recurrenceRules.find((r) => r.id === row.occurrence.recurrenceRuleId)
      : undefined;
    if (row.kind === "recorrente" && rule) {
      setRuleEditing({ rule, month: row.occurrence.referenceMonth });
    } else if (row.kind === "parcelado" && row.transaction?.installmentGroupId) {
      setInstallmentEditing(row.transaction);
    } else if (row.transaction) {
      setEditingTransaction(row.transaction);
      setEditorOpen(true);
    }
  }

  return (
    <div className={isModern ? "modern-cadastro" : undefined}>
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

      {!isModern && <CadastroTabs active="lancamentos" />}
      {isModern ? <section className="modern-cadastro-capture"><div><h2>Adicionar lançamento</h2><p>Escolha como deseja registrar</p></div><InputMethodCards onSelect={setCaptureMethod} /></section> : <InputMethodCards onSelect={setCaptureMethod} />}

      <section className={isModern ? "modern-cadastro-records" : undefined}>
      {isModern && <CadastroTabs active="lancamentos" />}
      <FiltersBar people={people} types={types} />

      <CadastroRecordsTable
        rows={monthRows ?? transactions.map(transactionMonthRow)}
        people={people}
        categories={categories}
        types={types}
        onEdit={handleEditRow}
      />
      </section>

      <TransactionEditor
        key={editingTransaction?.id ?? "new"}
        open={editorOpen}
        initialMonth={searchParams.get("month") ?? undefined}
        onClose={() => {
          setEditorOpen(false);
          if (searchParams.get("action") === "new") {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("action");
            router.replace(`/cadastro${params.size ? `?${params}` : ""}`);
          }
        }}
        people={editorPeople}
        categories={categories}
        types={types}
        transaction={editingTransaction}
        recurrenceRules={recurrenceRules}
      />

      {ruleEditing && (
        <RecurrenceRuleEditModal
          rule={ruleEditing.rule}
          initialMonth={ruleEditing.month}
          onClose={() => setRuleEditing(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {installmentEditing && (
        <InstallmentEditModal
          transaction={installmentEditing}
          categories={categories}
          types={types}
          onClose={() => setInstallmentEditing(null)}
          onSaved={() => {
            setInstallmentEditing(null);
            router.refresh();
          }}
          onEditSingle={() => {
            const t = installmentEditing;
            setInstallmentEditing(null);
            setEditingTransaction(t);
            setEditorOpen(true);
          }}
        />
      )}

      {captureMethod && (
        <CaptureFlow
          method={captureMethod}
          people={eligiblePeople}
          categories={categories}
          types={types}
          onClose={() => setCaptureMethod(null)}
        />
      )}
    </div>
  );
}
