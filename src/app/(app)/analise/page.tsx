export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { getAnalysisData } from "@/lib/data/analysis";
import { listTransactionsForMonth } from "@/lib/data/transactions";
import { toReferenceMonth } from "@/lib/utils/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { MonthSelector } from "@/components/analise/MonthSelector";
import { PersonFilter } from "@/components/analise/PersonFilter";
import { KpiCard } from "@/components/analise/KpiCard";
import { CategoryDonutChart } from "@/components/analise/CategoryDonutChart";
import { MonthlyEvolutionChart } from "@/components/analise/MonthlyEvolutionChart";
import { ComparativeBars } from "@/components/analise/ComparativeBars";
import { AIInsightCard, AIInsightCardSkeleton } from "@/components/analise/AIInsightCard";
import { AnaliseTransactionsTable } from "@/components/analise/AnaliseTransactionsTable";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrencyBRL } from "@/lib/utils/format";

export default async function AnalisePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const month = typeof sp.month === "string" ? sp.month : toReferenceMonth(new Date());
  const personId = typeof sp.personId === "string" ? sp.personId : "";

  const [data, monthTransactions] = await Promise.all([
    getAnalysisData(month, personId || undefined),
    listTransactionsForMonth(month, personId || undefined),
  ]);
  const hasData =
    data.currentSummary.incomeCents > 0 ||
    data.currentSummary.expenseCents > 0 ||
    data.categoryBreakdown.length > 0;

  const categoriesById = new Map(data.categories.map((c) => [c.id, c.name]));
  const topExpenses = data.categoryBreakdown.slice(0, 5);

  return (
    <div>
      <PageHeader
        title="Análise"
        subtitle="Veja como está sua vida financeira e acompanhe a evolução dos seus gastos e resultados."
        action={<MonthSelector month={month} />}
      />

      <div className="mb-6">
        <PersonFilter people={data.people} personId={personId} />
      </div>

      {!hasData ? (
        <EmptyState title="Ainda não existem dados suficientes neste mês para uma análise confiável. Cadastre alguns lançamentos em Cadastro." />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              label="Entradas"
              currentCents={data.currentSummary.incomeCents}
              previousCents={data.previousSummary?.incomeCents ?? null}
              tone="positive"
            />
            <KpiCard
              label="Saídas"
              currentCents={data.currentSummary.expenseCents}
              previousCents={data.previousSummary?.expenseCents ?? null}
              tone="negative"
              lowerIsBetter
            />
            <KpiCard
              label="Sobrou"
              currentCents={data.currentSummary.leftoverCents}
              previousCents={data.previousSummary?.leftoverCents ?? null}
              tone="info"
            />
          </div>

          <Card className="p-5">
            <h3 className="mb-4 text-[15px] font-semibold">Resumo por categoria (saídas)</h3>
            <CategoryDonutChart
              breakdown={data.categoryBreakdown}
              categories={data.categories}
              totalCents={data.currentSummary.expenseCents}
            />
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-[15px] font-semibold">Evolução do que sobrou (últimos 12 meses)</h3>
            <MonthlyEvolutionChart summaries={data.summaries} selectedMonth={month} />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-4 text-[15px] font-semibold">Maiores gastos do mês</h3>
              <ul className="space-y-3">
                {topExpenses.map((item, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span>{item.categoryId ? categoriesById.get(item.categoryId) ?? "Outros" : "Sem categoria"}</span>
                    <span className="tabular-nums font-medium">
                      {formatCurrencyBRL(item.amountCents)}{" "}
                      <span className="text-(--color-text-tertiary)">({item.percent.toFixed(1)}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-5">
              <h3 className="mb-4 text-[15px] font-semibold">Comparativo de saídas</h3>
              <ComparativeBars
                categoryBreakdown={data.categoryBreakdown}
                typeBreakdown={data.typeBreakdown}
                personBreakdown={data.personBreakdown}
                categories={data.categories}
                types={data.types}
                people={data.people}
              />
            </Card>
          </div>

          <Suspense fallback={<AIInsightCardSkeleton />} key={`${month}-${personId}`}>
            <AIInsightCard month={month} personId={personId || undefined} />
          </Suspense>

          <AnaliseTransactionsTable
            transactions={monthTransactions}
            people={data.people}
            categories={data.categories}
            types={data.types}
          />
        </div>
      )}
    </div>
  );
}
