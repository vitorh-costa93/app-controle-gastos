"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronDown, Pencil, Search, X } from "lucide-react";
import type { AnalysisData } from "@/lib/data/analysis";
import type { PlannedCostMonth } from "@/lib/data/simulation-analysis";
import { getTransactionForEditing } from "@/lib/data/transactions";
import type { MonthlyOccurrence, Transaction } from "@/types/domain";
import { DescriptionIcon } from "@/components/ui/DescriptionIcon";
import { TransactionEditor } from "@/components/cadastro/TransactionEditor";
import { MovementDetailsDialog } from "./MovementDetailsDialog";
import { formatCurrencyBRL, formatDateBR, formatMonthLabel } from "@/lib/utils/format";
import "./inspection-drawer.css";

export function PlannedCostsDrawer({
  item,
  data,
  personName,
  onClose,
  onChanged,
}: {
  item: PlannedCostMonth;
  data: AnalysisData;
  personName: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [projected, setProjected] = useState<MonthlyOccurrence | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  const categoryName = (id: string | null) =>
    (id ? data.categories.find((c) => c.id === id)?.name : undefined) ?? "Sem categoria";
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = normalize(query);

  const groups = [
    {
      id: "fixed",
      label: "Fixo (todo mês)",
      dotColor: "#1768fa",
      rows: item.fixedItems.filter((r) => normalize(r.description ?? "").includes(q)),
    },
    {
      id: "variable",
      label: "Parcelado / Variável",
      dotColor: "#ff9c32",
      rows: item.variableItems.filter((r) => normalize(r.description ?? "").includes(q)),
    },
  ].filter((g) => g.rows.length > 0);

  const filteredTotalCents = groups.reduce(
    (sum, g) => sum + g.rows.reduce((s, r) => s + r.amountCents, 0),
    0
  );
  const filteredCount = groups.reduce((sum, g) => sum + g.rows.length, 0);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.querySelector<HTMLButtonElement>(".ni-drawer header button")?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  async function edit(row: MonthlyOccurrence) {
    if (row.origin === "projected") {
      setProjected(row);
      return;
    }
    setError("");
    setOpening(true);
    try {
      setTransaction(await getTransactionForEditing(row.id));
    } catch {
      setError("Não foi possível abrir o lançamento. Tente novamente.");
    } finally {
      setOpening(false);
    }
  }

  async function changed() {
    setTransaction(null);
    setProjected(null);
    try {
      await onChanged();
    } catch {
      setError("Alteração salva. Não foi possível atualizar os totais; atualize a página.");
    }
  }

  return (
    <div
      className="ni-overlay"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !transaction && !projected && !opening) {
          event.stopPropagation();
          onClose();
        }
        if (event.key !== "Tab" || transaction || projected) return;
        const candidates = Array.from(
          root.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
          ) ?? []
        ).filter((el) => el.getClientRects().length);
        const first = candidates[0];
        const last = candidates[candidates.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <button
        type="button"
        className="ni-backdrop"
        tabIndex={-1}
        aria-label="Fechar custos do mês"
        onClick={() => {
          if (!transaction && !projected && !opening) onClose();
        }}
      />
      <aside className="ni-drawer" role="dialog" aria-modal="true" aria-labelledby="pc-drawer-title" aria-busy={opening}>
        <header>
          <div className="ni-title">
            <CalendarRange size={23} className="text-[#1768fa]" />
            <div>
              <h2 id="pc-drawer-title">Custos de {formatMonthLabel(item.referenceMonth)}</h2>
              <p>{personName} · Fixos e variáveis</p>
            </div>
          </div>
          <button type="button" aria-label="Fechar custos do mês" onClick={onClose} disabled={opening}>
            <X size={20} />
          </button>
        </header>

        <div className="ni-total">
          <strong>{formatCurrencyBRL(item.totalCents)}</strong>
          <p>
            Fixo: {formatCurrencyBRL(item.fixedCents)} · Parcelado / Variável: {formatCurrencyBRL(item.variableCents)}
          </p>
        </div>

        <div className="ni-tools">
          <label>
            <Search size={16} />
            <input
              aria-label="Buscar descrição nos custos do mês"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar descrição…"
            />
          </label>
          <button
            type="button"
            onClick={() =>
              setCollapsed(collapsed.size ? new Set() : new Set(groups.map((g) => g.id)))
            }
          >
            {collapsed.size ? "Expandir" : "Recolher"} grupos
          </button>
        </div>

        {query && (
          <p className="ni-search-total" role="status">
            {filteredCount} lançamentos encontrados · {formatCurrencyBRL(filteredTotalCents)}
          </p>
        )}
        {error && (
          <p role="alert" className="ni-error">
            {error}
          </p>
        )}

        <div className="ni-groups">
          {groups.map((group) => (
            <section key={group.id} className="ni-group">
              <button
                className="ni-group-heading"
                type="button"
                aria-expanded={!collapsed.has(group.id)}
                onClick={() =>
                  setCollapsed((prior) => {
                    const next = new Set(prior);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-xs"
                  style={{ backgroundColor: group.dotColor }}
                />
                <span>{group.label}</span>
                <b>{formatCurrencyBRL(group.rows.reduce((sum, r) => sum + r.amountCents, 0))}</b>
                <ChevronDown
                  size={16}
                  style={{ transform: collapsed.has(group.id) ? undefined : "rotate(180deg)" }}
                />
              </button>
              {!collapsed.has(group.id) && (
                <ul>
                  {group.rows.map((row) => {
                    const catName = categoryName(row.categoryId);
                    const person = data.people.find((p) => p.id === row.personId)?.name ?? "Pessoa inativa";
                    const tag = row.id.startsWith("estimate:")
                      ? " · Estimativa"
                      : row.origin === "projected"
                        ? " · Projetado"
                        : "";
                    return (
                      <li key={row.id}>
                        <DescriptionIcon description={row.description ?? ""} categoryName={catName} />
                        <div>
                          <span>{row.description || "Sem descrição"}</span>
                          <small>
                            {person} · {catName} · {formatDateBR(row.registrationDate)}
                            {row.installmentTotal > 1
                              ? ` · Parcela ${row.installmentCurrent}/${row.installmentTotal}`
                              : ""}
                            {tag}
                          </small>
                        </div>
                        <b>{formatCurrencyBRL(row.amountCents)}</b>
                        <button
                          type="button"
                          disabled={opening}
                          aria-label={`Editar ${row.description || "lançamento"}`}
                          onClick={() => void edit(row)}
                        >
                          <Pencil size={15} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>

        {!groups.length && <p className="ni-empty">Nenhum gasto encontrado neste mês.</p>}

        <footer>
          <span>
            Fixo (todo mês)
            <strong>{formatCurrencyBRL(item.fixedCents)}</strong>
          </span>
          <span>
            Parcelado / Variável
            <strong>{formatCurrencyBRL(item.variableCents)}</strong>
          </span>
        </footer>
      </aside>

      {transaction && (
        <TransactionEditor
          open
          transaction={transaction}
          people={data.people}
          categories={data.categories}
          types={data.types}
          recurrenceRules={data.recurrenceRules}
          onClose={() => setTransaction(null)}
          onSaved={() => void changed()}
        />
      )}
      {projected && (
        <MovementDetailsDialog
          occurrence={projected}
          rule={data.recurrenceRules.find((r) => r.id === projected.recurrenceRuleId)}
          people={data.people}
          categories={data.categories}
          types={data.types}
          onClose={() => setProjected(null)}
          onChanged={() => void changed()}
        />
      )}
    </div>
  );
}
