"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnalysisData, fetchAnalysisPageData } from "@/lib/data/analysis";
import { MonthlyOccurrence } from "@/types/domain";
import { MonthSelector } from "./MonthSelector";
import { PersonFilter } from "./PersonFilter";
import { PivotTable } from "./PivotTable";
import { useInterface } from "@/components/layout/InterfaceProvider";
import { ModernOverview } from "./ModernOverview";
import { addMonths } from "@/lib/utils/format";
import { ConferencePanel } from "./ConferencePanel";
import { ConferenceFilters } from "./conference-scope";
import { getPlanning } from "@/lib/data/planning";
import type { PlanningData } from "@/lib/planning";
import { PlanningEditor } from "./PlanningEditor";
import { InspectionDrawer } from "./InspectionDrawer";
import "./modern-analysis.css";

type AnalysisTab = "overview" | "conference" | "pivot";
const TABS: { key: AnalysisTab; label: string }[] = [
  { key: "overview", label: "Visão geral" },
  { key: "conference", label: "Conferência" },
  { key: "pivot", label: "Tabela dinâmica" },
];

export function AnalisePageClient({
  initialMonth,
  initialPersonId,
  initialData,
  initialTransactions,
}: {
  initialMonth: string;
  initialPersonId: string;
  initialData: AnalysisData;
  initialTransactions: MonthlyOccurrence[];
}) {
  const { isModern } = useInterface();
  const [tab, setTab] = useState<AnalysisTab>("overview");
  const [conferenceFilters, setConferenceFilters] = useState<ConferenceFilters>({ bank: "all", category: "all", includeProjected: false });
  const [detailScope, setDetailScope] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [planning, setPlanning] = useState<PlanningData | null>(null);
  const [planningError, setPlanningError] = useState(false);
  const [planningRetry, setPlanningRetry] = useState(0);
  const [planningMode, setPlanningMode] = useState<"limits" | "reserve" | null>(null);
  const [inspection, setInspection] = useState<ConferenceFilters | null>(null);
  useEffect(() => {
    if (!isModern) return;
    let active = true;
    setPlanningError(false);
    getPlanning().then((result) => { if (active) setPlanning(result); }).catch(() => { if (active) setPlanningError(true); });
    return () => { active = false; };
  }, [isModern, planningRetry]);
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
  const [pivotRefreshKey, setPivotRefreshKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Guarda contra corrida: se o usuário clicar em "próximo mês" várias vezes rápido,
  // só o resultado da navegação mais recente pode atualizar a tela.
  const requestIdRef = useRef(0);

  function navigate(nextMonth: string, nextPersonId: string) {
    setInspection(null); setPlanningMode(null);
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

  const personName = data.people.find((person) => person.id === personId)?.name ?? "Casal";

  return (
    <div className="ma-page">
      <div className="ma-page-toolbar"><MonthSelector month={month} onChange={(m) => navigate(m, personId)} isPending={isPending} /><span>{personId ? `Somente lançamentos de ${personName}` : "Visão consolidada do casal"}</span></div>
      <div className="ma-navigation"><nav aria-label="Áreas da análise">{TABS.map((item) => <button key={item.key} type="button" aria-current={tab === item.key ? "page" : undefined} className={tab === item.key ? "is-active" : ""} onClick={() => changeView(item.key)}>{item.label}</button>)}</nav><PersonFilter people={data.people} personId={personId} onChange={(p) => navigate(month, p)} isPending={isPending} /></div>

      {loadError ? <div className="ma-panel" role="alert"><p>{loadError}</p><button type="button" className="ma-text-link" onClick={() => navigate(month, personId)}>Atualizar mês</button></div> : (isPending || data.month !== month) ? <div className="ma-panel ma-loading" role="status">Carregando dados de {personName}…</div> : (
        <div className={"flex min-w-0 flex-col gap-6 transition-opacity" + (isPending ? " opacity-60" : "")}>
          {tab === "overview" && (planningError ? <div className="ma-panel" role="alert">Não foi possível carregar os limites e a reserva. <button className="ma-text-link" type="button" onClick={() => setPlanningRetry((v) => v + 1)}>Tentar novamente</button></div> : planning ? <ModernOverview data={data} transactions={monthTransactions} month={month} personId={personId} planning={planning} onEditPlanning={setPlanningMode} onInspect={(bank, category, projected = false) => setInspection({ bank, category, includeProjected: projected })} /> : <div className="ma-panel" role="status">Carregando visão do mês…</div>)}
          {planningMode && planning && <PlanningEditor key={`${planningMode}|${personId}|${month}`} mode={planningMode} data={planning} people={data.people} categories={data.categories} month={month} personId={personId} onSaved={setPlanning} onBalanceSaved={() => { void refreshCurrent(); }} onClose={() => setPlanningMode(null)} />}
          {inspection && <InspectionDrawer key={`${month}|${personId}|${inspection.bank}|${inspection.category}`} data={data} transactions={monthTransactions} month={month} personId={personId} filters={inspection} onClose={() => setInspection(null)} onChanged={refreshCurrent} onOpenPivot={() => { changeView("pivot", inspection, true); setInspection(null); }} />}
          {tab === "conference" && <ConferencePanel data={data} transactions={monthTransactions} month={month} personId={personId} filters={conferenceFilters} onFiltersChange={(filters) => changeView("conference", filters)} onChanged={refreshCurrent} onOpenPivot={() => changeView("pivot", conferenceFilters, true)} />}
          {detailScope && tab === "pivot" && <div className="ma-scope-banner"><span>Escopo da conferência · {personName} · {conferenceFilters.bank === "all" ? "todos os bancos" : conferenceFilters.bank === "none" ? "sem banco" : conferenceFilters.bank === "nubank" ? "Nubank" : "PicPay"} · {conferenceFilters.category === "all" ? "todas as categorias" : data.categories.find((category) => category.id === conferenceFilters.category)?.name ?? "Sem categoria"} · lançamentos reais</span><button type="button" onClick={() => changeView(tab)}>Limpar escopo</button><button type="button" onClick={() => changeView("conference")}>Voltar à conferência</button></div>}
          {tab === "pivot" && <PivotTable key={`modern|${personId}|${detailScope}`} refreshKey={pivotRefreshKey} pageMonth={month} personId={personId} initialExpanded scopedBank={detailScope ? conferenceFilters.bank : undefined} scopedCategory={detailScope ? conferenceFilters.category : undefined} scopeMonth={detailScope} people={data.people} categories={data.categories} types={data.types} />}
        </div>
      )}
    </div>
  );
}
