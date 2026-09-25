"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { AnalysisData, fetchAnalysisPageData, getMonthInsight } from "@/lib/data/analysis";
import { MonthlyOccurrence } from "@/types/domain";
import { PageHeader } from "@/components/layout/PageHeader";
import { MonthSelector } from "./MonthSelector";
import { PersonFilter } from "./PersonFilter";
import { KpiCard } from "./KpiCard";
import { CategoryDonutChart } from "./CategoryDonutChart";
import { MonthlyEvolutionChart } from "./MonthlyEvolutionChart";
import { SavingsRateCard } from "./SavingsRateCard";
import { CompositionCard } from "./CompositionCard";
import { CommitmentsChart } from "./CommitmentsChart";
import { CategoryChangesCard } from "./CategoryChangesCard";
import { PersonComparisonCard } from "./PersonComparisonCard";
import { TopExpensesCard } from "./TopExpensesCard";
import { AnaliseTransactionsTable } from "./AnaliseTransactionsTable";
import { PivotTable } from "./PivotTable";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { addMonths } from "@/lib/utils/format";

export function AnalisePageClient({
  initialMonth,
  initialPersonId,
  initialData,
  initialTransactions,
  initialInsight,
}: {
  initialMonth: string;
  initialPersonId: string;
  initialData: AnalysisData;
  initialTransactions: MonthlyOccurrence[];
  initialInsight: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [personId, setPersonId] = useState(initialPersonId);
  const [data, setData] = useState(initialData);
  const [monthTransactions, setMonthTransactions] = useState(initialTransactions);
  const [insight, setInsight] = useState(initialInsight);
  const [isPending, startTransition] = useTransition();
  const [insightPending, startInsightTransition] = useTransition();

  // Guarda contra corrida: se o usuário clicar em "próximo mês" várias vezes rápido,
  // só o resultado da navegação mais recente pode atualizar a tela.
  const requestIdRef = useRef(0);

  function navigate(nextMonth: string, nextPersonId: string) {
    setMonth(nextMonth);
    setPersonId(nextPersonId);

    const requestId = ++requestIdRef.current;

    startTransition(async () => {
      const { data: nextData, transactions: nextTransactions } = await fetchAnalysisPageData(
        nextMonth,
        nextPersonId || undefined
      );
      if (requestIdRef.current !== requestId) return;
      setData(nextData);
      setMonthTransactions(nextTransactions);
    });

    startInsightTransition(async () => {
      const nextInsight = await getMonthInsight(nextMonth, nextPersonId || undefined);
      if (requestIdRef.current !== requestId) return;
      setInsight(nextInsight);
    });

    const params = new URLSearchParams();
    params.set("month", nextMonth);
    if (nextPersonId) params.set("personId", nextPersonId);
    window.history.replaceState(null, "", `/analise?${params.toString()}`);
  }

  // Pré-aquece o cache dos meses vizinhos em segundo plano — assim, na maioria das
  // vezes, clicar em "anterior"/"próximo" acha o resultado já pronto no servidor.
  useEffect(() => {
    const neighbors = [addMonths(month, -1), addMonths(month, 1)];
    neighbors.forEach((m) => {
      fetchAnalysisPageData(m, personId || undefined).catch(() => {});
    });
  }, [month, personId]);

  const hasData =
    data.currentSummary.incomeCents > 0 ||
    data.currentSummary.expenseCents > 0 ||
    data.categoryBreakdown.length > 0;


  return (
    <div>
      <PageHeader
        title="Análise"
        subtitle="Veja como está sua vida financeira e acompanhe a evolução dos seus gastos e resultados."
        action={<MonthSelector month={month} onChange={(m) => navigate(m, personId)} isPending={isPending} />}
      />

      <div className="mb-6">
        <PersonFilter
          people={data.people}
          personId={personId}
          onChange={(p) => navigate(month, p)}
          isPending={isPending}
        />
      </div>

      {!hasData ? (
        <EmptyState title="Ainda não existem dados suficientes neste mês para uma análise confiável. Cadastre alguns lançamentos em Cadastro." />
      ) : (
        <div className={"flex min-w-0 flex-col gap-6 transition-opacity" + (isPending ? " opacity-60" : "")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <SavingsRateCard
              current={data.currentSummary}
              previous={data.previousSummary}
              history={data.summaries}
            />
          </div>

          <Card className="p-5">
            <h3 className="mb-4 text-[15px] font-semibold">Resumo por categoria (saídas)</h3>
            <CategoryDonutChart
              breakdown={data.categoryBreakdown}
              categories={data.categories}
              totalCents={data.currentSummary.expenseCents}
              occurrences={monthTransactions}
              people={data.people}
            />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CompositionCard commitment={data.commitments[0]} />
            <CommitmentsChart commitments={data.commitments} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CategoryChangesCard changes={data.categoryChanges} categories={data.categories} />
            <PersonComparisonCard summaries={data.personSummaries} people={data.people} />
          </div>

          <Card className="p-5">
            <h3 className="mb-1 text-[15px] font-semibold">Evolução do que sobrou (últimos 12 meses)</h3>
            <p className="mb-4 text-xs text-(--color-text-tertiary)">
              Barras: quanto sobrou. Linha: taxa de poupança (% da renda).
            </p>
            <MonthlyEvolutionChart summaries={data.summaries} selectedMonth={month} />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TopExpensesCard occurrences={monthTransactions} people={data.people} />

          <Card className="flex gap-3 bg-(--color-primary-soft)/40 p-4">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-(--color-primary)" />
            <div className="flex-1">
              <p className="mb-1 text-sm font-semibold text-(--color-primary)">Insight da IA</p>
              {insightPending ? (
                <div className="space-y-2">
                  <div className="h-3 w-full animate-pulse rounded bg-black/10" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-black/10" />
                </div>
              ) : (
                <p className="text-sm text-(--color-text-secondary)">{insight}</p>
              )}
            </div>
          </Card>
          </div>

          <AnaliseTransactionsTable
            transactions={monthTransactions}
            people={data.people}
            categories={data.categories}
            types={data.types}
          />

          <PivotTable people={data.people} categories={data.categories} types={data.types} />
        </div>
      )}
    </div>
  );
}
