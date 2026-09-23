"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { syncEstimatedExpenses } from "@/lib/data/estimates";
import { backfillInstallmentGroups } from "@/lib/data/installments";

/**
 * Roda uma vez por abertura do app: materializa os gastos estimados do mês atual + 2
 * em diante (e limpa os que viraram "mês da frente") e completa as parcelas futuras de
 * compras parceladas já lançadas. Feito no client via Server Action porque o render de
 * uma página não pode invalidar cache — só recarrega a tela se algo mudou.
 */
// Evita rodar duas vezes em paralelo (StrictMode em dev monta o efeito duas vezes),
// o que poderia inserir a mesma estimativa em dobro.
let started = false;

export function BackgroundSync() {
  const router = useRouter();

  useEffect(() => {
    if (started) return;
    started = true;
    Promise.all([syncEstimatedExpenses(), backfillInstallmentGroups()])
      .then(([estimates, installments]) => {
        const changed =
          (estimates.ok && (estimates.created > 0 || estimates.removed > 0)) ||
          (installments.ok && installments.created > 0);
        if (changed) router.refresh();
      })
      .catch(() => {});
  }, [router]);

  return null;
}
