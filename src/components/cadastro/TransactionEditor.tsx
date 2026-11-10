"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useInterface } from "@/components/layout/InterfaceProvider";
import { RecurrenceFrequency } from "@/types/domain";
import { RECURRENCE_FREQUENCIES } from "@/lib/domain/recurrence";
import { Bank, Person, Category, TransactionType } from "@/types/db";
import { Transaction, RecurrenceRule } from "@/types/domain";
import { createTransaction, updateTransaction, deleteTransaction, checkManualTransactionDuplicates, type ManualDuplicateResult, TransactionInput } from "@/lib/data/transactions";
import { defaultOrganization, type PaymentOrganization } from "@/lib/domain/payments";
import { getPaymentOrganization, savePaymentOrganization } from "@/lib/data/payments";
import { PaymentOrganizationFields } from "@/components/payments/PaymentOrganizationFields";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Select } from "@/components/ui/Field";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { toISODate, toReferenceMonth, formatCurrencyBRL, formatDateBR } from "@/lib/utils/format";

type SaveState = "idle" | "saving" | "saved" | "error";

type TransactionEditorProps = {
  open: boolean;
  onClose: () => void;
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  transaction?: Transaction | null;
  recurrenceRules: RecurrenceRule[];
  onSaved?: (t: Transaction) => void;
};

export function TransactionEditor(props: TransactionEditorProps) {
  // Cada abertura tem sua própria sessão, inclusive após sucesso ou gravação parcial.
  return props.open ? <TransactionEditorSession key={props.transaction?.id ?? "new"} {...props} /> : null;
}

