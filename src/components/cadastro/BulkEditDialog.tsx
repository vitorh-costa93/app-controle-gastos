"use client";

import { useState, useTransition } from "react";
import { MonthlyOccurrence } from "@/types/domain";
import { Person, Category, TransactionType } from "@/types/db";
import { BulkEditPatch } from "@/lib/domain/bulk-edit";
import { bulkEditMovements } from "@/lib/data/bulk-edit";
import { Modal } from "@/components/ui/Modal";
import { Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const KEEP = "";
const NONE = "__none";

export function BulkEditDialog({ occurrences, people, categories, types, onClose, onSaved }: {
  occurrences: MonthlyOccurrence[];
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function set(key: string, value: string) { setFields((prev) => ({ ...prev, [key]: value })); }
  const changed = Object.values(fields).some((value) => value !== KEEP);

  function save() {
    setError(null);
    const patch = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== KEEP)
      .map(([key, value]) => [key, value === NONE ? null : value])) as BulkEditPatch;
    startTransition(async () => {
      try {
        const result = await bulkEditMovements(occurrences.map((o) => o.id), patch);
        if (!result.ok) { setError(result.error); return; }
        onSaved();
      } catch { setError("Não foi possível confirmar a gravação. Atualize a página antes de tentar novamente."); }
    });
  }
  const dimensions = [
    { key: "personId", label: "Origem", options: people.map((p) => [p.id, p.name]), nullable: false },
    { key: "direction", label: "Entrada / Saída", options: [["income", "Entrada"], ["expense", "Saída"]], nullable: false },
    { key: "fixedVariable", label: "Fixo / Variável", options: [["fixed", "Fixo"], ["variable", "Variável"]], nullable: false },
    { key: "typeId", label: "Tipo", options: types.map((t) => [t.id, t.name]), nullable: true },
    { key: "categoryId", label: "Categoria", options: categories.filter((c) => c.active).map((c) => [c.id, c.name]), nullable: true },
    { key: "bank", label: "Cartão / Banco", options: [["picpay", "PicPay"], ["nubank", "Nubank"]], nullable: true },
  ];
  return (
    <Modal open title={`Editar ${occurrences.length} lançamentos`} onClose={() => { if (!pending) onClose(); }}>
      <p className="mb-4 text-sm text-(--color-text-secondary)">Escolha os campos para alterar. Os demais dados, valores e parcelas serão mantidos.</p>
      <fieldset disabled={pending} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="bulk-month" className="mb-1.5 block text-xs font-medium">Mês de referência</label>
          <Input id="bulk-month" type="month" value={fields.referenceMonth ?? ""} onChange={(e) => set("referenceMonth", e.target.value)} />
          <span className="text-xs text-(--color-text-tertiary)">Vazio = manter o mês de cada registro.</span>
        </div>
        {dimensions.map((dimension) => (
          <div key={dimension.key}>
            <label htmlFor={`bulk-${dimension.key}`} className="mb-1.5 block text-xs font-medium">{dimension.label}</label>
            <Select id={`bulk-${dimension.key}`} value={fields[dimension.key] ?? KEEP} onChange={(e) => set(dimension.key, e.target.value)}>
              <option value={KEEP}>Manter cada registro</option>
              {dimension.nullable && <option value={NONE}>Sem {dimension.key === "bank" ? "banco" : dimension.label.toLowerCase()}</option>}
              {dimension.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </div>
        ))}
      </fieldset>
      <p className="mt-4 text-xs text-(--color-text-secondary)">Recorrências: a edição vale só para os registros selecionados. Mover de mês ou mudar para variável não altera os outros meses. Marcar um lançamento pontual como fixo cria uma recorrência mensal a partir do mês dele.</p>
      {error && <p role="alert" className="mt-3 text-sm text-(--color-negative)">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={onClose}>Cancelar</Button>
        <Button disabled={pending || !changed || occurrences.length > 500} onClick={save}>{pending ? "Salvando..." : "Salvar todos"}</Button>
      </div>
      {occurrences.length > 500 && <p role="alert" className="mt-2 text-xs text-(--color-negative)">Selecione até 500 registros por lote.</p>}
    </Modal>
  );
}
