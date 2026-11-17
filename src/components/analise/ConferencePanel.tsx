"use client";

import { useState } from "react";
import { ArrowRight, Info, ShieldCheck } from "lucide-react";
import { AnalysisData } from "@/lib/data/analysis";
import { MonthlyOccurrence } from "@/types/domain";
import { formatCurrencyBRL, formatMonthLabel } from "@/lib/utils/format";
import { BankCard } from "@/components/ui/BankCard";
import { AnaliseTransactionsTable } from "./AnaliseTransactionsTable";
import { conferenceScope, ConferenceFilters } from "./conference-scope";

function ManualComparison({ totalCents, enabled, scope }: { totalCents: number; enabled: boolean; scope: string }) {
  const [value, setValue] = useState("");
  const parsed = Number(value);
  const valid = enabled && value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const difference = valid ? Math.round(parsed * 100) - totalCents : null;
  return (
    <section className="ma-panel ma-comparison">
      <div className="ma-heading"><h2><ShieldCheck size={18} /> Conferir com o banco</h2></div>
      <div className="ma-comparison-grid">
        <div><span>Total no aplicativo</span><strong>{formatCurrencyBRL(totalCents)}</strong><small>Todas as categorias do banco selecionado</small></div>
        <label><span>Total informado no banco (R$)</span><input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0,00" value={value} disabled={!enabled} onChange={(event) => setValue(event.target.value)} /><small>{enabled ? "Comparação manual, sem alterar os lançamentos" : "Selecione Nubank ou PicPay para comparar"}</small></label>
        <div aria-live="polite"><span>Diferença · banco menos aplicativo</span><strong className={difference === 0 ? "ma-positive" : difference !== null ? "ma-warning" : ""}>{difference === null ? "—" : formatCurrencyBRL(difference)}</strong><small>{difference === 0 ? "Os totais informados coincidem" : "Parcelas, estornos, encargos e período podem divergir"}</small></div>
      </div>
      <p className="ma-scope-note"><Info size={13} /><span>{scope}. Mês de referência; não corresponde automaticamente ao fechamento da fatura.</span></p>
    </section>
  );
}

export function ConferencePanel({ data, transactions, month, personId, filters, onFiltersChange, onChanged, onOpenPivot }: {
  data: AnalysisData; transactions: MonthlyOccurrence[]; month: string; personId: string; filters: ConferenceFilters;
  onFiltersChange: (filters: ConferenceFilters) => void; onChanged: () => void;
  onOpenPivot: () => void;
}) {
  const scope = conferenceScope(transactions, filters, personId);
  const personName = data.people.find((person) => person.id === personId)?.name ?? "Casal";
  const bankName = filters.bank === "all" ? "Todos os bancos" : filters.bank === "none" ? "Sem banco" : filters.bank === "nubank" ? "Nubank" : "PicPay";
  const origin = filters.includeProjected ? "reais e projetados" : "somente reais";
  const scopeLabel = `${personName} · ${bankName} · ${formatMonthLabel(month)} · ${origin}`;
  const comparisonKey = `${month}|${personId}|${filters.bank}|${filters.category}|${filters.includeProjected}`;
  const hasCard = filters.bank === "nubank" || filters.bank === "picpay";

  return (
    <div className="ma-conference">
      <div className="ma-conference-toolbar ma-panel">
        <label>Banco<select value={filters.bank} onChange={(event) => onFiltersChange({ ...filters, bank: event.target.value })}><option value="all">Todos os bancos</option><option value="nubank">Nubank</option><option value="picpay">PicPay</option><option value="none">Sem banco</option></select></label>
        <label>Categoria<select value={filters.category} onChange={(event) => onFiltersChange({ ...filters, category: event.target.value })}><option value="all">Todas as categorias</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}<option value="none">Sem categoria</option></select></label>
        <label className="ma-projected-toggle"><input type="checkbox" checked={filters.includeProjected} onChange={(event) => onFiltersChange({ ...filters, includeProjected: event.target.checked })} />Incluir projetados</label>
        <p>{personName} · {formatMonthLabel(month)}</p>
      </div>
      <div className={hasCard ? "ma-conference-top ma-conference-top--with-card" : "ma-conference-top"}>
        {hasCard && (
          <div className="ma-conference-card-wrap">
            <BankCard bank={filters.bank as "nubank" | "picpay"} amountCents={scope.bankTotalCents} subtitle={`${personName} · ${origin}`} selected />
          </div>
        )}
        <ManualComparison key={`${month}|${personId}|${filters.bank}|${filters.includeProjected}`} totalCents={scope.bankTotalCents} enabled={hasCard} scope={scopeLabel} />
      </div>
      <div className="ma-conference-table">
        <AnaliseTransactionsTable key={comparisonKey} title="Detalhamento para conferência" transactions={scope.rows} people={data.people} categories={data.categories} types={data.types} recurrenceRules={data.recurrenceRules} onChanged={onChanged} />
      </div>
      <div className="ma-panel ma-other-paths"><h2>Outras formas de conferir</h2><button type="button" onClick={onOpenPivot}>Abrir na tabela dinâmica <ArrowRight size={15} /></button></div>
    </div>
  );
}
