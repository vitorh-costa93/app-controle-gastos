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
import { UnplannedCard } from "./UnplannedCard";
import { cn } from "@/lib/utils/cn";
import { CategoryChangesCard } from "./CategoryChangesCard";
import { PersonComparisonCard } from "./PersonComparisonCard";
import { TopExpensesCard } from "./TopExpensesCard";
import { AnaliseTransactionsTable } from "./AnaliseTransactionsTable";
import { PivotTable } from "./PivotTable";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useInterface } from "@/components/layout/InterfaceProvider";
import { ModernOverview } from "./ModernOverview";
import { addMonths } from "@/lib/utils/format";
import { ConferencePanel } from "./ConferencePanel";
import { conferenceScope, ConferenceFilters } from "./conference-scope";
import "./modern-analysis.css";

type AnalysisTab = "overview" | "analyses" | "conference" | "pivot" | "movements";
const TABS: { key: AnalysisTab; label: string }[] = [
  { key: "overview", label: "Visão geral" }, { key: "analyses", label: "Análises" },
  { key: "conference", label: "Conferência" }, { key: "pivot", label: "Tabela dinâmica" },
  { key: "movements", label: "Todas as movimentações" },
];

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
  const { isModern } = useInterface();
  const [tab, setTab] = useState<AnalysisTab>("overview");
  const [conferenceFilters, setConferenceFilters] = useState<ConferenceFilters>({ bank: "all", category: "all", includeProjected: false });
  const [detailScope, setDetailScope] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextTab = params.get("view");
    if (TABS.some((item) => item.key === nextTab)) setTab(nextTab as AnalysisTab);
    const bank = params.get("bank") ?? "all";
    setConferenceFilters({ bank: ["all", "none", "nubank", "picpay"].includes(bank) ? bank : "all", category: params.get("category") ?? "all", includeProjected: params.get("projected") === "1" });
    setDetailScope(params.get("scope") === "conference");
  }, []);
  function changeView(nextTab: AnalysisTab, filters = conferenceFilters, scoped = false) {
    setTab(nextTab); setConferenceFilters(filters); setDetailScope(scoped);
    const params = new URLSearchParams(window.location.search);
    params.set("view", nextTab); params.set("bank", filters.bank); params.set("category", filters.category);
    if (filters.includeProjected) params.set("projected", "1"); else params.delete("projected");
    if (scoped) params.set("scope", "conference"); else params.delete("scope");
    window.history.replaceState(null, "", `/analise?${params.toString()}`);
  }
  const [month, setMonth] = useState(initialMonth);
  const [personId, setPersonId] = useState(initialPersonId);
  const [data, setData] = useState(initialData);
  const [monthTransactions, setMonthTransactions] = useState(initialTransactions);
  const [insight, setInsight] = useState(initialInsight);
  const [pivotRefreshKey, setPivotRefreshKey] = useState(0);
  const [commitmentView, setCommitmentView] = useState<"composition" | "commitments">("composition");
  const [isPending, startTransition] = useTransition();
  const [insightPending, startInsightTransition] = useTransition();

  // Guarda contra corrida: se o usuário clicar em "próximo mês" várias vezes rápido,
  // só o resultado da navegação mais recente pode atualizar a tela.
  const requestIdRef = useRef(0);

  function navigate(nextMonth: string, nextPersonId: string) {
    setLoadError(null);
    setMonth(nextMonth);
    setPersonId(nextPersonId);

    const requestId = ++requestIdRef.current;

    startTransition(async () => {
      try {
        const { data: nextData, transactions: nextTransactions } = await fetchAnalysisPageData(nextMonth, nextPersonId || undefined);
        if (requestIdRef.current !== requestId) return;
        setData(nextData); setMonthTransactions(nextTransactions);
      } catch {
        if (requestIdRef.current === requestId) setLoadError("Não foi possível carregar este mês. Atualize para tentar novamente.");
      }
    });

    startInsightTransition(async () => {
      try {
        const nextInsight = await getMonthInsight(nextMonth, nextPersonId || undefined);
        if (requestIdRef.current !== requestId) return;
        setInsight(nextInsight);
      } catch {
        if (requestIdRef.current === requestId) setInsight("Insight indisponível neste momento.");
      }
    });

    const params = new URLSearchParams(window.location.search);
    params.set("month", nextMonth);
    if (nextPersonId) params.set("personId", nextPersonId); else params.delete("personId");
    window.history.replaceState(null, "", `/analise?${params.toString()}`);
  }

  // Recarrega o mês atual (ex.: depois de marcar lançamentos como planejados em "Fora do planejado").
  async function refreshCurrent() {
    const requestId = ++requestIdRef.current;
    const { data: nextData, transactions: nextTransactions } = await fetchAnalysisPageData(month, personId || undefined);
    if (requestIdRef.current !== requestId) return;
    setData(nextData);
    setMonthTransactions(nextTransactions);
    setPivotRefreshKey((key) => key + 1);
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


  const scopedMovements = conferenceScope(monthTransactions, conferenceFilters, personId).rows;
  const personName = data.people.find((person) => person.id === personId)?.name ?? "Casal";

  return (
    <div className={isModern ? "ma-page" : undefined}>
      {isModern ? <><div className="ma-page-toolbar"><MonthSelector month={month} onChange={(m) => navigate(m, personId)} isPending={isPending} /><span>{personId ? `Somente lançamentos de ${personName}` : "Visão consolidada do casal"}</span></div><div className="ma-navigation"><nav aria-label="Áreas da análise">{TABS.map((item) => <button key={item.key} type="button" aria-current={tab === item.key ? "page" : undefined} className={tab === item.key ? "is-active" : ""} onClick={() => changeView(item.key)}>{item.label}</button>)}</nav><PersonFilter people={data.people} personId={personId} onChange={(p) => navigate(month, p)} isPending={isPending} /></div></> : <><PageHeader
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
      </div></>}

      {loadError ? <div className="ma-panel" role="alert"><p>{loadError}</p><button type="button" className="ma-text-link" onClick={() => navigate(month, personId)}>Atualizar mês</button></div> : isModern && (isPending || data.month !== month) ? <div className="ma-panel ma-loading" role="status">Carregando dados de {personName}…</div> : !hasData && (!isModern || tab === "overview" || tab === "analyses") ? (
        <EmptyState title="Ainda não existem dados suficientes neste mês para uma análise confiável. Cadastre alguns lançamentos em Cadastro." />
      ) : (
        <div className={"flex min-w-0 flex-col gap-6 transition-opacity" + (isPending ? " opacity-60" : "")}>
          {isModern && tab === "overview" && <ModernOverview data={data} transactions={monthTransactions} month={month} personId={personId} onInspect={(bank, category, projected = false) => changeView("conference", { bank, category, includeProjected: projected })} />}
          {isModern && tab === "conference" && <ConferencePanel data={data} transactions={monthTransactions} month={month} personId={personId} filters={conferenceFilters} onFiltersChange={(filters) => changeView("conference", filters)} onChanged={refreshCurrent} onOpenMovements={() => changeView("movements", conferenceFilters, true)} onOpenPivot={() => changeView("pivot", conferenceFilters, true)} />}
          {(!isModern || tab === "analyses") && <>
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
            <div className="flex min-w-0 flex-col gap-3">
              <div className="inline-flex w-fit rounded-(--radius-md) bg-black/5 p-1" role="group" aria-label="Visão">
                {(
                  [
                    { key: "composition", label: "Fixo × variável" },
                    { key: "commitments", label: "Compromissos" },
                  ] as const
                ).map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    aria-pressed={commitmentView === v.key}
                    onClick={() => setCommitmentView(v.key)}
                    className={cn(
                      "rounded-(--radius-sm) px-3.5 py-1.5 text-sm font-medium transition-colors",
                      commitmentView === v.key
                        ? "bg-(--color-surface) text-(--color-text-primary) shadow-(--shadow-sm)"
                        : "text-(--color-text-secondary)"
                    )}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {/* O card cresce até o fim da linha, alinhando a base com "Fora do planejado". */}
              <div className="flex flex-1 flex-col [&>*]:flex-1">
                {commitmentView === "composition" ? (
                  <CompositionCard commitment={data.commitments[0]} />
                ) : (
                  <CommitmentsChart commitments={data.commitments} />
                )}
              </div>
            </div>
            <UnplannedCard
              key={`${month}|${personId}`}
              months={data.unplanned}
              byCategory={data.unplannedByCategory}
              categories={data.categories}
              occurrences={data.unplannedOccurrences}
              people={data.people}
              onSaved={refreshCurrent}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CategoryChangesCard changes={data.categoryChanges} categories={data.categories} />
            {!personId && <PersonComparisonCard summaries={data.personSummaries} people={data.people} />}
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

          </>}
          {isModern && detailScope && (tab === "movements" || tab === "pivot") && <div className="ma-scope-banner"><span>Escopo da conferência · {personName} · {conferenceFilters.bank === "all" ? "todos os bancos" : conferenceFilters.bank === "none" ? "sem banco" : conferenceFilters.bank === "nubank" ? "Nubank" : "PicPay"} · {conferenceFilters.category === "all" ? "todas as categorias" : data.categories.find((category) => category.id === conferenceFilters.category)?.name ?? "Sem categoria"} · {tab === "pivot" ? "lançamentos reais" : conferenceFilters.includeProjected ? "reais e projetados" : "somente reais"}</span><button type="button" onClick={() => changeView(tab)}>Limpar escopo</button><button type="button" onClick={() => changeView("conference")}>Voltar à conferência</button></div>}
          {(!isModern || tab === "movements") && <AnaliseTransactionsTable
            key={`${month}|${personId}|${detailScope ? JSON.stringify(conferenceFilters) : "all"}`}
            transactions={isModern && detailScope ? scopedMovements : monthTransactions}
            people={data.people}
            categories={data.categories}
            types={data.types}
            recurrenceRules={data.recurrenceRules}
            onChanged={refreshCurrent}
          />}

          {(!isModern || tab === "pivot") && <PivotTable key={isModern ? `modern|${personId}|${detailScope}` : "classic"} refreshKey={pivotRefreshKey} pageMonth={month} personId={personId} initialExpanded={isModern} scopedBank={isModern && detailScope ? conferenceFilters.bank : undefined} scopedCategory={isModern && detailScope ? conferenceFilters.category : undefined} scopeMonth={isModern && detailScope} people={data.people} categories={data.categories} types={data.types} />}
        </div>
      )}
    </div>
  );
}
