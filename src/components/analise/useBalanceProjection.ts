"use client";

import { useCallback, useEffect, useState } from "react";
import { getSimulationBudget } from "@/lib/data/simulation-budget";
import { buildBalanceProjection, type AccumulatedBalancePoint, type SimulationBudget } from "@/lib/domain/balance-projection";
import type { CaixinhaProjection } from "@/lib/domain/cash-vs-installments";

type Result = {
  status: "loading" | "error" | "ready";
  budget: SimulationBudget | null;
  accumulated: AccumulatedBalancePoint[];
  projection: CaixinhaProjection | null;
};
type LoadState = Result & { version: number; attempt: number };
export type BalanceProjectionState = Result & { retry: () => void };

export function useBalanceProjection(personId: string, refreshKey: unknown, enabled = true): BalanceProjectionState {
  const [state, setState] = useState<LoadState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [inputs, setInputs] = useState({ personId, refreshKey, enabled, version: 0 });
  const changed = inputs.personId !== personId || !Object.is(inputs.refreshKey, refreshKey) || inputs.enabled !== enabled;
  const version = inputs.version + (changed ? 1 : 0);
  if (changed) setInputs({ personId, refreshKey, enabled, version });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    getSimulationBudget(personId || undefined).then(
      (budget) => {
        if (active) setState({ version, attempt, status: "ready", budget, ...buildBalanceProjection(budget) });
      },
      () => {
        if (active) setState({ version, attempt, status: "error", budget: null, accumulated: [], projection: null });
      },
    );
    return () => { active = false; };
  }, [personId, refreshKey, attempt, enabled, version]);

  if (!enabled || !state || state.version !== version || state.attempt !== attempt) {
    return { status: "loading", budget: null, accumulated: [], projection: null, retry };
  }
  return { status: state.status, budget: state.budget, accumulated: state.accumulated, projection: state.projection, retry };
}
