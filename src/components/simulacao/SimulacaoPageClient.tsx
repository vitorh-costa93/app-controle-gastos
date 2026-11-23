"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Person } from "@/types/db";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Sparkles } from "lucide-react";
import { Simulation, MonthSummary, SimulationPriceAlert, SimulationPriceSnapshot } from "@/types/domain";
import { buildScenarioComparison, summarizeScenarioImpact } from "@/lib/domain/simulation";
import { accumulateBalance } from "@/lib/domain/finance";
import { StartingBalance } from "@/lib/data/settings";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { NewSimulationForm } from "./NewSimulationForm";
import { ScenarioList } from "./ScenarioList";
import { LeftoverComparisonChart, AccumulatedBalanceChart } from "./SimulationCharts";
import { BaseCaixinhaYield } from "./BaseCaixinhaYield";
import { ImpactSummaryCard } from "./ImpactSummaryCard";
import { BaseBudget, CashVsInstallmentSection, YieldParams, analyzeSimulation } from "./CashVsInstallmentSection";
import { PriceTrackingSection } from "./PriceTrackingSection";
import { YieldAssumptionCard } from "./YieldAssumptionCard";
import type { CdiRate } from "@/lib/data/cdi";
import { generateScenarioAiSummary } from "@/lib/data/simulation-analysis";
import { deleteSimulation, restoreSimulation } from "@/lib/data/simulations";
import { NotificationChannelsConfig, refreshSimulationPriceTracking } from "@/lib/data/price-tracking";
import { SimulationEditModal } from "./SimulationEditModal";
import { formatCurrencyBRL, formatMonthLabel } from "@/lib/utils/format";
import { useInterface } from "@/components/layout/InterfaceProvider";
import "./modern-simulation.css";

