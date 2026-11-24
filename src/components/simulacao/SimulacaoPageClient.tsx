"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Person, TravelTrackerConfig } from "@/types/db";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Simulation, MonthSummary, SimulationPriceAlert, SimulationPriceSnapshot } from "@/types/domain";
import { buildScenarioComparison, calcSimulationInstallments, summarizeScenarioImpact } from "@/lib/domain/simulation";
import { accumulateBalance } from "@/lib/domain/finance";
import { StartingBalance } from "@/lib/data/settings";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { NewSimulationForm } from "./NewSimulationForm";
import { ScenarioList } from "./ScenarioList";
import { LeftoverComparisonChart, AccumulatedBalanceChart } from "./SimulationCharts";
import { BaseCaixinhaYield } from "./BaseCaixinhaYield";
import { ImpactSummaryCard } from "./ImpactSummaryCard";
import { BaseBudget, CashVsInstallmentSection, YieldParams, analyzeSimulation } from "./CashVsInstallmentSection";
import { PriceTrackingSection, TravelPartOverride } from "./PriceTrackingSection";
import { YieldAssumptionCard } from "./YieldAssumptionCard";
import { SimulationAssistantDrawer } from "./SimulationAssistantDrawer";
import type { AssistantFinancialContext } from "@/lib/data/simulation-chat";
import type { CdiRate } from "@/lib/data/cdi";
import { generateScenarioAiSummary } from "@/lib/data/simulation-analysis";
import { deleteSimulation, restoreSimulation } from "@/lib/data/simulations";
import { NotificationChannelsConfig, refreshSimulationPriceTracking } from "@/lib/data/price-tracking";
import { SimulationEditModal } from "./SimulationEditModal";
import { formatCurrencyBRL, formatMonthLabel } from "@/lib/utils/format";
import { computePurchaseFeasibility } from "@/lib/utils/best-purchase-date";
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
  const [showBudgetCharts, setShowBudgetCharts] = useState(false);
  const [showBaseProjection, setShowBaseProjection] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [travelOverrides, setTravelOverrides] = useState<Record<string, TravelPartOverride>>({});
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
  const rawSelectedSimulations = useMemo(
    () => simulations.filter((s) => selectedIds.includes(s.id)),
    [simulations, selectedIds]
  );

  // Aplica os switches independentes de Hospedagem e Voo + aeroporto selecionado em viagens
  const selectedSimulations = useMemo(() => {
    const out: Simulation[] = [];
    for (const sim of rawSelectedSimulations) {
      const meta = sim.bestOfferMeta;
      if (sim.category === "travel" && meta?.stayQuote) {
        const rawCfg = (sim.trackerConfig ?? {}) as Partial<TravelTrackerConfig>;
        const ov = travelOverrides[sim.id];
        const includeStay = ov ? ov.includeStay : rawCfg.includeStay !== false;
        const includeFlight = ov ? ov.includeFlight : rawCfg.includeFlight !== false;
        if (!includeStay && !includeFlight) continue;

        const flights = meta.flightQuotes ?? [];
        const activeOrigin = ov?.originAirport || meta.selectedFlightOrigin || flights[0]?.originAirport;
        const activeFlight = flights.find((f) => f.originAirport === activeOrigin) ?? flights[0];

        const cashCents =
          (includeStay ? meta.stayQuote.cashTotalCents : 0) +
          (includeFlight && activeFlight ? activeFlight.cashTotalCents : 0);
        const instTotalCents =
          (includeStay ? meta.stayQuote.installmentTotalCents : 0) +
          (includeFlight && activeFlight ? activeFlight.installmentTotalCents : 0);
        const instCount = includeStay
          ? meta.stayQuote.installments
          : activeFlight?.installments ?? sim.installments;

        out.push({
          ...sim,
          cashPriceCents: cashCents,
          totalAmountCents: instTotalCents,
          installments: Math.max(1, instCount),
          installmentAmountCents: Math.round(instTotalCents / Math.max(1, instCount)),
        });
      } else {
        out.push(sim);
      }
    }
    return out;
  }, [rawSelectedSimulations, travelOverrides]);

  const hasSelected = selectedSimulations.length > 0;
  const hasRawSelected = rawSelectedSimulations.length > 0;

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

  // Recorta o gráfico exatamente para o período de início e fim do pagamento das compras selecionadas
  const paymentPeriod = useMemo(() => {
    if (!hasSelected) return horizon;
    const months = selectedSimulations.flatMap((sim) => {
      const startM = sim.startDate.slice(0, 7);
      const instMonths = calcSimulationInstallments(sim).map((i) => i.referenceMonth);
      return [startM, ...instMonths];
    });
    if (months.length === 0) return horizon;
    months.sort();
    return { from: months[0], to: months[months.length - 1] };
  }, [hasSelected, selectedSimulations, horizon]);

  const paymentComparison = useMemo(
    () => comparison.filter((m) => m.referenceMonth >= paymentPeriod.from && m.referenceMonth <= paymentPeriod.to),
    [comparison, paymentPeriod]
  );

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

  const feasibilityFor = useCallback(
    (sim: Simulation) => computePurchaseFeasibility(sim, baseAccumulated),
    [baseAccumulated]
  );

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

  const assistantContext = useMemo<AssistantFinancialContext>(() => {
    const personObj = people.find((p) => p.id === personId);
    const avgLeftover =
      baseSummaries.length > 0
        ? Math.round(baseSummaries.reduce((acc, s) => acc + s.leftoverCents, 0) / baseSummaries.length)
        : 0;
    return {
      personLabel: personObj ? personObj.name : "Casal",
      currentReserveCents: effectiveStartingBalance?.amountCents ?? baseAccumulated[0]?.accumulatedCents ?? 0,
      averageMonthlyLeftoverCents: avgLeftover,
      horizonLabel: `${formatMonthLabel(horizon.from)} → ${formatMonthLabel(horizon.to)}`,
      cdiAnnualPercent,
      existingSimulations: simulations.map((s) => ({
        description: s.description,
        category: s.category,
        cashPriceCents: s.cashPriceCents,
        totalAmountCents: s.totalAmountCents,
        installments: s.installments,
      })),
    };
  }, [people, personId, baseSummaries, effectiveStartingBalance?.amountCents, baseAccumulated, horizon.from, horizon.to, cdiAnnualPercent, simulations]);

  function handleTravelOverrideChange(simId: string, patch: Partial<TravelPartOverride>) {
    setTravelOverrides((prev) => {
      const current = prev[simId] ?? { includeStay: true, includeFlight: true };
      return { ...prev, [simId]: { ...current, ...patch } };
    });
  }

  return (
    <div className={isModern ? "modern-simulation" : undefined}>
      <PageHeader
        title="Simulação"
        subtitle="Planeje suas próximas compras e viagens e veja o impacto no seu orçamento."
      />

      {(isModern || personId) && <div className="modern-simulation-person">
        {(isModern || personId) && <label>Pessoa <select value={personId} onChange={(event) => { const params = new URLSearchParams(searchParams.toString()); if (event.target.value) params.set("personId", event.target.value); else params.delete("personId"); router.push(`${pathname}${params.size ? `?${params}` : ""}`); }}><option value="">Casal</option>{people.filter((person) => person.name.trim().toLocaleLowerCase("pt-BR") !== "casal").map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
        {personId && <div><p>{individualBalances[personId] ? "Saldo inicial individual usado apenas nesta simulação." : "Saldo inicial individual não informado; projeção parte de zero."}</p><label htmlFor="individual-balance">Saldo inicial individual</label><CurrencyInput id="individual-balance" valueCents={individualBalances[personId] ?? 0} onChange={(amount) => setIndividualBalances((previous) => ({ ...previous, [personId]: amount }))} /></div>}
        <Button type="button" onClick={() => setShowAssistant(true)} className="ml-auto gap-1.5 px-3 py-1.5 text-xs">
          <Sparkles size={14} /> Assistente IA
        </Button>
      </div>}
      <div className="mb-5">
        <ScenarioList
          simulations={simulations}
          archived={archived}
          layout="grid"
          onAddNew={() => setShowNewModal(true)}
          onEdit={setEditing}
          onDelete={handleDelete}
          onRestore={handleRestore}
          onRefreshTrack={handleRefreshTrack}
          verdictFor={verdictFor}
          feasibilityFor={feasibilityFor}
          selectedIds={selectedIds}
          onToggle={toggleSimulation}
        />
      </div>

      {isModern && <div className="modern-simulation-layout">
        <section className="modern-simulation-main" aria-label="Resultados da simulação">
          {hasRawSelected ? (
            <>
              <PriceTrackingSection
                simulations={rawSelectedSimulations}
                snapshotsBySimId={snapshotsBySimId}
                alerts={alerts}
                notificationConfig={initialNotificationConfig}
                travelOverrides={travelOverrides}
                onTravelOverrideChange={handleTravelOverrideChange}
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
              {hasSelected ? (
                <>
                  <div className="modern-simulation-impact"><CashVsInstallmentSection simulations={selectedSimulations} params={yieldParams} base={base} /></div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBaseProjection((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3.5 py-1.5 text-xs font-semibold text-(--color-text-secondary) hover:bg-black/5"
                    >
                      {showBaseProjection ? (
                        <>
                          Ocultar projeção sem compras <ChevronUp size={14} />
                        </>
                      ) : (
                        <>
                          Ver projeção sem compras (Caixinha) <ChevronDown size={14} />
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBudgetCharts((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3.5 py-1.5 text-xs font-semibold text-(--color-text-secondary) hover:bg-black/5"
                    >
                      {showBudgetCharts ? (
                        <>
                          Ocultar evolução mensal do orçamento e impacto <ChevronUp size={14} />
                        </>
                      ) : (
                        <>
                          Ver evolução mensal do orçamento e impacto <ChevronDown size={14} />
                        </>
                      )}
                    </button>
                  </div>
                  {showBaseProjection && (
                    <Card className="p-5">
                      <h2 className="modern-simulation-title">Saldo acumulado projetado</h2>
                      <p className="modern-simulation-subtitle">Com base no que já está cadastrado, sem compras simuladas. Horizonte: {formatMonthLabel(horizon.from)} → {formatMonthLabel(horizon.to)}.</p>
                      <BaseCaixinhaYield summaries={baseSummaries} accumulated={baseAccumulated} cdiAnnualPercent={cdiAnnualPercent} onCdiAnnualPercent={setCdiAnnualPercent} percentOfCdi={percentOfCdi} onPercentOfCdi={setPercentOfCdi} horizon={horizon} />
                    </Card>
                  )}
                  {showBudgetCharts && (
                    <>
                      <Card className="p-5">
                        <h2 className="modern-simulation-title">Evolução do orçamento · {combinedTitle}</h2>
                        <p className="modern-simulation-subtitle">Período do pagamento: {formatMonthLabel(paymentPeriod.from)} → {formatMonthLabel(paymentPeriod.to)}{selectedSimulations.length > 1 ? ` · ${selectedSimulations.length} itens combinados` : ""}</p>
                        <h3 className="modern-simulation-chart-title">Saldo no final do mês</h3>
                        <LeftoverComparisonChart comparison={paymentComparison} />
                        <h3 className="modern-simulation-chart-title">Saldo acumulado</h3>
                        <AccumulatedBalanceChart comparison={paymentComparison} />
                      </Card>
                      {impact && <ImpactSummaryCard impact={impact} />}
                    </>
                  )}
                  {!hasCashVsInstallmentAi && (
                    <Card className="flex gap-3 bg-(--color-primary-soft)/40 p-4"><Sparkles size={18} className="mt-0.5 shrink-0 text-(--color-primary)" /><div><p className="mb-1 text-sm font-semibold text-(--color-primary)">Insight da IA</p>{aiLoading ? <p className="text-sm text-(--color-text-secondary)">Analisando cenário...</p> : <p className="text-sm text-(--color-text-secondary)">{aiSummary}</p>}</div></Card>
                  )}
                </>
              ) : (
                <Card className="p-5 text-sm text-(--color-text-secondary)">
                  Ligue pelo menos um componente acima (<b>Hospedagem</b> ou <b>Passagem Aérea</b>) para calcular o impacto financeiro.
                </Card>
              )}
            </>
          ) : (
            <Card className="p-5">
              <h2 className="modern-simulation-title">Saldo acumulado projetado</h2>
              <p className="modern-simulation-subtitle">Sem compras marcadas acima. Horizonte: {formatMonthLabel(horizon.from)} → {formatMonthLabel(horizon.to)}.</p>
              <BaseCaixinhaYield summaries={baseSummaries} accumulated={baseAccumulated} cdiAnnualPercent={cdiAnnualPercent} onCdiAnnualPercent={setCdiAnnualPercent} percentOfCdi={percentOfCdi} onPercentOfCdi={setPercentOfCdi} horizon={horizon} />
            </Card>
          )}
        </section>
        <aside className="modern-simulation-sidebar" aria-label="Premissas de rendimento">
          <YieldAssumptionCard cdi={effectiveCdi} percentOfCdi={percentOfCdi} onChange={setPercentOfCdi} />
        </aside>
      </div>}

      {showNewModal && (
        <Modal open onClose={() => setShowNewModal(false)} title="Nova simulação">
          <NewSimulationForm
            embedded
            cdiAnnualPercent={cdiAnnualPercent}
            percentOfCdi={percentOfCdi}
            onCreated={(sim) => {
              setSimulations((prev) => [sim, ...prev]);
              setSelectedIds((prev) => (prev.includes(sim.id) ? prev : [...prev, sim.id]));
              setShowNewModal(false);
            }}
          />
        </Modal>
      )}

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
      <SimulationAssistantDrawer
        open={showAssistant}
        onClose={() => setShowAssistant(false)}
        context={assistantContext}
        onScenarioCreated={(sim) => {
          setSimulations((prev) => [sim, ...prev]);
          setSelectedIds((prev) => (prev.includes(sim.id) ? prev : [...prev, sim.id]));
        }}
      />
    </div>
  );
}
