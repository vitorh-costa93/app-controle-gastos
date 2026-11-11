"use client";

import Image from "next/image";
import { useBalanceProjection } from "./useBalanceProjection";
import { EmergencyReserve } from "./EmergencyReserve";
import { getBrandIcon } from "@/lib/brand-icons";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Pencil, Wallet, Wifi } from "lucide-react";
import type { AnalysisData } from "@/lib/data/analysis";
import type { MonthlyOccurrence } from "@/types/domain";
import { getCategoryLimit, type PlanningData } from "@/lib/planning";
import { formatCurrencyBRL } from "@/lib/utils/format";
import { MonthlyPaymentsPanel } from "@/components/payments/MonthlyPaymentsPanel";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { AdaptiveAmount } from "@/components/ui/AdaptiveAmount";
import { DescriptionIcon } from "@/components/ui/DescriptionIcon";
import { BalanceEvolution } from "./BalanceEvolution";
import "./nosso-mes.css";

const colors = ["#397ff4", "#24c65a", "#f56e92", "#ff9c32", "#a668f5", "#16a6b5", "#e56f47", "#78849e"];
const money = formatCurrencyBRL;

export function ModernOverview({ data, transactions, month, personId, onInspect, planning, onEditPlanning }: {
  data: AnalysisData; transactions: MonthlyOccurrence[]; month: string; personId: string;
  onInspect: (bank: string, category: string, projected?: boolean) => void;
  planning: PlanningData; onEditPlanning: (mode: "limits" | "reserve") => void;
}) {
  const summary = data.currentSummary;
  const people = data.people.filter((person) => !personId || person.id === personId);
  const personIds = people.map((person) => person.id);
  const personName = data.people.find((person) => person.id === personId)?.name ?? "Casal";
  const categories = new Map(data.categories.map((category) => [category.id, category.name]));
  const breakdown = [...data.categoryBreakdown].sort((a, b) => b.amountCents - a.amountCents);
  const totalForRing = breakdown.reduce((sum, category) => sum + Math.max(0, category.amountCents), 0);
  const expenses = transactions.filter((item) => item.considered && item.direction === "expense");
  const recurrences = expenses.filter((item) => item.recurrenceRuleId).sort((a, b) => a.registrationDate.localeCompare(b.registrationDate)).slice(0, 4);
  const balance = useBalanceProjection(personId, data);
  const essential = expenses.filter((item) => item.categoryId && planning.reserveConfig.essentialCategoryIds.includes(item.categoryId)).reduce((sum, item) => sum + item.amountCents, 0);
  let offset = 0;

  return <div className="nm-overview">
    <section className="nm-panel nm-month">
      <h2>O mês, por pessoa</h2>
      <div className="nm-totals">
        <div><span className="nm-total-icon nm-income"><ArrowUpRight size={19} /></span><span>Entradas<strong>{money(summary.incomeCents)}</strong></span></div>
        <div><span className="nm-total-icon nm-expense"><ArrowDownLeft size={19} /></span><span>Gastos<strong>{money(summary.expenseCents)}</strong></span></div>
        <div><span className="nm-total-icon nm-left"><Wallet size={19} /></span><span>{summary.leftoverCents < 0 ? "Déficit do mês" : "Sobra do mês"}<strong className={summary.leftoverCents < 0 ? "nm-negative" : undefined}>{money(summary.leftoverCents)}</strong></span></div>
      </div>
      <div className="nm-person-table" role="table" aria-label="Resumo por pessoa">
        <div className="nm-person-row nm-person-head" role="row"><span role="columnheader">Pessoa</span><span role="columnheader">Entradas</span><span role="columnheader">Gastos</span><span role="columnheader">Sobra</span></div>
        {people.map((person) => { const entry = data.personSummaries.find((item) => item.personId === person.id); const income = entry?.incomeCents ?? 0; const expense = entry?.expenseCents ?? 0; return <div className="nm-person-row" role="row" key={person.id}><span role="cell" className="nm-person-name"><i style={{ color: person.color, backgroundColor: `${person.color}20` }}>{person.initials}</i>{person.name}</span><span role="cell">{money(income)}</span><span role="cell">{money(expense)}</span><strong role="cell" className={income - expense < 0 ? "nm-negative" : "nm-positive"}>{money(income - expense)}</strong></div>; })}
      </div>
    </section>

    <section className="nm-panel nm-distribution">
      <div className="nm-heading"><div><h2>Distribuição dos gastos</h2><p>Todos os pagamentos · reais e projetados</p></div><button type="button" className="nm-link" onClick={() => onEditPlanning("limits")}><Pencil size={15} /> Editar limites</button></div>
      {breakdown.length ? <div className="nm-distribution-content">
        <div className="nm-ring"><svg viewBox="0 0 120 120" role="group" aria-label="Distribuição dos gastos por categoria"><circle cx="60" cy="60" r="46" fill="none" stroke="#e8ebf2" strokeWidth="13" />{breakdown.map((category, index) => { const part = totalForRing ? Math.max(0, category.amountCents) / totalForRing * 100 : 0; const start = offset; offset += part; const name = category.categoryId ? categories.get(category.categoryId) ?? "Categoria inativa" : "Sem categoria"; return <circle key={category.categoryId ?? "none"} cx="60" cy="60" r="46" fill="none" stroke={colors[index % colors.length]} strokeWidth="13" pathLength="100" strokeDasharray={`${part} ${100 - part}`} strokeDashoffset={-start} transform="rotate(-90 60 60)" role="button" tabIndex={0} aria-label={`${name}: ${money(category.amountCents)}. Ver lançamentos`} onClick={() => onInspect("all", category.categoryId ?? "none", true)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onInspect("all", category.categoryId ?? "none", true); } }} />; })}</svg><div><span>Gastos no mês</span><AdaptiveAmount value={money(summary.expenseCents)} /></div></div>
        <div className="nm-categories">{breakdown.map((category, index) => { const name = category.categoryId ? categories.get(category.categoryId) ?? "Categoria inativa" : "Sem categoria"; const limit = category.categoryId ? getCategoryLimit(planning, personIds, category.categoryId, month) : null; return <button type="button" className="nm-category" key={category.categoryId ?? "none"} onClick={() => onInspect("all", category.categoryId ?? "none", true)}><CategoryIcon name={name} size={17} /><span className="nm-category-name">{name}</span><span className="nm-percent">{Math.round(category.percent)}%</span><span className="nm-category-limit">{limit !== null && <span className="nm-progress"><i style={{ width: `${limit > 0 ? Math.min(100, Math.max(0, category.amountCents / limit * 100)) : 0}%`, background: colors[index % colors.length] }} /></span>}</span><span className="nm-category-amount"><b>{money(category.amountCents)}</b>{limit !== null && <><span> / {money(limit)}</span>{category.amountCents > limit && <em>{money(category.amountCents - limit)} acima</em>}</>}</span><ChevronRight size={16} /></button>; })}</div>
      </div> : <p className="nm-empty">Nenhum gasto considerado neste mês.</p>}
      <div className="nm-caption">Limites mensais por pessoa · clique na categoria para ver os lançamentos.</div>
    </section>

    <div className="nm-pair"><section className="nm-panel"><div className="nm-heading"><div><h2>Cartões</h2><p>Mês de referência · reais e projetados</p></div></div><div className="nm-banks">{(["nubank", "picpay"] as const).map((bank) => { const bankItems = expenses.filter((item) => item.bank === bank); const total = bankItems.reduce((sum, item) => sum + item.amountCents, 0); return <button type="button" className="nm-bank" key={bank} onClick={() => onInspect(bank, "all", true)}><span className={`nm-bank-art nm-bank-${bank}`}><span className="nm-chip" /><Wifi className="nm-contactless" size={20} aria-hidden="true" /><Image src={getBrandIcon(bank)!.src} alt={bank === "nubank" ? "Nubank" : "PicPay"} width={78} height={34} className="nm-bank-logo" /></span><b>{bank === "nubank" ? "Nubank" : "PicPay"}</b><strong>{money(total)}</strong>{people.map((person) => <span className="nm-bank-person" key={person.id}>{person.name}<span>{money(bankItems.filter((item) => item.personId === person.id).reduce((sum, item) => sum + item.amountCents, 0))}</span></span>)}<span className="nm-bank-action">Conferir compras <ChevronRight size={14} /></span></button>; })}</div><p className="nm-footnote">Totais já incluídos nos gastos.</p></section>
      <section className="nm-panel"><div className="nm-heading"><div><h2>Recorrências do mês</h2><p>Reais e projetadas · já incluídas nos gastos</p></div></div>{recurrences.length ? <div className="nm-recurrences">{recurrences.map((item) => { const name = item.categoryId ? categories.get(item.categoryId) ?? "Categoria inativa" : "Sem categoria"; return <button type="button" key={item.id} onClick={() => onInspect("all", item.categoryId ?? "none", true)}><DescriptionIcon description={item.description ?? ""} categoryName={name} size={18} /><span><b>{item.description || "Recorrência"}</b><small>{data.people.find((person) => person.id === item.personId)?.name ?? "Pessoa"} · {name}{item.origin === "projected" ? " · projetada" : ""}</small></span><strong>{money(item.amountCents)}</strong></button>; })}</div> : <p className="nm-empty">Nenhuma recorrência considerada neste mês.</p>}</section></div>

    <EmergencyReserve balance={balance} essential={essential} targetMonths={planning.reserveConfig.targetMonths} targetAmountCents={planning.reserveConfig.targetAmountCents} month={month} personId={personId} onEdit={() => onEditPlanning("reserve")} />
    <div className="nm-lower"><MonthlyPaymentsPanel key={`${month}|${personId}`} month={month} personId={personId} personName={personName} /><BalanceEvolution summaries={data.summaries} month={month} personId={personId} shared={balance} /></div>
  </div>;
}