export function SimulacaoPageClient({
  initialSimulations,
  initialArchived,
  initialSnapshotsBySimId = {},
  initialAlerts = [],
  initialNotificationConfig = { browserPushEnabled: true, dropThresholdPercent: 4 },
  baseSummaries,
  horizon,
  startingBalance,
  cdi,
  people,
  personId,
}: {
  initialSimulations: Simulation[];
  initialArchived: Simulation[];
  initialSnapshotsBySimId?: Record<string, SimulationPriceSnapshot[]>;
  initialAlerts?: SimulationPriceAlert[];
  initialNotificationConfig?: NotificationChannelsConfig;
  baseSummaries: MonthSummary[];
  horizon: { from: string; to: string };
  startingBalance: StartingBalance | null;
  cdi: CdiRate;
  people: Person[];
  personId: string;
}) {
  const { isModern } = useInterface();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [individualBalances, setIndividualBalances] = useState<Record<string, number>>({});
  const effectiveStartingBalance = personId ? { month: undefined, amountCents: individualBalances[personId] ?? 0 } : startingBalance;
  const [tab, setTab] = useState<"projection" | "compare" | "saved">("projection");
  const [simulations, setSimulations] = useState(initialSimulations);
  const [archived, setArchived] = useState(initialArchived);
  const [snapshotsBySimId, setSnapshotsBySimId] = useState<Record<string, SimulationPriceSnapshot[]>>(initialSnapshotsBySimId);
  const [alerts, setAlerts] = useState<SimulationPriceAlert[]>(initialAlerts);
  const [editing, setEditing] = useState<Simulation | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    initialSimulations[0]?.id ? [initialSimulations[0].id] : []
  );
  const [percentOfCdi, setPercentOfCdi] = useState(100);
  const [cdiAnnualPercent, setCdiAnnualPercent] = useState(cdi.annualPercent);
  const effectiveCdi = useMemo<CdiRate>(
    () => (cdiAnnualPercent === cdi.annualPercent ? cdi : { ...cdi, annualPercent: cdiAnnualPercent }),
    [cdi, cdiAnnualPercent]
  );
  const [aiState, setAiState] = useState<{ key: string; summary: string } | null>(null);

  const baseMap = useMemo(() => new Map(baseSummaries.map((s) => [s.referenceMonth, s])), [baseSummaries]);
  const baseAccumulated = useMemo(
    () => accumulateBalance(baseSummaries, effectiveStartingBalance?.amountCents ?? 0, effectiveStartingBalance?.month),
    [baseSummaries, effectiveStartingBalance?.amountCents, effectiveStartingBalance?.month]
  );
  const selectedSimulations = useMemo(
    () => simulations.filter((s) => selectedIds.includes(s.id)),
    [simulations, selectedIds]
  );
  const hasSelected = selectedSimulations.length > 0;

  const comparison = useMemo(() => {
    if (!hasSelected) return [];
    return buildScenarioComparison(
      baseMap,
      selectedSimulations,
      horizon,
      effectiveStartingBalance?.amountCents ?? 0,
      effectiveStartingBalance?.month
    );
  }, [baseMap, hasSelected, selectedSimulations, horizon, effectiveStartingBalance?.amountCents, effectiveStartingBalance?.month]);

  const impact = useMemo(() => {
    if (!hasSelected) return null;
    return summarizeScenarioImpact(selectedSimulations, comparison);
  }, [hasSelected, selectedSimulations, comparison]);

  const yieldParams = useMemo<YieldParams>(
    () => ({ cdiAnnualPercent, percentOfCdi }),
    [cdiAnnualPercent, percentOfCdi]
  );

  const base = useMemo<BaseBudget>(
    () => ({ summaries: baseSummaries, accumulated: baseAccumulated }),
    [baseSummaries, baseAccumulated]
  );

  function verdictFor(sim: Simulation): { label: string; tone: "cash" | "installment" | "neutral" } | null {
    if (sim.cashPriceCents == null) return null;
    if (sim.installments <= 1) return { label: "Só à vista", tone: "neutral" };
    const r = analyzeSimulation(sim, yieldParams, base)?.result.installment;
    if (!r) return null;
    if (r.winner === "tie") return { label: "Tanto faz", tone: "neutral" };
    return r.winner === "cash"
      ? { label: `Parcelar custa +${formatCurrencyBRL(r.advantageCashCents)}`, tone: "cash" }
      : { label: `Parcelar ganha ${formatCurrencyBRL(-r.advantageCashCents)}`, tone: "installment" };
  }

  const hasCashVsInstallmentAi = useMemo(
    () => Boolean(hasSelected && analyzeSimulation(selectedSimulations, yieldParams, base)?.result.installment),
    [hasSelected, selectedSimulations, yieldParams, base]
  );

  const aiRequestKey = hasSelected && !hasCashVsInstallmentAi
    ? JSON.stringify({ personId, selectedSimulations, comparison, startingBalance: effectiveStartingBalance, horizon })
    : null;

  useEffect(() => {
    if (!hasSelected || !aiRequestKey) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      generateScenarioAiSummary(selectedSimulations, comparison).then((summary) => {
        if (!cancelled) setAiState({ key: aiRequestKey, summary });
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiRequestKey]);

  function toggleSimulation(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleDelete(sim: Simulation) {
    const result = await deleteSimulation(sim.id);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    setSimulations((prev) => prev.filter((s) => s.id !== sim.id));
    setSelectedIds((prev) => prev.filter((id) => id !== sim.id));
    setArchived((prev) => [{ ...sim, active: false }, ...prev]);
  }

  async function handleRestore(sim: Simulation) {
    const result = await restoreSimulation(sim.id);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    setArchived((prev) => prev.filter((s) => s.id !== sim.id));
    setSimulations((prev) => [{ ...sim, active: true }, ...prev]);
    setSelectedIds((prev) => (prev.includes(sim.id) ? prev : [...prev, sim.id]));
  }

  async function handleRefreshTrack(sim: Simulation) {
    const res = await refreshSimulationPriceTracking(sim.id);
    if (!res.ok) {
      window.alert(res.error);
      return;
    }
    setSimulations((prev) => prev.map((s) => (s.id === res.simulation.id ? res.simulation : s)));
    if (res.snapshot) {
      const snap = res.snapshot;
      setSnapshotsBySimId((prev) => ({
        ...prev,
        [snap.simulationId]: [...(prev[snap.simulationId] ?? []), snap],
      }));
    }
    if (res.alert) {
      const al = res.alert;
      setAlerts((prev) => [al, ...prev]);
    }
  }

  const aiSummary = aiState?.key === aiRequestKey ? aiState.summary : null;
  const aiLoading = hasSelected && aiState?.key !== aiRequestKey;
  const combinedTitle = selectedSimulations.map((s) => s.description).join(" + ");

  return (
    <div className={isModern ? "modern-simulation" : undefined}>
      <PageHeader
        title="Simulação"
        subtitle="Planeje suas próximas compras e viagens e veja o impacto no seu orçamento."
      />

      {(isModern || personId) && <div className="modern-simulation-person">
        {(isModern || personId) && <label>Pessoa <select value={personId} onChange={(event) => { const params = new URLSearchParams(searchParams.toString()); if (event.target.value) params.set("personId", event.target.value); else params.delete("personId"); router.push(`${pathname}${params.size ? `?${params}` : ""}`); }}><option value="">Casal</option>{people.filter((person) => person.name.trim().toLocaleLowerCase("pt-BR") !== "casal").map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
        {personId && <div><p>{individualBalances[personId] ? "Saldo inicial individual usado apenas nesta simulação." : "Saldo inicial individual não informado; projeção parte de zero."}</p><label htmlFor="individual-balance">Saldo inicial individual</label><CurrencyInput id="individual-balance" valueCents={individualBalances[personId] ?? 0} onChange={(amount) => setIndividualBalances((previous) => ({ ...previous, [personId]: amount }))} /></div>}
      </div>}
      {isModern && <nav className="modern-simulation-tabs" aria-label="Áreas da simulação">
        {([ ["projection", "Projeção do dinheiro"], ["compare", "Comparar compra"], ["saved", "Cenários salvos"] ] as const).map(([id, label]) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>{label}</button>)}
      </nav>}
      {isModern && <div className="modern-simulation-layout">
        <section className="modern-simulation-main" aria-label="Resultados da simulação">
          {tab === "projection" && <Card className="p-5">
            <h2 className="modern-simulation-title">Saldo acumulado projetado</h2>
            <p className="modern-simulation-subtitle">Com base no que já está cadastrado, sem compras simuladas. Horizonte: {formatMonthLabel(horizon.from)} → {formatMonthLabel(horizon.to)}.</p>
            <BaseCaixinhaYield summaries={baseSummaries} accumulated={baseAccumulated} cdiAnnualPercent={cdiAnnualPercent} onCdiAnnualPercent={setCdiAnnualPercent} percentOfCdi={percentOfCdi} onPercentOfCdi={setPercentOfCdi} horizon={horizon} />
          </Card>}
          {tab === "compare" && (hasSelected ? <>
            <PriceTrackingSection
              simulations={selectedSimulations}
              snapshotsBySimId={snapshotsBySimId}
              alerts={alerts}
              notificationConfig={initialNotificationConfig}
              onSimulationUpdated={(updated) => setSimulations((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))}
              onSnapshotAdded={(snap) =>
                setSnapshotsBySimId((prev) => ({
                  ...prev,
                  [snap.simulationId]: [...(prev[snap.simulationId] ?? []), snap],
                }))
              }
              onAlertAdded={(al) => setAlerts((prev) => [al, ...prev])}
              onAlertDismissed={(alertId) =>
                setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, readAt: new Date().toISOString() } : a)))
              }
            />
            <div className="modern-simulation-impact"><CashVsInstallmentSection simulations={selectedSimulations} params={yieldParams} base={base} /></div>
            <Card className="p-5">
              <h2 className="modern-simulation-title">Evolução do orçamento · {combinedTitle}</h2>
              <p className="modern-simulation-subtitle">{formatMonthLabel(horizon.from)} → {formatMonthLabel(horizon.to)}{selectedSimulations.length > 1 ? ` · ${selectedSimulations.length} compras combinadas` : ""}</p>
              <h3 className="modern-simulation-chart-title">Saldo no final do mês</h3>
              <LeftoverComparisonChart comparison={comparison} />
              <h3 className="modern-simulation-chart-title">Saldo acumulado</h3>
              <AccumulatedBalanceChart comparison={comparison} />
            </Card>
            {impact && <ImpactSummaryCard impact={impact} />}
            {!hasCashVsInstallmentAi && (
              <Card className="flex gap-3 bg-(--color-primary-soft)/40 p-4"><Sparkles size={18} className="mt-0.5 shrink-0 text-(--color-primary)" /><div><p className="mb-1 text-sm font-semibold text-(--color-primary)">Insight da IA</p>{aiLoading ? <p className="text-sm text-(--color-text-secondary)">Analisando cenário...</p> : <p className="text-sm text-(--color-text-secondary)">{aiSummary}</p>}</div></Card>
            )}
          </> : <Card className="p-5"><h2 className="modern-simulation-title">Compare uma compra</h2><p className="modern-simulation-subtitle">Crie ou marque uma ou mais simulações na lista ao lado para ver o impacto combinado no seu dinheiro guardado.</p></Card>)}
          {tab === "saved" && (simulations.length || archived.length ? <ScenarioList simulations={simulations} archived={archived} onEdit={setEditing} onDelete={handleDelete} onRestore={handleRestore} onRefreshTrack={handleRefreshTrack} verdictFor={verdictFor} selectedIds={selectedIds} onToggle={toggleSimulation} onOpen={(id) => { setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id])); setTab("compare"); }} /> : <Card className="p-5 text-sm">Nenhum cenário salvo ainda. Crie uma simulação em Comparar compra.</Card>)}
        </section>
        <aside className="modern-simulation-sidebar" aria-label="Configuração da simulação">
          {tab !== "saved" && <YieldAssumptionCard cdi={effectiveCdi} percentOfCdi={percentOfCdi} onChange={setPercentOfCdi} />}
          {tab !== "projection" && <NewSimulationForm cdiAnnualPercent={cdiAnnualPercent} percentOfCdi={percentOfCdi} onCreated={(sim) => { setSimulations((prev) => [sim, ...prev]); setSelectedIds((prev) => (prev.includes(sim.id) ? prev : [...prev, sim.id])); setTab("compare"); }} />}
          {tab === "compare" && (simulations.length > 0 || archived.length > 0) && <ScenarioList simulations={simulations} archived={archived} onEdit={setEditing} onDelete={handleDelete} onRestore={handleRestore} onRefreshTrack={handleRefreshTrack} verdictFor={verdictFor} selectedIds={selectedIds} onToggle={toggleSimulation} />}
        </aside>
      </div>}

      {editing && (
        <SimulationEditModal
          simulation={editing}
          cdiAnnualPercent={cdiAnnualPercent}
          percentOfCdi={percentOfCdi}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setSimulations((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
