"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Simulation, MonthSummary } from "@/types/domain";
import { buildScenarioComparison, summarizeScenarioImpact } from "@/lib/domain/simulation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewSimulationForm } from "./NewSimulationForm";
import { ScenarioList } from "./ScenarioList";
import { LeftoverComparisonChart, AccumulatedBalanceChart } from "./SimulationCharts";
import { ImpactSummaryCard } from "./ImpactSummaryCard";
import { generateScenarioAiSummary } from "@/lib/data/simulation-analysis";
import { formatMonthLabel } from "@/lib/utils/format";

export function SimulacaoPageClient({
  initialSimulations,
  baseSummaries,
  horizon,
}: {
  initialSimulations: Simulation[];
  baseSummaries: MonthSummary[];
  horizon: { from: string; to: string };
}) {
  const [simulations, setSimulations] = useState(initialSimulations);
  const [primaryId, setPrimaryId] = useState<string | null>(initialSimulations[0]?.id ?? null);
  const [includeOthers, setIncludeOthers] = useState(false);
  const [selectedOtherIds, setSelectedOtherIds] = useState<string[]>([]);
  const [aiState, setAiState] = useState<{ key: string; summary: string } | null>(null);

  const baseMap = useMemo(() => new Map(baseSummaries.map((s) => [s.referenceMonth, s])), [baseSummaries]);
  const primary = simulations.find((s) => s.id === primaryId) ?? null;
  const others = useMemo(
    () =>
      includeOthers
        ? simulations.filter((s) => selectedOtherIds.includes(s.id) && s.id !== primaryId)
        : [],
    [includeOthers, simulations, selectedOtherIds, primaryId]
  );

  const comparison = useMemo(() => {
    if (!primary) return [];
    return buildScenarioComparison(baseMap, [primary, ...others], horizon);
  }, [baseMap, primary, others, horizon]);

  const impact = useMemo(() => {
    if (!primary) return null;
    return summarizeScenarioImpact(primary, comparison);
  }, [primary, comparison]);

  const aiRequestKey = primary
    ? `${primary.id}|${others.map((o) => o.id).join(",")}|${horizon.from}|${horizon.to}`
    : null;

  useEffect(() => {
    if (!primary || !aiRequestKey) return;
    let cancelled = false;
    generateScenarioAiSummary(primary, comparison).then((summary) => {
      if (!cancelled) setAiState({ key: aiRequestKey, summary });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiRequestKey]);

  const aiSummary = aiState?.key === aiRequestKey ? aiState.summary : null;
  const aiLoading = Boolean(primary) && aiState?.key !== aiRequestKey;

  return (
    <div>
      <PageHeader
        title="Simulação"
        subtitle="Planeje suas próximas compras e viagens e veja o impacto no seu orçamento."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col gap-6">
          {!primary ? (
            <EmptyState title="Crie uma simulação para descobrir como uma nova compra afetaria seu orçamento." />
          ) : (
            <>
              <Card className="p-5">
                {primary.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={primary.imageUrl}
                    alt=""
                    className="mb-4 h-40 w-full rounded-(--radius-lg) object-cover"
                  />
                )}
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold">{primary.description}</h3>
                  {others.length > 0 && (
                    <span className="text-xs text-(--color-text-tertiary)">Com outras simulações</span>
                  )}
                </div>
                <p className="mb-4 text-xs text-(--color-text-tertiary)">
                  Horizonte: {formatMonthLabel(horizon.from)} → {formatMonthLabel(horizon.to)}
                </p>

                <h4 className="mb-2 text-sm font-medium text-(--color-text-secondary)">Saldo no final do mês</h4>
                <LeftoverComparisonChart comparison={comparison} />

                <h4 className="mb-2 mt-6 text-sm font-medium text-(--color-text-secondary)">Saldo acumulado</h4>
                <AccumulatedBalanceChart comparison={comparison} />
              </Card>

              {impact && <ImpactSummaryCard impact={impact} />}

              <Card className="flex gap-3 bg-(--color-primary-soft)/40 p-4">
                <Sparkles size={18} className="mt-0.5 shrink-0 text-(--color-primary)" />
                <div className="flex-1">
                  <p className="mb-1 text-sm font-semibold text-(--color-primary)">Insight da IA</p>
                  {aiLoading ? (
                    <div className="space-y-2">
                      <div className="h-3 w-full animate-pulse rounded bg-black/10" />
                      <div className="h-3 w-2/3 animate-pulse rounded bg-black/10" />
                    </div>
                  ) : (
                    <p className="text-sm text-(--color-text-secondary)">{aiSummary}</p>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <NewSimulationForm
            onCreated={(sim) => {
              setSimulations((prev) => [sim, ...prev]);
              setPrimaryId(sim.id);
            }}
          />

          {simulations.length > 0 && (
            <ScenarioList
              simulations={simulations}
              primaryId={primaryId}
              onSelectPrimary={setPrimaryId}
              includeOthers={includeOthers}
              onIncludeOthersChange={setIncludeOthers}
              selectedOtherIds={selectedOtherIds}
              onToggleOther={(id) =>
                setSelectedOtherIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
