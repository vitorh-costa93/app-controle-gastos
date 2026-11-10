"use client";

import { ArrowUpRight, ChevronRight, CreditCard, House } from "lucide-react";
import { AnalysisData } from "@/lib/data/analysis";
import { MonthlyOccurrence } from "@/types/domain";
import { formatCurrencyBRL } from "@/lib/utils/format";
import { MonthlyPaymentsPanel } from "@/components/payments/MonthlyPaymentsPanel";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { BankCard } from "@/components/ui/BankCard";
import { MonthlyEvolutionChart } from "./MonthlyEvolutionChart";

function FinanceObject({ index }: { index: number }) {
  return <span aria-hidden="true" className="finance-object" style={{ backgroundPosition: `${index * 100 / 3}% center` }} />;
}

function Money({ cents }: { cents: number }) {
  const value = formatCurrencyBRL(cents);
  const match = value.match(/^(.*?)([\d.]+)(,\d{2})$/);
  return <strong className="ma-money">{match ? <><small>{match[1]}</small>{match[2]}<small>{match[3]}</small></> : value}</strong>;
}

export function ModernOverview({ data, transactions, month, personId, onInspect }: {
  data: AnalysisData; transactions: MonthlyOccurrence[]; month: string; personId: string;
  onInspect: (bank: string, category: string, projected?: boolean) => void;
}) {
  const bankTotal = (bank: "nubank" | "picpay") => transactions.filter((t) => t.considered && t.direction === "expense" && t.bank === bank).reduce((sum, t) => sum + t.amountCents, 0);
  const summary = data.currentSummary;
  const allocation = summary.incomeCents > 0 ? Math.min(100, Math.max(0, summary.expenseCents / summary.incomeCents * 100)) : 0;
  const personName = data.people.find((person) => person.id === personId)?.name ?? "Casal";
  const categories = new Map(data.categories.map((category) => [category.id, category.name]));
  const housingCategory = data.categories.find((category) => category.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "moradia");
  const housing = data.categoryBreakdown.find((category) => housingCategory && category.categoryId === housingCategory.id);
  const housingItems = housingCategory ? transactions.filter((t) => t.considered && t.direction === "expense" && t.categoryId === housingCategory.id).sort((a, b) => b.amountCents - a.amountCents).slice(0, 4) : [];
  const personTotal = data.personSummaries.reduce((sum, person) => sum + Math.max(0, person.expenseCents), 0);

  return <div className="ma-overview">
    <div className="ma-overview-main">
      <section className="ma-panel ma-balance">
        <div className="ma-heading"><div><h2>Saldo previsto</h2><div className="ma-balance-line"><Money cents={summary.leftoverCents} />{summary.incomeCents > 0 && <span className={summary.leftoverCents < 0 ? "ma-negative" : "ma-positive"}><ArrowUpRight size={15} />{Math.round(summary.leftoverCents / summary.incomeCents * 100)}% da renda<small>após as saídas previstas</small></span>}</div></div><FinanceObject index={0} /></div>
        <div className="ma-allocation" aria-label="Comprometimento das entradas"><span style={{ width: `${allocation}%` }} /><span /></div>
        <div className="ma-summary"><div><span>Entradas</span><b>{formatCurrencyBRL(summary.incomeCents)}</b></div><div><span>Saídas</span><b>{formatCurrencyBRL(summary.expenseCents)}</b></div><div><span>{summary.leftoverCents >= 0 ? "Sobra prevista" : "Déficit previsto"}</span><b>{formatCurrencyBRL(summary.leftoverCents)}</b></div></div>
      </section>
      <div className="ma-overview-pair">
        <section className="ma-panel ma-people-panel">
          <div className="ma-heading"><div><h2>{personId ? `Saídas de ${personName}` : "Divisão por pessoa"}</h2><p>Total das saídas previstas</p><Money cents={summary.expenseCents} /></div>{!personId && <FinanceObject index={1} />}</div>
          {!personId && <><div className="ma-people">{data.personSummaries.map((entry) => {
            const person = data.people.find((p) => p.id === entry.personId);
            return person && <div key={person.id}><span><i style={{ background: person.color ?? "#0a6cff" }} />{person.name}</span><strong>{formatCurrencyBRL(entry.expenseCents)}</strong></div>;
          })}</div>{personTotal > 0 && <div className="ma-person-bar" aria-label="Participação nas despesas consolidadas">{data.personSummaries.map((entry) => <span key={entry.personId} style={{ width: `${Math.max(0, entry.expenseCents) / personTotal * 100}%`, background: data.people.find((p) => p.id === entry.personId)?.color ?? "#0a6cff" }} />)}</div>}</>}
          <div className="ma-category-list">{data.categoryBreakdown.slice().sort((a, b) => b.amountCents - a.amountCents).slice(0, 6).map((category) => {
            const name = category.categoryId ? categories.get(category.categoryId) ?? "Categoria inativa" : "Sem categoria";
            return <button type="button" key={category.categoryId ?? "none"} onClick={() => onInspect("all", category.categoryId ?? "none", true)}><CategoryIcon name={name} size={17} /><span>{name}</span><b>{formatCurrencyBRL(category.amountCents)}</b><ChevronRight size={13} /></button>;
          })}</div><button className="ma-text-link" type="button" onClick={() => onInspect("all", "all", true)}>Conferir todas as categorias <ArrowUpRight size={13} /></button>
        </section>
        <section className="ma-panel ma-cards-panel">
          <div className="ma-heading"><div><h2>Cartões</h2><p>Saídas previstas por banco</p><Money cents={bankTotal("nubank") + bankTotal("picpay")} /></div><CreditCard size={25} className="ma-heading-icon" /></div>
          <div className="ma-cards">{(["nubank", "picpay"] as const).map((bank) => <BankCard key={bank} bank={bank} amountCents={bankTotal(bank)} subtitle="Saídas do mês · reais e projetadas" onClick={() => onInspect(bank, "all", true)} />)}</div>
        </section>
      </div>
      <section className="ma-panel ma-evolution"><div className="ma-heading"><div><h2>Evolução do saldo</h2><p>Últimos 12 meses · barras de saldo e taxa de poupança</p></div></div><MonthlyEvolutionChart summaries={data.summaries} selectedMonth={month} /></section>
    </div>
    <aside className="ma-overview-side">
      <MonthlyPaymentsPanel key={`${month}|${personId}`} month={month} personId={personId} personName={personName} />
      <section className="ma-panel ma-housing"><div className="ma-heading"><div><h2>Moradia</h2><p>Já incluída nas saídas</p><Money cents={housing?.amountCents ?? 0} /></div><House size={28} className="ma-heading-icon" /></div>
        {housing && summary.incomeCents > 0 && <><p className="ma-housing-ratio">{Math.round(housing.amountCents / summary.incomeCents * 100)}% da renda prevista</p><div className="ma-housing-bar"><span style={{ width: `${Math.min(100, Math.max(0, housing.amountCents / summary.incomeCents * 100))}%` }} /></div></>}
        {housingItems.length ? <div className="ma-housing-items">{housingItems.map((item) => <button key={item.id} type="button" onClick={() => onInspect("all", housingCategory!.id, true)}><CategoryIcon name="Moradia" size={18} /><span>{item.description || "Despesa de moradia"}<b>{formatCurrencyBRL(item.amountCents)}</b></span></button>)}</div> : <p className="ma-empty">Nenhuma saída de moradia neste mês.</p>}
      </section>
    </aside>
  </div>;
}
