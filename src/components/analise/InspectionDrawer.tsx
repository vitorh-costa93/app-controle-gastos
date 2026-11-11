"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil, Search, X } from "lucide-react";
import type { AnalysisData } from "@/lib/data/analysis";
import type { MonthlyOccurrence, Transaction } from "@/types/domain";
import { getTransactionForEditing } from "@/lib/data/transactions";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { DescriptionIcon } from "@/components/ui/DescriptionIcon";
import { TransactionEditor } from "@/components/cadastro/TransactionEditor";
import { MovementDetailsDialog } from "./MovementDetailsDialog";
import { conferenceScope, type ConferenceFilters } from "./conference-scope";
import { formatCurrencyBRL, formatDateBR, formatMonthLabel } from "@/lib/utils/format";
import "./inspection-drawer.css";

export function InspectionDrawer({ data, transactions, month, personId, filters, onClose, onChanged, onOpenPivot, onOpenMovements }: {
  data: AnalysisData; transactions: MonthlyOccurrence[]; month: string; personId: string; filters: ConferenceFilters;
  onClose: () => void; onChanged: () => Promise<void>; onOpenPivot: () => void; onOpenMovements: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [projected, setProjected] = useState<MonthlyOccurrence | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const scope = conferenceScope(transactions, filters, personId);
  const categoryName = (id: string) => data.categories.find((c) => c.id === id)?.name ?? "Sem categoria";
  const bankName = filters.bank === "nubank" ? "Nubank" : filters.bank === "picpay" ? "PicPay" : "gastos";
  const title = filters.category !== "all" ? categoryName(filters.category) : bankName;
  const personName = data.people.find((p) => p.id === personId)?.name ?? "Casal";
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const rows = scope.rows.filter((row) => normalize(row.description ?? "").includes(normalize(query)));
  const groups = scope.categories.filter((c) => filters.category === "all" || c.id === filters.category).map((c) => ({ ...c, rows: rows.filter((r) => (r.categoryId ?? "none") === c.id) })).filter((c) => c.rows.length > 0);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.querySelector<HTMLButtonElement>(".ni-drawer header button")?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  async function edit(row: MonthlyOccurrence) {
    if (row.origin === "projected") { setProjected(row); return; }
    setError(""); setOpening(true);
    try { setTransaction(await getTransactionForEditing(row.id)); }
    catch { setError("Não foi possível abrir o lançamento. Tente novamente."); }
    finally { setOpening(false); }
  }
  async function changed() {
    setTransaction(null); setProjected(null);
    try { await onChanged(); } catch { setError("Alteração salva. Não foi possível atualizar os totais; atualize a página."); }
  }
  return <div className="ni-overlay" ref={root} onKeyDown={(event) => {
    if (event.key === "Escape" && !transaction && !projected && !opening) { event.stopPropagation(); onClose(); }
    if (event.key !== "Tab" || transaction || projected) return;
    const candidates = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length);
    const first = candidates[0], last = candidates[candidates.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <button type="button" className="ni-backdrop" tabIndex={-1} aria-label="Fechar conferência" onClick={() => { if (!transaction && !projected && !opening) onClose(); }} />
    <aside className="ni-drawer" role="dialog" aria-modal="true" aria-labelledby="ni-title" aria-busy={opening}>
      <header><div className="ni-title"><CategoryIcon name={filters.bank === "all" ? title : bankName} size={23} /><div><h2 id="ni-title">Conferir {title}</h2><p>{formatMonthLabel(month)} · {personName}</p></div></div><button type="button" aria-label="Fechar conferência" onClick={onClose} disabled={opening}><X size={20} /></button></header>
      <div className="ni-total"><strong>{formatCurrencyBRL(scope.totalCents)}</strong><p>Mês de referência · {filters.includeProjected ? "reais e projetados" : "somente reais"}</p><small>Não corresponde automaticamente ao fechamento da fatura.</small></div>
      <div className="ni-tools"><label><Search size={16} /><input aria-label="Buscar descrição na conferência" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar descrição…" /></label><button type="button" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(groups.map((g) => g.id)))}>{collapsed.size ? "Expandir" : "Recolher"} categorias</button></div>
      {query && <p className="ni-search-total" role="status">{rows.length} lançamentos encontrados · {formatCurrencyBRL(rows.reduce((sum, r) => sum + r.amountCents, 0))}</p>}
      {error && <p role="alert" className="ni-error">{error}</p>}
      <div className="ni-groups">{groups.map((group) => <section key={group.id} className="ni-group"><button className="ni-group-heading" type="button" aria-expanded={!collapsed.has(group.id)} onClick={() => setCollapsed((prior) => { const next = new Set(prior); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })}><CategoryIcon name={categoryName(group.id)} /><span>{categoryName(group.id)}</span><b>{formatCurrencyBRL(group.rows.reduce((sum, r) => sum + r.amountCents, 0))}</b><ChevronDown size={16} style={{ transform: collapsed.has(group.id) ? undefined : "rotate(180deg)" }} /></button>
        {!collapsed.has(group.id) && <ul>{group.rows.map((row) => <li key={row.id}><DescriptionIcon description={row.description ?? ""} categoryName={categoryName(group.id)} /><div><span>{row.description || "Sem descrição"}</span><small>{data.people.find((p) => p.id === row.personId)?.name ?? "Pessoa inativa"} · {formatDateBR(row.registrationDate)}{row.installmentTotal > 1 ? ` · ${row.installmentCurrent}/${row.installmentTotal}` : ""}{row.origin === "projected" ? " · Projetado" : ""}</small></div><b>{formatCurrencyBRL(row.amountCents)}</b><button type="button" disabled={opening} aria-label={`Editar ${row.description || "lançamento"}`} onClick={() => void edit(row)}><Pencil size={15} /></button></li>)}</ul>}
      </section>)}</div>
      {!groups.length && <p className="ni-empty">Nenhum lançamento encontrado neste escopo.</p>}
      <footer><span>Total do escopo<strong>{formatCurrencyBRL(scope.totalCents)}</strong></span><button type="button" onClick={onOpenPivot}>Abrir na tabela dinâmica</button><button type="button" onClick={onOpenMovements}>Ver todas as movimentações →</button></footer>
    </aside>
    {transaction && <TransactionEditor open transaction={transaction} people={data.people} categories={data.categories} types={data.types} recurrenceRules={data.recurrenceRules} onClose={() => setTransaction(null)} onSaved={() => void changed()} />}
    {projected && <MovementDetailsDialog occurrence={projected} rule={data.recurrenceRules.find((r) => r.id === projected.recurrenceRuleId)} people={data.people} categories={data.categories} types={data.types} onClose={() => setProjected(null)} onChanged={() => void changed()} />}
  </div>;
}
