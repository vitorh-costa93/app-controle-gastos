"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { MonthlyOccurrence } from "@/types/domain";
import { defaultOrganization, targetForOccurrence, type PaymentOrganization } from "@/lib/domain/payments";
import { getPaymentOrganization, savePaymentOrganization } from "@/lib/data/payments";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { PaymentOrganizationFields } from "./PaymentOrganizationFields";

export function PaymentOrganizationDialog({ occurrences, onClose, onSaved }: { occurrences: MonthlyOccurrence[]; onClose: () => void; onSaved: () => void }) {
  const targets = useMemo(() => {
    const unique = new Map<string, NonNullable<ReturnType<typeof targetForOccurrence>>>();
    for (const occurrence of occurrences) {
      const target = targetForOccurrence(occurrence);
      if (target) unique.set(`${target.kind}:${target.id}:${target.month}`, target);
    }
    return [...unique.values()];
  }, [occurrences]);
  const [settings, setSettings] = useState<PaymentOrganization>(() => defaultOrganization(occurrences[0] ?? {}));
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"month" | "following">("month");
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    let active = true;
    if (!targets[0]) return;
    getPaymentOrganization(targets[0]).then((result) => {
      if (!active) return;
      if (result.ok) setSettings(result.settings); else { setError(result.error); setLoadFailed(true); }
      setLoading(false);
    }).catch(() => { if (active) { setError("Não foi possível carregar a organização."); setLoadFailed(true); setLoading(false); } });
    return () => { active = false; };
  }, [targets]);
  const valid = targets.length > 0 && occurrences.length <= 500 && occurrences.every((occurrence) => Boolean(targetForOccurrence(occurrence))) && (settings.dueDay === null || (Number.isInteger(settings.dueDay) && settings.dueDay >= 1 && settings.dueDay <= 31));
  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const card = settings.method === "nubank" || settings.method === "picpay";
        const normalized = card ? { ...settings, groupName: settings.method === "nubank" ? "Nubank" : "PicPay" } : settings;
        const result = await savePaymentOrganization({ targets, settings: normalized, scope });
        if (result.ok) onSaved(); else setError(result.error);
      } catch { setError("Não foi possível salvar a organização."); }
    });
  }
  return <Modal open title={`Organizar pagamentos (${occurrences.length})`} onClose={() => { if (!pending) onClose(); }}>
    <p className="mb-4 text-sm text-(--color-text-secondary)">A organização agrupa pagamentos e não altera o banco do lançamento. Em lote, as mesmas opções serão aplicadas aos selecionados.</p>
    {loading && targets.length > 0 ? <p role="status" className="text-sm">Carregando...</p> : <PaymentOrganizationFields value={settings} onChange={setSettings} disabled={pending || loading} />}
    <fieldset disabled={pending || loading} className="mt-4 flex flex-wrap gap-4 text-sm"><legend className="mb-2 text-xs font-medium">Aplicar</legend>
      <label><input type="radio" name="payment-scope" checked={scope === "month"} onChange={() => setScope("month")} /> Somente neste mês</label>
      <label><input type="radio" name="payment-scope" checked={scope === "following"} onChange={() => setScope("following")} /> Neste mês e seguintes</label>
    </fieldset>
    {occurrences.length > 500 && <p role="alert" className="mt-3 text-xs text-(--color-negative)">Selecione até 500 registros por lote.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-(--color-negative)">{error}</p>}
    <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" disabled={pending} onClick={onClose}>Cancelar</Button><Button disabled={loading || pending || !valid || loadFailed} onClick={save}>{pending ? "Salvando..." : "Salvar"}</Button></div>
  </Modal>;
}

