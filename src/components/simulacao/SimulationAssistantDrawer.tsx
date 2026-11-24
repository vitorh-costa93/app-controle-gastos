"use client";

import { ClipboardEvent, DragEvent, useEffect, useRef, useState, useTransition } from "react";
import { Check, ImagePlus, Plane, Plus, Send, ShoppingBag, Sparkles, X } from "lucide-react";
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
import { ChatMarkdown } from "@/components/simulacao/ChatMarkdown";

interface UiMessage extends AssistantChatMessage {
  suggestions?: AssistantScenarioSuggestion[];
}

const MAX_IMAGES_PER_MESSAGE = 4;

async function compressImageFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Arquivo inválido: selecione uma imagem.");
  }

  const readFallback = () =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Falha ao ler imagem."));
      reader.readAsDataURL(file);
    });

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
      el.src = objectUrl;
    });

    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return await readFallback();
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.84);
  } catch {
    return await readFallback();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isSending]);

  if (!open) return null;

  async function handleAddFiles(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const remaining = MAX_IMAGES_PER_MESSAGE - pendingImages.length;
    if (remaining <= 0) {
      setError(`Máximo de ${MAX_IMAGES_PER_MESSAGE} imagens por mensagem.`);
      return;
    }

    setError(null);
    try {
      const compressed = await Promise.all(imageFiles.slice(0, remaining).map(compressImageFile));
      setPendingImages((prev) => [...prev, ...compressed.filter(Boolean)].slice(0, MAX_IMAGES_PER_MESSAGE));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível anexar a imagem.");
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      void handleAddFiles(files);
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      void handleAddFiles(e.dataTransfer.files);
    }
  }

  function sendText(rawText: string) {
    const trimmed = rawText.trim();
    const imagesToSend = pendingImages;
    if ((!trimmed && imagesToSend.length === 0) || isSending) return;

    const text =
      trimmed || (imagesToSend.length === 1 ? "Analise esta imagem." : "Analise estas imagens.");

    setError(null);
    const nextHistory: UiMessage[] = [
      ...messages,
      {
        role: "user",
        content: text,
        images: imagesToSend.length > 0 ? imagesToSend : undefined,
      },
    ];
    setMessages(nextHistory);
    setInput("");
    setPendingImages([]);

    startSending(async () => {
      const apiMessages: AssistantChatMessage[] = nextHistory.map(({ role, content, images }) => ({
        role,
        content,
        ...(images && images.length > 0 ? { images } : {}),
      }));
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
        className={`flex h-full w-full max-w-[460px] flex-col bg-(--color-surface) shadow-2xl transition-colors ${
          isDragging ? "ring-2 ring-inset ring-(--color-primary)" : ""
        }`}
        onClick={(e) => e.stopPropagation()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
                    : "max-w-[95%] rounded-2xl rounded-bl-xs border border-(--color-border) bg-(--color-surface) px-3.5 py-2.5 text-xs leading-relaxed text-(--color-text-primary)"
                }
              >
                {m.role === "user" ? (
                  <div className="space-y-2">
                    {m.images && m.images.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.images.map((src, imgIdx) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={imgIdx}
                            src={src}
                            alt={`Anexo ${imgIdx + 1}`}
                            className="h-20 w-20 rounded-lg border border-white/25 object-cover"
                          />
                        ))}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                ) : (
                  <ChatMarkdown content={m.content} />
                )}
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
          <div ref={messagesEndRef} />
        </div>

        {/* Preview de imagens anexadas */}
        {pendingImages.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-(--color-border) bg-black/[0.02] px-3 py-2">
            {pendingImages.map((src, idx) => (
              <div key={idx} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Prévia ${idx + 1}`}
                  className="h-14 w-14 rounded-lg border border-(--color-border) object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="Remover imagem"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white shadow hover:bg-slate-700"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendText(input);
          }}
          className="flex items-center gap-2 border-t border-(--color-border) bg-(--color-surface) p-3"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void handleAddFiles(e.target.files);
              }
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || pendingImages.length >= MAX_IMAGES_PER_MESSAGE}
            title="Enviar imagem (ou cole com Ctrl+V)"
            aria-label="Enviar imagem"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) text-(--color-text-secondary) hover:border-(--color-primary) hover:text-(--color-primary) disabled:opacity-50"
          >
            <ImagePlus size={16} />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder="Pergunte, cole um print (Ctrl+V) ou peça sugestões..."
            disabled={isSending}
            className="flex-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs outline-none focus:border-(--color-primary)"
          />
          <Button
            type="submit"
            disabled={(!input.trim() && pendingImages.length === 0) || isSending}
            className="gap-1.5 px-3 py-2 text-xs"
          >
            <Send size={13} /> Enviar
          </Button>
        </form>
      </div>
    </div>
  );
}
