import { AnalysisData } from "@/lib/data/analysis";
import { MonthlyOccurrence } from "@/types/domain";
import { formatCurrencyBRL } from "@/lib/utils/format";
import { MonthlyPaymentsPanel } from "@/components/payments/MonthlyPaymentsPanel";

function FinanceObject({ index }: { index: number }) {
  return <span aria-hidden="true" className="finance-object" style={{ backgroundPosition: `${index * 100 / 3}% center` }} />;
}

export function ModernOverview({ data, transactions, month }: { data: AnalysisData; transactions: MonthlyOccurrence[]; month: string }) {
  const bankTotal = (bank: "nubank" | "picpay") => transactions
    .filter((t) => t.considered && t.direction === "expense" && t.bank === bank)
    .reduce((sum, t) => sum + t.amountCents, 0);
  const summary = data.currentSummary;
  const allocation = summary.incomeCents > 0 ? Math.min(100, Math.max(0, summary.expenseCents / summary.incomeCents * 100)) : 100;
  const categoryNames = new Map(data.categories.map((category) => [category.id, category.name]));
  return (
    <div className="modern-overview">
      <div className="modern-overview-content">
        <section className="modern-tile">
          <div className="modern-balance">
            <div><p>Saldo previsto</p><strong>{formatCurrencyBRL(summary.leftoverCents)}</strong><span>Entradas menos saídas do mês · inclui projeções</span></div>
            <FinanceObject index={0} />
          </div>
          <div className="modern-allocation" aria-label="Composição da renda"><span style={{ width: `${allocation}%` }} /><span style={{ flex: 1 }} /></div>
          <div className="modern-summary"><div><span>Entradas</span><b>{formatCurrencyBRL(summary.incomeCents)}</b></div><div><span>Saídas</span><b>{formatCurrencyBRL(summary.expenseCents)}</b></div><div><span>{summary.leftoverCents >= 0 ? "Sobra prevista" : "Déficit previsto"}</span><b>{formatCurrencyBRL(summary.leftoverCents)}</b></div></div>
        </section>
        <div className="modern-overview-first">
          <section className="modern-tile modern-couple">
            <div className="modern-tile-heading"><div><h2>Divisão por pessoa</h2><p>Resumo do mês</p></div><FinanceObject index={1} /></div>
            {data.personSummaries.map((summary) => {
              const person = data.people.find((p) => p.id === summary.personId);
              if (!person) return null;
              return <div className="modern-person" key={summary.personId}><span><i style={{ backgroundColor: person.color ?? "#8e8e93" }} />{person.name}</span><strong>{formatCurrencyBRL(summary.expenseCents)}</strong></div>;
            })}
            <div className="modern-category-list"><h3>Saídas por categoria</h3>{data.categoryBreakdown.slice().sort((a, b) => b.amountCents - a.amountCents).slice(0, 6).map((category) => <div key={category.categoryId ?? "none"}><span>{category.categoryId ? categoryNames.get(category.categoryId) ?? "Categoria inativa" : "Sem categoria"}</span><b>{formatCurrencyBRL(category.amountCents)}</b></div>)}</div>
          </section>
        <section className="modern-tile modern-bank-section">
          <div><h2>Cartões</h2><p>Lançamentos do mês por banco</p></div>
          <div className="modern-bank-grid">
            {(["nubank", "picpay"] as const).map((bank) => <div className={`modern-bank-card ${bank}`} key={bank}><div className="modern-bank-top"><b>{bank === "nubank" ? "Nubank" : "PicPay"}</b><span aria-hidden="true">◔</span></div><div className="modern-chip" aria-hidden="true" /><span>Saídas do mês</span><strong>{formatCurrencyBRL(bankTotal(bank))}</strong></div>)}
          </div>
        </section>
        </div>
      </div>
      <MonthlyPaymentsPanel month={month} />
    </div>
  );
}
