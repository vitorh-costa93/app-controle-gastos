"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, RefreshCw, Sparkles } from "lucide-react";
import { Simulation, MonthSummary } from "@/types/domain";
import { buildScenarioComparison, summarizeScenarioImpact } from "@/lib/domain/simulation";
import { accumulateBalance } from "@/lib/domain/finance";
import { StartingBalance } from "@/lib/data/settings";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { NewSimulationForm } from "./NewSimulationForm";
import { ScenarioList } from "./ScenarioList";
import { LeftoverComparisonChart, AccumulatedBalanceChart, BaseAccumulatedChart } from "./SimulationCharts";
import { ImpactSummaryCard } from "./ImpactSummaryCard";
import { generateScenarioAiSummary } from "@/lib/data/simulation-analysis";
import { regenerateSimulationImage } from "@/lib/data/simulations";
import { formatMonthLabel } from "@/lib/utils/format";

export function SimulacaoPageClient({
  initialSimulations,
  baseSummaries,
  horizon,
  startingBalance,
}: {
  initialSimulations: Simulation[];
  baseSummaries: MonthSummary[];
  horizon: { from: string; to: string };
  startingBalance: StartingBalance | null;
}) {
  const [simulations, setSimulations] = useState(initialSimulations);
  const [primaryId, setPrimaryId] = useState<string | null>(initialSimulations[0]?.id ?? null);
  const [includeOthers, setIncludeOthers] = useState(false);
  const [selectedOtherIds, setSelectedOtherIds] = useState<string[]>([]);
  const [aiState, setAiState] = useState<{ key: string; summary: string } | null>(null);

  const baseMap = useMemo(() => new Map(baseSummaries.map((s) => [s.referenceMonth, s])), [baseSummaries]);
  const baseAccumulated = useMemo(
    () => accumulateBalance(baseSummaries, startingBalance?.amountCents ?? 0, startingBalance?.month),
    [baseSummaries, startingBalance]
  );
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
    return buildScenarioComparison(
      baseMap,
      [primary, ...others],
      horizon,
      startingBalance?.amountCents ?? 0,
      startingBalance?.month
    );
  }, [baseMap, primary, others, horizon, startingBalance]);

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

  const [imagePendingId, setImagePendingId] = useState<string | null>(null);
  const [imageError, setImageError] = useState<{ id: string; message: string } | null>(null);
  const autoImageAttempted = useRef(new Set<string>());

  async function generateImage(id: string) {
    setImagePendingId(id);
    setImageError(null);
    const result = await regenerateSimulationImage(id);
    setImagePendingId((current) => (current === id ? null : current));
    if (result.ok) {
      setSimulations((prev) => prev.map((s) => (s.id === id ? { ...s, imageUrl: result.imageUrl } : s)));
    } else {
      setImageError({ id, message: result.error });
    }
  }

  // Simulações criadas quando a geração de imagem falhava ficaram só com o ícone —
  // tenta gerar a foto uma vez por visita quando a simulação principal não tem imagem.
  useEffect(() => {
    if (!primary || primary.imageUrl || autoImageAttempted.current.has(primary.id)) return;
    autoImageAttempted.current.add(primary.id);
    generateImage(primary.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary?.id, primary?.imageUrl]);

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
          <Card className="p-5">
            <h3 className="mb-1 text-[15px] font-semibold">Saldo acumulado projetado</h3>
            <p className="mb-4 text-xs text-(--color-text-tertiary)">
              Com base só no que já está cadastrado (sem nenhuma simulação de compra). Horizonte:{" "}
              {formatMonthLabel(horizon.from)} → {formatMonthLabel(horizon.to)}.
            </p>
            <BaseAccumulatedChart points={baseAccumulated} />
          </Card>

          {!primary ? (
            <Card className="p-5 text-center">
              <p className="text-sm text-(--color-text-secondary)">
                Crie uma simulação para descobrir como uma nova compra afetaria esse saldo.
              </p>
            </Card>
          ) : (
            <>
              <Card className="p-5">
                <div className="relative mb-4 h-48 w-full overflow-hidden rounded-(--radius-lg) bg-(--color-primary-soft) sm:h-56">
                  {primary.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={primary.imageUrl} alt={primary.description} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-(--color-primary)">
                      <ImageIcon size={28} className={imagePendingId === primary.id ? "animate-pulse" : ""} />
                      <span className="text-xs">
                        {imagePendingId === primary.id ? "Gerando imagem..." : "Sem imagem"}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => generateImage(primary.id)}
                    disabled={imagePendingId === primary.id}
                    className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-black/70 disabled:opacity-60"
                  >
                    <RefreshCw size={12} className={imagePendingId === primary.id ? "animate-spin" : ""} />
                    {primary.imageUrl ? "Gerar outra" : "Gerar imagem"}
                  </button>
                </div>
                {imageError?.id === primary.id && (
                  <p className="-mt-2 mb-3 text-xs text-(--color-negative)">{imageError.message}</p>
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
