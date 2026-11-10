"use client";

import { useState } from "react";
import { CreditCard, House } from "lucide-react";
import { AnalysisData } from "@/lib/data/analysis";
import { MonthlyOccurrence } from "@/types/domain";
import { formatCurrencyBRL } from "@/lib/utils/format";
import { MonthlyPaymentsPanel } from "@/components/payments/MonthlyPaymentsPanel";

function FinanceObject({ index }: { index: number }) {
  return <span aria-hidden="true" className="finance-object" style={{ backgroundPosition: `${index * 100 / 3}% center` }} />;
}

function Money({ cents }: { cents: number }) {
  const value = formatCurrencyBRL(cents);
  const match = value.match(/^(.*?)([\d.]+)(,\d{2})$/);
  return <strong className="modern-money">{match ? <><small>{match[1]}</small>{match[2]}<small>{match[3]}</small></> : value}</strong>;
}

export function ModernOverview({ data, transactions, month }: { data: AnalysisData; transactions: MonthlyOccurrence[]; month: string }) {
  const [bankIndex, setBankIndex] = useState(0);
  const banks = ["nubank", "picpay"] as const;
  const bankTotal = (bank: typeof banks[number]) => transactions
    .filter((t) => t.considered && t.direction === "expense" && t.bank === bank)
    .reduce((sum, t) => sum + t.amountCents, 0);
  const summary = data.currentSummary;
  const canAllocate = summary.incomeCents > 0 && summary.expenseCents >= 0;
  const allocation = canAllocate ? Math.min(100, summary.expenseCents / summary.incomeCents * 100) : 0;
  const personTotal = data.personSummaries.reduce((sum, person) => sum + Math.max(0, person.expenseCents), 0);
  const categoryNames = new Map(data.categories.map((category) => [category.id, category.name]));
  const housingCategory = data.categories.find((category) => category.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase() === "moradia");
  const housing = data.categoryBreakdown.find((category) => category.categoryId === housingCategory?.id);
  const housingItems = housingCategory ? transactions.filter((t) => t.considered && t.direction === "expense" && t.categoryId === housingCategory.id).sort((a, b) => b.amountCents - a.amountCents).slice(0, 4) : [];
  return (
    <div className="modern-overview">
      <div className="modern-overview-content">
        <section className="modern-tile modern-hero">
          <div className="modern-balance">
            <div><h2>Saldo previsto</h2><div className="modern-balance-value"><Money cents={summary.leftoverCents} />{summary.incomeCents > 0 && <span className={`modern-ratio${summary.leftoverCents < 0 ? " is-negative" : ""}`}>{Math.round(summary.leftoverCents / summary.incomeCents * 100)}% da renda prevista<br /><em>após as saídas do mês</em></span>}</div></div>
            <FinanceObject index={0} />
          </div>
          {canAllocate && <div className="modern-allocation" aria-label="Proporção das saídas e sobra em relação às entradas"><span style={{ width: `${allocation}%` }} /><span style={{ flex: 1 }} /></div>}
          <div className="modern-summary"><div><span>Entradas</span><b>{formatCurrencyBRL(summary.incomeCents)}</b></div><div><span>Saídas</span><b>{formatCurrencyBRL(summary.expenseCents)}</b></div><div><span>{summary.leftoverCents >= 0 ? "Sobra prevista" : "Déficit previsto"}</span><b>{formatCurrencyBRL(summary.leftoverCents)}</b></div></div>
        </section>
        <div className="modern-overview-first">
          <section className="modern-tile modern-couple">
            <div className="modern-tile-heading"><div><h2>Divisão por pessoa</h2><p>Total das saídas</p><Money cents={summary.expenseCents} /></div><FinanceObject index={1} /></div>
            <div className="modern-people">{data.personSummaries.map((personSummary) => {
              const person = data.people.find((p) => p.id === personSummary.personId);
              if (!person) return null;
              return <div className="modern-person" key={personSummary.personId}><span><i style={{ backgroundColor: person.color ?? "#8e8e93" }} />{person.name}</span><strong>{formatCurrencyBRL(personSummary.expenseCents)}</strong></div>;
            })}</div>
            {personTotal > 0 && <div className="modern-person-bar" aria-label="Proporção das saídas por pessoa">{data.personSummaries.map((personSummary) => <span key={personSummary.personId} style={{ width: `${Math.max(0, personSummary.expenseCents) / personTotal * 100}%`, backgroundColor: data.people.find((p) => p.id === personSummary.personId)?.color ?? "#8e8e93" }} />)}</div>}
            <div className="modern-category-list"><h3>Saídas por categoria</h3>{data.categoryBreakdown.slice().sort((a, b) => b.amountCents - a.amountCents).slice(0, 6).map((category) => <div key={category.categoryId ?? "none"}><span>{category.categoryId ? categoryNames.get(category.categoryId) ?? "Categoria inativa" : "Sem categoria"}</span><b>{formatCurrencyBRL(category.amountCents)}</b></div>)}</div>
          </section>
          <section className="modern-tile modern-bank-section">
            <div className="modern-tile-heading"><div><h2>Cartões</h2><p>Saídas do mês por banco</p><Money cents={bankTotal(banks[bankIndex])} /></div><span className="modern-decorative-icon" aria-hidden="true"><CreditCard size={29} /></span></div>
            <div className="modern-bank-controls"><span>{banks[bankIndex] === "nubank" ? "Nubank" : "PicPay"}</span><div><button type="button" aria-label="Banco anterior" onClick={() => setBankIndex((bankIndex + 1) % 2)}>‹</button><button type="button" aria-label="Próximo banco" onClick={() => setBankIndex((bankIndex + 1) % 2)}>›</button></div></div>
            <div className="modern-bank-viewport"><div className="modern-bank-track" style={{ transform: `translateX(-${bankIndex * 84}%)` }}>{banks.map((bank) => <div className={`modern-bank-card ${bank}`} key={bank}><div className="modern-bank-top"><b>{bank === "nubank" ? "nu" : "PicPay"}</b><span aria-hidden="true">)))</span></div><div className="modern-chip" aria-hidden="true" /><span>Saídas do mês</span><strong>{formatCurrencyBRL(bankTotal(bank))}</strong></div>)}</div></div>
          </section>
        </div>
      </div>
      <div className="modern-overview-side">
        <MonthlyPaymentsPanel month={month} />
        {housing && <section className="modern-tile modern-housing">
          <div className="modern-tile-heading"><div><h2>Moradia</h2><p>Participação na renda</p><Money cents={housing.amountCents} /></div><span className="modern-decorative-icon" aria-hidden="true"><House size={28} /></span></div>
          {summary.incomeCents > 0 && <><p className="modern-housing-ratio">{Math.round(housing.amountCents / summary.incomeCents * 100)}% da renda prevista</p><div className="modern-housing-bar" aria-label="Participação de moradia na renda"><span style={{ width: `${Math.min(100, Math.max(0, housing.amountCents / summary.incomeCents * 100))}%` }} /></div></>}
          {housingItems.length > 0 && <div className="modern-category-list"><h3>Principais despesas</h3>{housingItems.map((item) => <div key={item.id}><span>{item.description || "Despesa de moradia"}</span><b>{formatCurrencyBRL(item.amountCents)}</b></div>)}</div>}
          <p className="modern-housing-caption">Já incluído nas saídas</p>
        </section>}
      </div>
    </div>
  );
}
