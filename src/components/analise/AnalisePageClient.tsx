"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { AnalysisData, fetchAnalysisPageData, getMonthInsight } from "@/lib/data/analysis";
import { Transaction } from "@/types/domain";
import { PageHeader } from "@/components/layout/PageHeader";
import { MonthSelector } from "./MonthSelector";
import { PersonFilter } from "./PersonFilter";
import { KpiCard } from "./KpiCard";
import { CategoryDonutChart } from "./CategoryDonutChart";
import { MonthlyEvolutionChart } from "./MonthlyEvolutionChart";
import { ComparativeBars } from "./ComparativeBars";
import { AnaliseTransactionsTable } from "./AnaliseTransactionsTable";
import { PivotTable } from "./PivotTable";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { addMonths, formatCurrencyBRL } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

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
  initialTransactions: Transaction[];
  initialInsight: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [personId, setPersonId] = useState(initialPersonId);
  const [data, setData] = useState(initialData);
  const [monthTransactions, setMonthTransactions] = useState(initialTransactions);
  const [insight, setInsight] = useState(initialInsight);
  const [isPending, startTransition] = useTransition();
  const [insightPending, startInsightTransition] = useTransition();
  const [tableView, setTableView] = useState<"pivot" | "flat">("pivot");

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

  const categoriesById = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name])), [data.categories]);
  const topExpenses = data.categoryBreakdown.slice(0, 5);

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

          <div className="inline-flex w-fit rounded-(--radius-md) bg-black/5 p-1">
            <button
              onClick={() => setTableView("pivot")}
              className={cn(
                "rounded-(--radius-sm) px-3.5 py-1.5 text-sm font-medium transition-colors",
                tableView === "pivot"
                  ? "bg-(--color-surface) text-(--color-text-primary) shadow-(--shadow-sm)"
                  : "text-(--color-text-secondary)"
              )}
            >
              Tabela dinâmica
            </button>
            <button
              onClick={() => setTableView("flat")}
              className={cn(
                "rounded-(--radius-sm) px-3.5 py-1.5 text-sm font-medium transition-colors",
                tableView === "flat"
                  ? "bg-(--color-surface) text-(--color-text-primary) shadow-(--shadow-sm)"
                  : "text-(--color-text-secondary)"
              )}
            >
              Todas as movimentações
            </button>
          </div>

          {tableView === "pivot" ? (
            <PivotTable
              transactions={monthTransactions}
              people={data.people}
              categories={data.categories}
              types={data.types}
            />
          ) : (
            <AnaliseTransactionsTable
              transactions={monthTransactions}
              people={data.people}
              categories={data.categories}
              types={data.types}
            />
          )}
        </div>
      )}
    </div>
  );
}
