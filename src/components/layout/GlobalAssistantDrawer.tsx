"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Send, Sparkles, X } from "lucide-react";
import {
  askFinancialAssistant,
  FinancialEstimateSuggestion,
} from "@/lib/data/financial-chat";
import { upsertEstimatedExpenseFromAssistant } from "@/lib/data/estimates";
import type { AssistantChatMessage } from "@/lib/data/simulation-chat";
import { formatCurrencyBRL } from "@/lib/utils/format";
import { Button } from "@/components/ui/Button";
import { ChatMarkdown } from "@/components/simulacao/ChatMarkdown";

interface UiMessage extends AssistantChatMessage {
  estimateSuggestions?: FinancialEstimateSuggestion[];
}

const QUICK_PROMPTS = [
  "Quanto eu gastei de alimentação nos últimos 3 meses?",
  "Quais categorias mais pesaram nos últimos 3 meses?",
  "Compare meus gastos deste mês com os 2 meses anteriores.",
];

export function GlobalAssistantDrawer({
  open,
  onClose,
  personId,
  currentPath,
}: {
  open: boolean;
  onClose: () => void;
  personId?: string | null;
  currentPath?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isSending]);

  if (!open) return null;

  function sendPrompt(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    setError(null);
    const nextHistory: UiMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextHistory);
    setInput("");

    startSending(async () => {
      const res = await askFinancialAssistant(
        nextHistory.map(({ role, content }) => ({ role, content })),
        { personId, currentPath }
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply, estimateSuggestions: res.estimateSuggestions },
      ]);
    });
  }

  async function handleSaveEstimate(suggestion: FinancialEstimateSuggestion, key: string) {
    setSavingKey(key);
    setError(null);
    const res = await upsertEstimatedExpenseFromAssistant({
      label: suggestion.label,
      categoryId: suggestion.categoryId,
      personId,
      customAmountCents: suggestion.monthlyAmountCents,
    });
    setSavingKey(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSavedKeys((prev) => ({ ...prev, [key]: true }));
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Assistente IA Financeiro"
    >
      <div
        className="flex h-full w-full max-w-lg flex-col bg-(--color-surface) shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-(--color-primary-soft) text-(--color-primary)">
              <Sparkles size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold">Assistente IA Financeiro</h3>
              <p className="text-xs text-(--color-text-secondary)">
                Consulta seus lançamentos reais e cria gastos estimados em 1 clique
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar assistente"
            className="rounded-(--radius-md) p-1.5 text-(--color-text-tertiary) hover:bg-black/5"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-(--radius-lg) border border-(--color-border) bg-black/[0.02] p-3.5 text-xs text-(--color-text-secondary)">
                Pergunte sobre gastos por categoria, compare meses ou peça para incluir uma média mensal nos{" "}
                <b>Gastos estimados</b> dos próximos meses.
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-(--color-text-tertiary)">
                  Sugestões rápidas
                </p>
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => sendPrompt(q)}
                    className="block w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-left text-xs text-(--color-text-primary) transition-colors hover:border-(--color-primary) hover:bg-(--color-primary-soft)/30"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={msg.role === "user" ? "flex justify-end" : "space-y-2.5"}>
              <div
                className={
                  msg.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-sm bg-(--color-primary) px-3.5 py-2.5 text-sm text-white"
                    : "rounded-2xl rounded-bl-sm border border-(--color-border) bg-black/[0.02] px-4 py-3 text-sm text-(--color-text-primary)"
                }
              >
                {msg.role === "user" ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                ) : (
                  <ChatMarkdown content={msg.content} />
                )}
              </div>

              {msg.estimateSuggestions && msg.estimateSuggestions.length > 0 && (
                <div className="space-y-2 pl-1">
                  {msg.estimateSuggestions.map((s, sIdx) => {
                    const key = `${idx}-${sIdx}`;
                    const isAdded = Boolean(savedKeys[key]);
                    const isAdding = savingKey === key;
                    return (
                      <div
                        key={key}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-3 shadow-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-(--color-text-primary)">
                            {s.label} ({s.categoryName})
                          </div>
                          <div className="mt-0.5 text-xs font-medium text-(--color-positive) tabular-nums">
                            {formatCurrencyBRL(s.monthlyAmountCents)}/mês
                          </div>
                          <div className="mt-0.5 text-[11px] text-(--color-text-tertiary)">{s.basisSummary}</div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={isAdded ? "secondary" : "primary"}
                          disabled={isAdding || isAdded}
                          onClick={() => void handleSaveEstimate(s, key)}
                          className="shrink-0 gap-1 text-xs"
                        >
                          {isAdded ? (
                            <>
                              <Check size={13} /> Incluído nos estimados
                            </>
                          ) : (
                            <>
                              <Plus size={13} /> {isAdding ? "Salvando..." : "Incluir como gasto estimado"}
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {isSending && (
            <div className="rounded-2xl border border-(--color-border) bg-black/[0.02] px-4 py-3 text-xs text-(--color-text-secondary)">
              Consultando lançamentos reais...
            </div>
          )}

          {error && (
            <div className="rounded-(--radius-md) border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt(input);
          }}
          className="border-t border-(--color-border) px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ex.: Quanto gastei de alimentação nos últimos 3 meses?"
              className="flex-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
              disabled={isSending}
            />
            <Button type="submit" size="sm" disabled={isSending || !input.trim()} className="gap-1.5 px-3">
              <Send size={14} /> Enviar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
