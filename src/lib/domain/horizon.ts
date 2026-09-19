export interface SimulationHorizon {
  from: string;
  to: string;
}

/** Do mês atual até dezembro do ano seguinte — calculado dinamicamente, nunca fixo. */
export function getDefaultSimulationHorizon(): SimulationHorizon {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const to = `${now.getFullYear() + 1}-12`;
  return { from, to };
}