function TransactionEditorSession({ open, onClose, people, categories, types, transaction, recurrenceRules, onSaved }: TransactionEditorProps) {
  const { isModern } = useInterface();
  const router = useRouter();
  const today = new Date();
  const [form, setForm] = useState(() => buildInitialForm(transaction, today, people, recurrenceRules));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [payment, setPayment] = useState<PaymentOrganization>(() => defaultOrganization({ bank: transaction?.bank ?? null, description: transaction?.description ?? null }));
  const [paymentDirty, setPaymentDirty] = useState(false);
  const [paymentScope, setPaymentScope] = useState<"month" | "following">(!transaction ? "following" : "month");
  const [paymentLoad, setPaymentLoad] = useState<{ month: string; error: string | null } | null>(null);
  const [paymentRetry, setPaymentRetry] = useState(0);
  const [committed, setCommitted] = useState<{ transaction: Transaction; settings: PaymentOrganization; month: string; scope: "month" | "following" } | null>(null);
  const paymentRequest = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const paymentMonth = form.referenceMonth;
  const isExpense = form.direction === "expense";
  const hasSavedExpense = transaction?.direction === "expense";
  const effectivePayment = !hasSavedExpense && !paymentDirty ? defaultOrganization({ bank: form.bank || null, description: form.description || null }) : payment;
  const paymentLoading = Boolean(isExpense && hasSavedExpense && !paymentDirty && paymentLoad?.month !== paymentMonth);
  useEffect(() => {
    const request = paymentRequest;
    const id = ++request.current;
    if (!isExpense || !transaction || !hasSavedExpense || paymentDirty) return;
    void getPaymentOrganization({ kind: "transaction", id: transaction.id, month: paymentMonth })
      .then((result) => {
        if (id !== request.current) return;
        if (result.ok) setPayment(result.settings);
        setPaymentLoad({ month: paymentMonth, error: result.ok ? null : result.error });
      })
      .catch(() => { if (id === request.current) setPaymentLoad({ month: paymentMonth, error: "Não foi possível carregar a organização." }); });
    return () => { ++request.current; };
  }, [transaction, isExpense, hasSavedExpense, paymentMonth, paymentDirty, paymentRetry]);
  const [duplicateState, setDuplicateState] = useState<ManualDuplicateResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [retry, setRetry] = useState(0);
  const requestId = useRef(0);
  const saveLock = useRef(false);
  const duplicateInput = {
    personId: form.personId, bank: form.bank || null, direction: form.direction,
    amountCents: form.amountCents, registrationDate: form.registrationDate,
    referenceMonth: form.referenceMonth, description: form.description,
    installmentCurrent: form.installmentCurrent, installmentTotal: form.installmentTotal,
    fixedVariable: form.fixedVariable, excludeId: transaction?.id ?? null,
  };
  const snapshot = JSON.stringify({ ...form, ...duplicateInput, payment: effectivePayment, paymentScope });
  const currentSnapshot = useRef(snapshot);
  currentSnapshot.current = snapshot;
  const validDuplicateInput = Boolean(form.personId && form.amountCents > 0 && /^\d{4}-\d{2}-\d{2}$/.test(form.registrationDate) &&
    /^\d{4}-\d{2}$/.test(form.referenceMonth) && form.description.trim() && form.installmentCurrent > 0 &&
    form.installmentTotal >= form.installmentCurrent);
  useEffect(() => {
    const id = ++requestId.current;
    if (!open || !validDuplicateInput) return;
    const timer = setTimeout(async () => {
      const result = await safeCheckDuplicates(JSON.parse(snapshot));
      if (mounted.current && requestId.current === id) { setDuplicateState(result); setResultSnapshot(snapshot); }
    }, 500);
    return () => { clearTimeout(timer); };
  }, [open, snapshot, validDuplicateInput, retry]);
  // O estado pertence sempre ao snapshot que o produziu; mudanças escondem resultados imediatamente.
  const [resultSnapshot, setResultSnapshot] = useState(snapshot);
  const visibleResult = resultSnapshot === snapshot ? duplicateState : null;


  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaveState("idle");
  }

  function handleSave(confirmed?: "matches" | "error") {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaveState("saving");
    setErrorMessage(null);

    const input: TransactionInput = {
      bank: form.bank || null,
      registrationDate: form.registrationDate,
      referenceMonth: form.referenceMonth,
      personId: form.personId,
      direction: form.direction,
      fixedVariable: form.fixedVariable,
      typeId: form.typeId || null,
      categoryId: form.categoryId || null,
      installmentCurrent: form.installmentCurrent,
      installmentTotal: form.installmentTotal,
      amountCents: form.amountCents,
      description: form.description || null,
      considered: form.considered,
      fixedEndDate: form.fixedEndMonth ? `${form.fixedEndMonth}-01` : null,
      fixedFrequency: form.fixedFrequency,
    };

    const saveSnapshot = snapshot;
    const previous = visibleResult;
    ++requestId.current;
    startTransition(async () => {
      const checked = await safeCheckDuplicates(JSON.parse(saveSnapshot));
      if (!mounted.current) return;
      if (currentSnapshot.current !== saveSnapshot) {
        saveLock.current = false;
        setSaveState("idle");
        return;
      }
      setDuplicateState(checked);
      setResultSnapshot(saveSnapshot);
      const sameMatches = previous?.ok && checked.ok &&
        JSON.stringify(previous.matches.map((m) => m.id).sort()) === JSON.stringify(checked.matches.map((m) => m.id).sort());
      const needsConfirmation = checked.ok ? checked.matches.length > 0 && !(confirmed === "matches" && sameMatches)
        : !(confirmed === "error" && previous && !previous.ok);
      if (needsConfirmation) {
        saveLock.current = false;
        setSaveState("idle");
        return;
      }
      let result: Awaited<ReturnType<typeof createTransaction>>;
      try {
        result = transaction ? await updateTransaction(transaction.id, input) : await createTransaction(input);
      } catch {
        if (!mounted.current) return;
        saveLock.current = false;
        setSaveState("error");
        setErrorMessage("Não foi possível confirmar o salvamento. Verifique os lançamentos existentes antes de tentar novamente.");
        return;
      }
      if (!mounted.current) return;
      if (!result.ok) {
        saveLock.current = false;
        setSaveState("error");
        setErrorMessage(result.error);
        return;
      }
      if (isExpense && paymentDirty) {
        const pending = { transaction: result.data, settings: effectivePayment, month: form.referenceMonth, scope: paymentScope };
        setCommitted(pending);
        const saved = await persistPayment(pending);
        if (!saved) return;
      }
      finishSave(result.data);
    });
  }

  async function persistPayment(pending: NonNullable<typeof committed>): Promise<boolean> {
    try {
      const result = await savePaymentOrganization({ targets: [{ kind: "transaction", id: pending.transaction.id, month: pending.month }], settings: pending.settings, scope: pending.scope });
      if (!mounted.current) return false;
      if (result.ok) return true;
      setErrorMessage(result.error);
    } catch {
      if (!mounted.current) return false;
      setErrorMessage("Não foi possível salvar a organização.");
    }
    setSaveState("error");
    saveLock.current = false;
    onSaved?.(pending.transaction);
    router.refresh();
    return false;
  }

  function finishSave(saved: Transaction) {
    setSaveState("saved");
    onSaved?.(saved);
    router.refresh();
    setTimeout(() => { if (mounted.current) onClose(); }, 500);
  }

  function retryPayment() {
    if (!committed || saveLock.current) return;
    saveLock.current = true;
    setSaveState("saving");
    startTransition(async () => {
      if (await persistPayment(committed)) finishSave(committed.transaction);
    });
  }

  function handleDelete() {
    if (!transaction) return;
    startDeleteTransition(async () => {
      const result = await deleteTransaction(transaction.id);
      if (!mounted.current) return;
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      onClose();
    });
  }

  const missingFields = [
    form.amountCents <= 0 && "valor",
    !form.personId && "origem",
    !form.registrationDate && "data de cadastro",
    form.description.trim().length === 0 && "descrição",
  ].filter((f): f is string => Boolean(f));
  const validDueDay = effectivePayment.dueDay === null || (Number.isInteger(effectivePayment.dueDay) && effectivePayment.dueDay >= 1 && effectivePayment.dueDay <= 31);
  const validPaymentGroup = effectivePayment.groupName.trim().length <= 80 && (!effectivePayment.showAtMonthStart || Boolean(effectivePayment.groupName.trim()));
  const canSave = missingFields.length === 0 && validDuplicateInput && (!isExpense || (!paymentLoading && validDueDay && validPaymentGroup));
  const busy = isPending || saveState === "saving";

  return (
    <EditorContainer modern={isModern} open={open} onClose={busy ? () => {} : onClose} title={transaction ? "Editar lançamento" : "Novo lançamento"}>
      <fieldset disabled={busy || Boolean(committed)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Cartão">
          <Select value={form.bank} onChange={(e) => update("bank", e.target.value as Bank | "")}>
            <option value="">Não informado</option>
            <option value="picpay">PicPay</option>
            <option value="nubank">Nubank</option>
          </Select>
        </FieldGroup>
        <FieldGroup label="Data de cadastro">
          <Input
            type="date"
            value={form.registrationDate}
            onChange={(e) => {
              const value = e.target.value;
              update("registrationDate", value);
              if (!transaction) {
                update("referenceMonth", value.slice(0, 7));
              }
            }}
          />
        </FieldGroup>

        <FieldGroup label="Mês de referência">
          <Input
            type="month"
            value={form.referenceMonth}
            onChange={(e) => update("referenceMonth", e.target.value)}
          />
        </FieldGroup>

        <FieldGroup label="Origem">
          <Select value={form.personId} onChange={(e) => update("personId", e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FieldGroup>

        <FieldGroup label="Entrada / Saída">
          <Select
            value={form.direction}
            onChange={(e) => update("direction", e.target.value as "income" | "expense")}
          >
            <option value="expense">Saída</option>
            <option value="income">Entrada</option>
          </Select>
        </FieldGroup>

        <FieldGroup label="Fixo / Variável">
          <Select
            value={form.fixedVariable}
            onChange={(e) => update("fixedVariable", e.target.value as "fixed" | "variable")}
          >
            <option value="variable">Variável</option>
            <option value="fixed">Fixo</option>
          </Select>
        </FieldGroup>

        {form.fixedVariable === "fixed" && (
          <FieldGroup label="Frequência">
            <Select
              value={form.fixedFrequency}
              onChange={(e) => update("fixedFrequency", e.target.value as RecurrenceFrequency)}
            >
              {RECURRENCE_FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </FieldGroup>
        )}

        {form.fixedVariable === "fixed" && (
          <FieldGroup label="Data de fim (opcional)">
            <Input
              type="month"
              value={form.fixedEndMonth}
              onChange={(e) => update("fixedEndMonth", e.target.value)}
            />
          </FieldGroup>
        )}

        <FieldGroup label="Tipo">
          <Select value={form.typeId} onChange={(e) => update("typeId", e.target.value)}>
            <option value="">Não identificado</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </FieldGroup>

        <FieldGroup label="Categoria">
          <Select value={form.categoryId} onChange={(e) => update("categoryId", e.target.value)}>
            <option value="">Não identificado</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FieldGroup>

        <FieldGroup label="Parcela">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={form.installmentCurrent}
              onChange={(e) => update("installmentCurrent", Number(e.target.value) || 1)}
            />
            <span className="text-(--color-text-tertiary)">/</span>
            <Input
              type="number"
              min={1}
              value={form.installmentTotal}
              onChange={(e) => update("installmentTotal", Number(e.target.value) || 1)}
            />
          </div>
          {!transaction && form.fixedVariable === "variable" && form.installmentTotal > form.installmentCurrent && (
            <p className="mt-1 text-xs text-(--color-text-tertiary)">
              As parcelas {form.installmentCurrent + 1} a {form.installmentTotal} serão criadas nos meses seguintes.
            </p>
          )}
        </FieldGroup>

        <FieldGroup label="Valor">
          <CurrencyInput valueCents={form.amountCents} onChange={(cents) => update("amountCents", cents)} />
        </FieldGroup>

        <div className="sm:col-span-2">
          <FieldGroup label="Descrição">
            <Input
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Ex.: Compras supermercado Carrefour"
            />
          </FieldGroup>
        </div>
      </fieldset>

      {isExpense && <div className="mt-5">
        {paymentLoading && <p className="text-sm text-(--color-text-tertiary)">Carregando organização de pagamento...</p>}
        {paymentLoad?.error && !paymentDirty && paymentLoad.month === paymentMonth && <p className="text-sm text-(--color-negative)">{paymentLoad.error} <button type="button" className="underline" onClick={() => { setPaymentLoad(null); setPaymentRetry((v) => v + 1); }}>Tentar novamente</button></p>}
        {paymentDirty && transaction && paymentLoad?.month !== paymentMonth && <p className="mb-2 text-sm text-amber-700">O mês mudou; sua organização editada foi mantida para o novo mês.</p>}
        {!validPaymentGroup && <p className="text-sm text-(--color-negative)">Informe um grupo de até 80 caracteres para exibir no início do mês.</p>}
        {!validDueDay && <p className="text-sm text-(--color-negative)">Informe um dia de vencimento entre 1 e 31.</p>}
        {!transaction && !paymentDirty && (effectivePayment.method === "nubank" || effectivePayment.method === "picpay") && <p className="mb-2 text-sm text-(--color-text-secondary)">Sem edição, segue a organização existente da fatura.</p>}
        <PaymentOrganizationFields value={effectivePayment} onChange={(value) => { setPayment(value); setPaymentDirty(true); }} disabled={busy || Boolean(committed) || paymentLoading} />
        {transaction?.recurrenceRuleId && paymentDirty && <fieldset disabled={busy || Boolean(committed)} className="mt-3 flex gap-4 text-sm"><legend>Aplicar organização</legend><label><input type="radio" checked={paymentScope === "month"} onChange={() => setPaymentScope("month")} /> Este mês</label><label><input type="radio" checked={paymentScope === "following"} onChange={() => setPaymentScope("following")} /> Este e próximos meses</label></fieldset>}
      </div>}

      {visibleResult && (!visibleResult.ok || visibleResult.matches.length > 0) && (
        <div role="alert" className="mt-5 rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
          {visibleResult.ok ? <>
            <p className="font-semibold">Possível duplicado</p>
            {visibleResult.matches.map((match) => <div key={match.id} className="mt-2">
              <p>{match.description} · {formatDateBR(match.registrationDate)} · {people.find((p) => p.id === match.personId)?.name ?? "Origem"} · {formatCurrencyBRL(match.amountCents)}</p>
              {showDetails && <p> {match.direction === "expense" ? "Saída" : "Entrada"} · {match.bank ?? "Sem cartão"} · Parcela {match.installmentCurrent}/{match.installmentTotal} · Referência {match.referenceMonth}</p>}
            </div>)}
            <button type="button" className="mt-2 underline" onClick={() => setShowDetails(!showDetails)}>{showDetails ? "Ocultar detalhes" : "Ver existente"}</button>
            {!transaction && !committed && <button type="button" disabled={busy} className="ml-4 underline" onClick={onClose}>Descartar novo</button>}
          </> : <>
            <p className="font-semibold">A consulta de duplicados falhou</p><p>{visibleResult.error}</p>
            <button type="button" className="mt-2 underline" onClick={() => { setDuplicateState(null); setRetry((n) => n + 1); }}>Tentar novamente</button>
          </>}
        </div>
      )}
      {(validDuplicateInput && !visibleResult) && <p className="mt-3 text-xs text-(--color-text-tertiary)">Consultando possíveis duplicados...</p>}
      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="text-xs">
          {saveState === "saving" && <span className="text-(--color-text-tertiary)">Salvando...</span>}
          {saveState === "saved" && <span className="text-(--color-positive)">Salvo</span>}
          {saveState === "error" && (
            <span className="text-(--color-negative)">
              {committed ? `Lançamento salvo; organização não pôde ser salva. ${errorMessage ?? ""}` : errorMessage ?? "Não foi possível salvar. Tentar novamente."}
            </span>
          )}
          {saveState === "idle" && !confirmingDelete && missingFields.length > 0 && (
            <span className="text-(--color-text-tertiary)">
              Preencha: {missingFields.join(", ")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {committed ? <><Button variant="secondary" onClick={onClose} disabled={busy} type="button">Fechar, lançamento já salvo</Button><Button onClick={retryPayment} disabled={busy} type="button">Tentar salvar organização novamente</Button></> : <>
          {transaction && !confirmingDelete && (
            <Button
              variant="ghost"
              onClick={() => setConfirmingDelete(true)}
              disabled={isDeleting || busy}
              type="button"
              className="text-(--color-negative) hover:bg-(--color-negative-soft)"
            >
              Excluir
            </Button>
          )}
          {transaction && confirmingDelete && (
            <>
              <span className="text-xs text-(--color-text-secondary)">Excluir mesmo?</span>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={isDeleting || busy} type="button">
                Não
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={isDeleting || busy} type="button">
                Sim, excluir
              </Button>
            </>
          )}
          {!confirmingDelete && (
            <>
              <Button variant="secondary" onClick={onClose} disabled={busy} type="button">
                Cancelar
              </Button>
              <Button onClick={() => handleSave(visibleResult ? (visibleResult.ok && visibleResult.matches.length ? "matches" : !visibleResult.ok ? "error" : undefined) : undefined)} disabled={!canSave || busy} type="button">
                {visibleResult ? (visibleResult.ok && visibleResult.matches.length ? "Manter ambos e salvar" : !visibleResult.ok ? "Continuar e salvar" : "Salvar") : "Salvar"}
              </Button>
            </>
          )}
          </>}
        </div>
      </div>
    </EditorContainer>
  );
}

async function safeCheckDuplicates(input: Parameters<typeof checkManualTransactionDuplicates>[0]): Promise<ManualDuplicateResult> {
  try { return await checkManualTransactionDuplicates(input); }
  catch { return { ok: false, error: "Não foi possível consultar possíveis duplicados." }; }
}

function EditorContainer({ modern, open, onClose, title, children }: { modern: boolean; open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!modern || !open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modern, open, onClose]);
  if (!modern) return <Modal open={open} onClose={onClose} title={title}>{children}</Modal>;
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
    <div role="dialog" aria-modal="true" aria-label={title} className="h-full w-full max-w-xl overflow-y-auto bg-(--color-surface) shadow-(--shadow-lg)">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-(--color-border) bg-(--color-surface) px-5 py-4">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-(--color-text-tertiary) hover:bg-black/5"><X size={18} /></button>
      </div><div className="p-5">{children}</div>
    </div>
  </div>;
}

function buildInitialForm(
  transaction: Transaction | null | undefined,
  today: Date,
  people: Person[],
  recurrenceRules: RecurrenceRule[]
) {
  if (transaction) {
    const linkedRule = transaction.recurrenceRuleId
      ? recurrenceRules.find((r) => r.id === transaction.recurrenceRuleId)
      : undefined;
    return {
      bank: (transaction.bank ?? "") as Bank | "",
      registrationDate: transaction.registrationDate,
      referenceMonth: transaction.referenceMonth,
      personId: transaction.personId,
      direction: transaction.direction,
      fixedVariable: transaction.fixedVariable,
      fixedEndMonth: linkedRule?.endDate ? linkedRule.endDate.slice(0, 7) : "",
      fixedFrequency: (linkedRule?.frequency ?? "monthly") as RecurrenceFrequency,
      typeId: transaction.typeId ?? "",
      categoryId: transaction.categoryId ?? "",
      installmentCurrent: transaction.installmentCurrent,
      installmentTotal: transaction.installmentTotal,
      amountCents: transaction.amountCents,
      description: transaction.description ?? "",
      considered: transaction.considered,
    };
  }

  return {
    bank: "" as Bank | "",
    registrationDate: toISODate(today),
    referenceMonth: toReferenceMonth(today),
    personId: people[0]?.id ?? "",
    direction: "expense" as const,
    fixedVariable: "variable" as const,
    fixedEndMonth: "",
    fixedFrequency: "monthly" as RecurrenceFrequency,
    typeId: "",
    categoryId: "",
    installmentCurrent: 1,
    installmentTotal: 1,
    amountCents: 0,
    description: "",
    considered: true,
  };
}
