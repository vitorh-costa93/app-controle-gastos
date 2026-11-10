"use client";

import { useState } from "react";
import { ArrowRight, ChevronRight, Info, ShieldCheck } from "lucide-react";
import { AnalysisData } from "@/lib/data/analysis";
import { MonthlyOccurrence } from "@/types/domain";
import { formatCurrencyBRL, formatMonthLabel } from "@/lib/utils/format";
import { BankCard } from "@/components/ui/BankCard";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { AnaliseTransactionsTable } from "./AnaliseTransactionsTable";
import { conferenceScope, ConferenceFilters } from "./conference-scope";

function ManualComparison({ totalCents, enabled, scope }: { totalCents: number; enabled: boolean; scope: string }) {
  const [value, setValue] = useState("");
  const parsed = Number(value);
  const valid = enabled && value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const difference = valid ? Math.round(parsed * 100) - totalCents : null;
  return <section className="ma-panel ma-comparison"><div className="ma-heading"><h2><ShieldCheck size={18} /> Conferir com o banco</h2></div><div className="ma-comparison-grid">
    <div><span>Total no aplicativo</span><strong>{formatCurrencyBRL(totalCents)}</strong><small>Todas as categorias do banco selecionado</small></div>
    <label><span>Total informado no banco (R$)</span><input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0,00" value={value} disabled={!enabled} onChange={(event) => setValue(event.target.value)} /><small>{enabled ? "Comparação manual, sem alterar os lançamentos" : "Selecione Nubank ou PicPay para comparar"}</small></label>
    <div aria-live="polite"><span>Diferença · banco menos aplicativo</span><strong className={difference === 0 ? "ma-positive" : difference !== null ? "ma-warning" : ""}>{difference === null ? "—" : formatCurrencyBRL(difference)}</strong><small>{difference === 0 ? "Os totais informados coincidem" : "Parcelas, estornos, encargos e período podem divergir"}</small></div>
  </div><p className="ma-scope-note"><Info size={13} /><span>{scope}. Mês de referência; não corresponde automaticamente ao fechamento da fatura.</span></p></section>;
}

export function ConferencePanel({ data, transactions, month, personId, filters, onFiltersChange, onChanged, onOpenMovements, onOpenPivot }: {
  data: AnalysisData; transactions: MonthlyOccurrence[]; month: string; personId: string; filters: ConferenceFilters;
  onFiltersChange: (filters: ConferenceFilters) => void; onChanged: () => void;
  onOpenMovements: () => void; onOpenPivot: () => void;
}) {
  const scope = conferenceScope(transactions, filters, personId);
  const names = new Map(data.categories.map((category) => [category.id, category.name]));
  const categoryName = (id: string) => id === "all" ? "Todas as categorias" : id === "none" ? "Sem categoria" : names.get(id) ?? "Categoria inativa";
  const personName = data.people.find((person) => person.id === personId)?.name ?? "Casal";
  const bankName = filters.bank === "all" ? "Todos os bancos" : filters.bank === "none" ? "Sem banco" : filters.bank === "nubank" ? "Nubank" : "PicPay";
  const origin = filters.includeProjected ? "reais e projetados" : "somente reais";
  const scopeLabel = `${personName} · ${bankName} · ${formatMonthLabel(month)} · ${origin}`;
  const comparisonKey = `${month}|${personId}|${filters.bank}|${filters.category}|${filters.includeProjected}`;
  return <div className="ma-conference">
    <div className="ma-conference-toolbar ma-panel"><label>Banco<select value={filters.bank} onChange={(event) => onFiltersChange({ ...filters, bank: event.target.value })}><option value="all">Todos os bancos</option><option value="nubank">Nubank</option><option value="picpay">PicPay</option><option value="none">Sem banco</option></select></label><label>Categoria<select value={filters.category} onChange={(event) => onFiltersChange({ ...filters, category: event.target.value })}><option value="all">Todas as categorias</option>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}<option value="none">Sem categoria</option></select></label><label className="ma-projected-toggle"><input type="checkbox" checked={filters.includeProjected} onChange={(event) => onFiltersChange({ ...filters, includeProjected: event.target.checked })} />Incluir projetados</label><p>{personName} · {formatMonthLabel(month)}</p></div>
    <aside className="ma-conference-side">
      {(filters.bank === "nubank" || filters.bank === "picpay") && <BankCard bank={filters.bank} amountCents={scope.bankTotalCents} subtitle={`${personName} · ${origin}`} selected />}
      <section className="ma-panel ma-conference-categories"><h2>Gastos por categoria</h2><p>{bankName} · {personName} · {origin}</p><button className={filters.category === "all" ? "is-active" : ""} type="button" aria-pressed={filters.category === "all"} onClick={() => onFiltersChange({ ...filters, category: "all" })}><span>Todas as categorias</span><b>{formatCurrencyBRL(scope.bankTotalCents)}</b></button>
        {scope.categories.map((category) => <button className={filters.category === category.id ? "is-active" : ""} type="button" key={category.id} aria-pressed={filters.category === category.id} onClick={() => onFiltersChange({ ...filters, category: category.id })}><CategoryIcon name={categoryName(category.id)} size={18} /><span>{categoryName(category.id)}<i className="ma-category-track"><i style={{ width: `${scope.bankTotalCents > 0 ? Math.max(0, Math.min(100, category.amountCents / scope.bankTotalCents * 100)) : 0}%` }} /></i></span><b>{formatCurrencyBRL(category.amountCents)}</b><ChevronRight size={13} /></button>)}
        {!scope.categories.length && <p className="ma-empty">Nenhuma saída neste escopo.</p>}
        <div className="ma-category-total"><span>Total do banco</span><b>{formatCurrencyBRL(scope.bankTotalCents)}</b></div>
      </section>
    </aside>
    <div className="ma-conference-main"><ManualComparison key={`${month}|${personId}|${filters.bank}|${filters.includeProjected}`} totalCents={scope.bankTotalCents} enabled={filters.bank === "nubank" || filters.bank === "picpay"} scope={scopeLabel} />
      <section className="ma-panel ma-detail-heading"><p>{personName} / {bankName} / {categoryName(filters.category)}</p><div><h2>{filters.category === "all" ? "Lançamentos do banco" : "Lançamentos da categoria"}</h2><strong>{formatCurrencyBRL(scope.totalCents)} <small>· {scope.rows.length} lançamentos · {origin}</small></strong></div><p>Somente saídas consideradas. Os filtros de coluna abaixo refinam a tabela; os totais desta conferência seguem banco, categoria e origem acima.</p></section>
      <AnaliseTransactionsTable key={comparisonKey} title="Detalhamento para conferência" transactions={scope.rows} people={data.people} categories={data.categories} types={data.types} recurrenceRules={data.recurrenceRules} onChanged={onChanged} />
      <div className="ma-panel ma-other-paths"><h2>Outras formas de conferir</h2><button type="button" onClick={onOpenPivot}>Abrir na tabela dinâmica <ArrowRight size={15} /></button><button type="button" onClick={onOpenMovements}>Ver todas as movimentações deste escopo <ArrowRight size={15} /></button></div>
    </div>
  </div>;
}
