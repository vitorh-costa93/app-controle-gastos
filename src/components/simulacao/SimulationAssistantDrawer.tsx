"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Plane, Plus, Send, ShoppingBag, Sparkles, X } from "lucide-react";
import {
  AssistantChatMessage,
  AssistantFinancialContext,
  AssistantScenarioSuggestion,
  askSimulationAssistant,
} from "@/lib/data/simulation-chat";
import { createSimulation } from "@/lib/data/simulations";
import { buildDefaultProductTrackerConfig, buildDefaultTravelTrackerConfig } from "@/lib/price-tracking/catalog";
import { Simulation } from "@/types/domain";
import { formatCurrencyBRL, toISODate } from "@/lib/utils/format";
import { Button } from "@/components/ui/Button";

interface UiMessage extends AssistantChatMessage {
  suggestions?: AssistantScenarioSuggestion[];
}

const QUICK_PROMPTS = [
  "Me sugira resorts all inclusive em outros estados além de Alagoas que caibam no nosso orçamento.",
  "Qual o impacto se comprarmos o PlayStation 5 e fizermos a viagem juntos?",
  "Em qual mês de 2027 nossa sobra acumulada fica mais folgada para viajar?",
];

export function SimulationAssistantDrawer({
  open,
  onClose,
  context,
  onScenarioCreated,
}: {
  open: boolean;
  onClose: () => void;
  context: AssistantFinancialContext;
  onScenarioCreated: (sim: Simulation) => void;
}) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function sendText(rawText: string) {
    const text = rawText.trim();
    if (!text || isSending) return;
    setError(null);
    const nextHistory: UiMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextHistory);
    setInput("");

    startSending(async () => {
      const apiMessages: AssistantChatMessage[] = nextHistory.map(({ role, content }) => ({ role, content }));
      const res = await askSimulationAssistant(apiMessages, context);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply, suggestions: res.suggestions }]);
    });
  }

  async function handleAddSuggestion(key: string, s: AssistantScenarioSuggestion) {
    setAddingKey(key);
    setError(null);
    try {
      const today = toISODate(new Date());
      const startDate = s.outboundDate && /^\d{4}-\d{2}-\d{2}$/.test(s.outboundDate) ? s.outboundDate : today;
      const isTravel = s.category === "travel";
      const trackerConfig = isTravel
        ? {
            ...buildDefaultTravelTrackerConfig(s.accommodationName || s.description, startDate),
            destinationAirport: s.destinationAirport || "MCZ",
            destinationLabel: s.destinationLabel || s.destinationAirport || "Destino",
            accommodationName: s.accommodationName || s.title,
            outboundDate: s.outboundDate || startDate,
            returnDate:
              s.returnDate && s.returnDate > (s.outboundDate || startDate)
                ? s.returnDate
                : buildDefaultTravelTrackerConfig(s.title, startDate).returnDate,
            sameDatesForFlight: true,
            includeStay: true,
            includeFlight: true,
          }
        : buildDefaultProductTrackerConfig(s.description || s.title);

      const created = await createSimulation({
        description: s.title,
        category: s.category,
        autoTrack: true,
        cashPriceCents: s.estimatedCashCents,
        totalAmountCents: s.estimatedInstallmentTotalCents,
        installments: s.installments,
        startDate: today,
        trackerConfig,
      });

      if (!created.ok) {
        setError(created.error);
        return;
      }
      setAddedKeys((prev) => ({ ...prev, [key]: true }));
      onScenarioCreated(created.data);
    } finally {
      setAddingKey(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[1px]" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-[460px] flex-col bg-(--color-surface) shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho conectado ao orçamento */}
        <div className="flex items-start justify-between gap-3 border-b border-(--color-border) bg-[#0f172a] px-5 py-4 text-white">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-blue-400" />
              <h2 className="text-sm font-bold">Assistente IA · Orçamento & Viagens</h2>
            </div>
            <p className="mt-1 text-[11px] text-slate-300 tabular-nums">
              {context.personLabel} · Reserva: {formatCurrencyBRL(context.currentReserveCents)} · Sobra média:{" "}
              {formatCurrencyBRL(context.averageMonthlyLeftoverCents)}/mês
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar assistente"
            className="rounded-full p-1 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Histórico do Chat */}
        <div className="flex-1 space-y-3 overflow-y-auto bg-black/[0.02] p-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-3.5 text-xs leading-relaxed text-(--color-text-secondary)">
                Estou conectado aos seus dados reais e às simulações ativas. Pergunte qualquer coisa ou peça sugestões
                (ex.: resorts em outros estados ou produtos) — você pode adicionar qualquer opção como cenário com 1
                clique.
              </div>
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-(--color-text-tertiary)">Sugestões rápidas:</p>
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => sendText(q)}
                    className="block w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-left text-xs text-(--color-text-primary) hover:border-(--color-primary) hover:bg-(--color-primary-soft)/40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, idx) => (
            <div key={idx} className={m.role === "user" ? "flex justify-end" : "flex flex-col items-start gap-2"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-xs bg-(--color-primary) px-3.5 py-2.5 text-xs leading-relaxed text-white"
                    : "max-w-[95%] whitespace-pre-line rounded-2xl rounded-bl-xs border border-(--color-border) bg-(--color-surface) px-3.5 py-2.5 text-xs leading-relaxed text-(--color-text-primary)"
                }
              >
                {m.content}
              </div>

              {m.suggestions && m.suggestions.length > 0 && (
                <div className="w-full space-y-2">
                  {m.suggestions.map((s, sIdx) => {
                    const key = `${idx}-${sIdx}`;
                    const isAdded = Boolean(addedKeys[key]);
                    const isAdding = addingKey === key;
                    return (
                      <div
                        key={key}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-bold text-(--color-text-primary)">
                            {s.category === "travel" ? (
                              <Plane size={13} className="shrink-0 text-(--color-primary)" />
                            ) : (
                              <ShoppingBag size={13} className="shrink-0 text-(--color-primary)" />
                            )}
                            <span className="truncate">{s.title}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-(--color-text-secondary)">{s.summaryHint}</p>
                          <p className="mt-1 font-semibold tabular-nums text-(--color-positive)">
                            À vista ~{formatCurrencyBRL(s.estimatedCashCents)} · {s.installments}× total ~
                            {formatCurrencyBRL(s.estimatedInstallmentTotalCents)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={() => handleAddSuggestion(key, s)}
                          disabled={isAdded || isAdding}
                          className="shrink-0 gap-1 px-2.5 py-1.5 text-[11px]"
                        >
                          {isAdded ? (
                            <>
                              <Check size={12} /> Adicionado!
                            </>
                          ) : isAdding ? (
                            "Criando..."
                          ) : (
                            <>
                              <Plus size={12} /> Simular
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
            <div className="rounded-2xl rounded-bl-xs border border-(--color-border) bg-(--color-surface) px-3.5 py-2.5 text-xs text-(--color-text-secondary)">
              Consultando seu orçamento e buscando opções na web...
            </div>
          )}

          {error && <p className="text-xs text-(--color-negative)">{error}</p>}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendText(input);
          }}
          className="flex items-center gap-2 border-t border-(--color-border) bg-(--color-surface) p-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre seu orçamento ou peça sugestões..."
            disabled={isSending}
            className="flex-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs outline-none focus:border-(--color-primary)"
          />
          <Button type="submit" disabled={!input.trim() || isSending} className="gap-1.5 px-3 py-2 text-xs">
            <Send size={13} /> Enviar
          </Button>
        </form>
      </div>
    </div>
  );
}
