"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { formatCurrencyBRL, formatReferenceMonthShort, addMonths, toReferenceMonth } from "@/lib/utils/format";
import { upsertSalaryEntry, deleteSalaryEntry, SalaryEntry } from "@/lib/data/salary";
import { syncComputedTaxTransactions } from "@/lib/data/taxes";
import { projectSalaryForMonth, sumRevenueLast12Months, calcJaquelineTaxCents } from "@/lib/domain/salary";
import { Person } from "@/types/db";

export function SalaryProjectionEditor({ entries: initialEntries, person }: { entries: SalaryEntry[]; person: Person }) {
  const [entries, setEntries] = useState(initialEntries);
  const [month, setMonth] = useState(toReferenceMonth(new Date()));
  const [amountCents, setAmountCents] = useState(0);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await upsertSalaryEntry(person.id, month, amountCents);
      if (result.ok) {
        setEntries((prev) =>
          [...prev.filter((e) => e.referenceMonth !== month), result.data].sort((a, b) =>
            a.referenceMonth.localeCompare(b.referenceMonth)
          )
        );
        setAmountCents(0);
        syncComputedTaxTransactions();
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteSalaryEntry(id);
      if (result.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        syncComputedTaxTransactions();
      }
    });
  }

  const projection = useMemo(() => {
    const now = toReferenceMonth(new Date());
    const months = Array.from({ length: 6 }, (_, i) => addMonths(now, i));
    return months.map((m) => {
      const real = entries.find((e) => e.referenceMonth === m);
      const grossCents = real ? real.amountCents : projectSalaryForMonth(entries, m);
      const rbt12Cents = sumRevenueLast12Months(entries, m);
      const taxCents = calcJaquelineTaxCents(grossCents, rbt12Cents);
      return { month: m, grossCents, taxCents, isReal: Boolean(real) };
    });
  }, [entries]);

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Salário variável — {person.name}</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        Cadastre só o mês que já fechou. Os próximos são projetados pela média móvel dos últimos 12 meses (por dia
        útil). O imposto (DAS pelo Simples Nacional — Anexo V — mais INSS de 11% sobre 28% do faturamento) é
        referente ao faturamento deste mês, mas é pago no mês seguinte — o lançamento real de imposto aparece em
        Análise com essa defasagem.
      </p>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <FieldGroup label="Mês fechado">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Valor recebido (bruto)">
          <CurrencyInput valueCents={amountCents} onChange={setAmountCents} />
        </FieldGroup>
        <div className="flex items-end">
          <Button onClick={handleSave} disabled={isPending || amountCents <= 0} type="button">
            Salvar mês
          </Button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-(--color-text-tertiary)">
            <th className="pb-2 font-medium">Mês</th>
            <th className="pb-2 font-medium">Bruto</th>
            <th className="pb-2 font-medium">Imposto (DAS+INSS)</th>
            <th className="pb-2 font-medium">Líquido</th>
          </tr>
        </thead>
        <tbody>
          {projection.map((p) => (
            <tr key={p.month} className="border-t border-(--color-border)">
              <td className="py-2">
                {formatReferenceMonthShort(p.month)}
                {!p.isReal && <span className="ml-1 text-(--color-text-tertiary)">· projetado</span>}
              </td>
              <td className="py-2">{formatCurrencyBRL(p.grossCents)}</td>
              <td className="py-2 text-(--color-negative)">-{formatCurrencyBRL(p.taxCents)}</td>
              <td className="py-2 font-medium">{formatCurrencyBRL(p.grossCents - p.taxCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {entries.length > 0 && (
        <div className="mt-4 border-t border-(--color-border) pt-3">
          <p className="mb-2 text-xs font-medium text-(--color-text-tertiary)">Histórico cadastrado</p>
          <ul className="space-y-1 text-sm">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between">
                <span>
                  {formatReferenceMonthShort(e.referenceMonth)} — {formatCurrencyBRL(e.amountCents)}
                </span>
                <button
                  type="button"
                  className="text-xs text-(--color-text-tertiary) hover:text-(--color-negative)"
                  onClick={() => handleDelete(e.id)}
                >
                  remover
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
