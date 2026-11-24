"use client";

import { useState, useTransition } from "react";
import {
  Bell,
  Camera,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Hotel,
  Plane,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  TrendingDown,
} from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Simulation, SimulationPriceAlert, SimulationPriceSnapshot } from "@/types/domain";
import { TravelTrackerConfig, VerifiedProductOffer } from "@/types/db";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FieldGroup, Input } from "@/components/ui/Field";
import {
  NotificationChannelsConfig,
  importOfferScreenshotToSimulation,
  markPriceAlertRead,
  refreshMultipleSimulationsTracking,
  refreshSimulationPriceTracking,
  saveNotificationChannelsConfig,
} from "@/lib/data/price-tracking";
import { updateSimulation } from "@/lib/data/simulations";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export interface TravelPartOverride {
  includeStay: boolean;
  includeFlight: boolean;
  originAirport?: string;
}

export function PriceTrackingSection({
  simulations,
  snapshotsBySimId,
  alerts,
  notificationConfig,
  travelOverrides = {},
  onTravelOverrideChange,
  onSimulationUpdated,
  onSnapshotAdded,
  onAlertAdded,
  onAlertDismissed,
}: {
  simulations: Simulation[];
  snapshotsBySimId: Record<string, SimulationPriceSnapshot[]>;
  alerts: SimulationPriceAlert[];
  notificationConfig: NotificationChannelsConfig;
  travelOverrides?: Record<string, TravelPartOverride>;
  onTravelOverrideChange?: (simId: string, patch: Partial<TravelPartOverride>) => void;
  onSimulationUpdated: (sim: Simulation) => void;
  onSnapshotAdded: (snap: SimulationPriceSnapshot) => void;
  onAlertAdded: (alert: SimulationPriceAlert) => void;
  onAlertDismissed: (alertId: string) => void;
}) {
  const [isRefreshingAll, startRefreshAll] = useTransition();
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [notifForm, setNotifForm] = useState<NotificationChannelsConfig>(notificationConfig);
  const [notifStatus, setNotifStatus] = useState<string | null>(null);
  const [pushPermission, setPushPermission] = useState<string>(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (simulations.length === 0) return null;

  const selectedIdsSet = new Set(simulations.map((s) => s.id));
  const unreadAlerts = alerts.filter((a) => !a.readAt && selectedIdsSet.has(a.simulationId));

  function handleRefreshSingle(simId: string) {
    setRefreshingId(simId);
    refreshSimulationPriceTracking(simId)
      .then((res) => {
        if (res.ok) {
          onSimulationUpdated(res.simulation);
          if (res.snapshot) onSnapshotAdded(res.snapshot);
          if (res.alert) {
            onAlertAdded(res.alert);
            triggerBrowserNotificationIfAllowed(res.alert.title, res.alert.message);
          }
        }
      })
      .finally(() => setRefreshingId(null));
  }

  function handleUploadOfferScreenshot(simId: string, file: File) {
    setRefreshingId(simId);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result || "");
        if (!dataUrl) return;
        const res = await importOfferScreenshotToSimulation(simId, dataUrl);
        if (!res.ok) {
          window.alert(res.error);
          return;
        }
        onSimulationUpdated(res.simulation);
        if (res.snapshot) onSnapshotAdded(res.snapshot);
        if (res.alert) {
          onAlertAdded(res.alert);
          triggerBrowserNotificationIfAllowed(res.alert.title, res.alert.message);
        }
      } finally {
        setRefreshingId(null);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleRefreshAllSelected() {
    startRefreshAll(async () => {
      const ids = simulations.map((s) => s.id);
      const res = await refreshMultipleSimulationsTracking(ids);
      if (res.ok) {
        for (const s of res.updatedSimulations) {
          onSimulationUpdated(s);
        }
        for (const a of res.newAlerts) {
          onAlertAdded(a);
          triggerBrowserNotificationIfAllowed(a.title, a.message);
        }
      }
    });
  }

  function triggerBrowserNotificationIfAllowed(title: string, body: string) {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification(title, { body, icon: "/favicon.ico" });
      } catch {
        // Ignora caso o SO bloqueie
      }
    }
  }

  async function requestBrowserPushPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotifStatus("Seu navegador atual não suporta notificações Web Push.");
      return;
    }
    const perm = await Notification.requestPermission();
    setPushPermission(perm);
    if (perm === "granted") {
      setNotifForm((prev) => ({ ...prev, browserPushEnabled: true }));
      new Notification("MeuDinheiro — Alertas Ativados!", {
        body: "Você receberá avisos imediatos quando um voo, resort ou produto baixar de preço.",
      });
    }
  }

  async function handleSaveNotifConfig() {
    setNotifStatus(null);
    const res = await saveNotificationChannelsConfig(notifForm);
    if (!res.ok) {
      setNotifStatus(res.error);
      return;
    }
    setNotifStatus("Canais de alerta salvos com sucesso!");
    setTimeout(() => setAlertModalOpen(false), 900);
  }

  async function handleSelectStoreOffer(sim: Simulation, offer: VerifiedProductOffer) {
    const nextMeta = sim.bestOfferMeta
      ? {
          ...sim.bestOfferMeta,
          storeOrProvider: offer.store,
          cashPriceCents: offer.cashPriceCents,
          installmentTotalCents: offer.installmentTotalCents,
          installments: offer.installments,
          offerUrl: offer.url,
        }
      : null;

    const res = await updateSimulation(sim.id, {
      description: sim.description,
      cashPriceCents: offer.cashPriceCents,
      totalAmountCents: offer.installmentTotalCents,
      installments: offer.installments,
      startDate: sim.startDate,
      category: sim.category,
      autoTrack: true,
      trackerConfig: sim.trackerConfig,
      bestOfferMeta: nextMeta,
    });
    if (res.ok) {
      onSimulationUpdated(res.data);
    }
  }

  return (
    <div className="space-y-4">
      {/* Barra Superior de Rastreamento Inteligente & Black Friday */}
      <Card className="overflow-hidden border-(--color-primary)/25 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-(--color-border) bg-(--color-primary-soft)/35 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={18} className="shrink-0 text-(--color-primary)" />
            <div>
              <h3 className="text-sm font-semibold text-(--color-text-primary)">
                Rastreamento de preços
              </h3>
              <p className="text-xs text-(--color-text-secondary)">
                Melhores ofertas à vista e parcelado para suas simulações.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAlertModalOpen(true)}
              className="gap-1.5 px-3 py-1.5 text-xs"
            >
              <Bell size={13} />
              Alertas no Celular
            </Button>
            <Button
              type="button"
              onClick={handleRefreshAllSelected}
              disabled={isRefreshingAll || refreshingId !== null}
              className="gap-1.5 px-3 py-1.5 text-xs"
            >
              <RefreshCw size={13} className={cn(isRefreshingAll && "animate-spin")} />
              {isRefreshingAll ? "Atualizando preços..." : "Atualizar preços agora"}
            </Button>
          </div>
        </div>

        {/* Apenas o alerta mais recente de queda real (sem empilhar banners) */}
        {unreadAlerts.length > 0 && (() => {
          const latestAlert = unreadAlerts[0];
          return (
            <div className="border-b border-(--color-border) bg-(--color-positive-soft)/45 px-5 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <TrendingDown size={15} className="shrink-0 text-(--color-positive)" />
                  <span className="font-semibold text-(--color-text-primary)">{latestAlert.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  {latestAlert.offerUrl && (
                    <a
                      href={latestAlert.offerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-(--radius-md) bg-(--color-positive) px-2.5 py-1 font-semibold text-white hover:opacity-90"
                    >
                      Ver oferta <ExternalLink size={11} />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      unreadAlerts.forEach((a) => {
                        onAlertDismissed(a.id);
                        markPriceAlertRead(a.id);
                      });
                    }}
                    className="rounded px-2 py-1 text-(--color-text-tertiary) hover:bg-black/5"
                  >
                    Dispensar
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Cards detalhados de cada simulação selecionada */}
        <div className="divide-y divide-(--color-border)">
          {simulations.map((sim) => {
            const meta = sim.bestOfferMeta;
            const history = snapshotsBySimId[sim.id] ?? [];
            const isRefreshingThis = refreshingId === sim.id || isRefreshingAll;
            const isTravel =
              sim.category === "travel" ||
              sim.description.toLocaleLowerCase("pt-BR").includes("japaratinga") ||
              sim.description.toLocaleLowerCase("pt-BR").includes("salinas") ||
              sim.description.toLocaleLowerCase("pt-BR").includes("maceió");

            const isExpanded = Boolean(expandedIds[sim.id]);

            return (
              <div key={sim.id} className="space-y-3 px-5 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--color-primary-soft) text-(--color-primary)">
                      {isTravel ? <Plane size={15} /> : <ShoppingBag size={15} />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold">{sim.description}</h4>
                        <span className="rounded-full bg-(--color-primary-soft) px-2 py-0.5 text-[11px] font-semibold text-(--color-primary)">
                          {isTravel ? "Viagem" : "Produto"}
                        </span>
                        {meta && (
                          <span className="truncate text-xs text-(--color-text-secondary)">
                            · {meta.storeOrProvider}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums text-(--color-text-secondary)">
                        {sim.cashPriceCents ? (
                          <span>
                            À vista: <b className="text-(--color-positive)">{formatCurrencyBRL(sim.cashPriceCents)}</b>
                          </span>
                        ) : null}
                        <span>
                          Parcelado:{" "}
                          <b className="text-(--color-text-primary)">
                            {sim.installments}x de {formatCurrencyBRL(sim.installmentAmountCents)}
                          </b>{" "}
                          ({formatCurrencyBRL(sim.totalAmountCents)})
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {meta?.offerUrl && (
                      <a
                        href={meta.offerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2.5 py-1 text-xs font-semibold text-(--color-primary) hover:bg-(--color-primary-soft)"
                      >
                        Abrir <ExternalLink size={11} />
                      </a>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleRefreshSingle(sim.id)}
                      disabled={isRefreshingThis}
                      className="gap-1 px-2.5 py-1 text-xs"
                    >
                      <RefreshCw size={12} className={cn(isRefreshingThis && "animate-spin")} />
                      {isRefreshingThis ? "..." : "Atualizar"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(sim.id)}
                      className="inline-flex items-center gap-1 rounded-(--radius-md) px-2.5 py-1 text-xs font-semibold text-(--color-text-secondary) hover:bg-black/5"
                    >
                      {isExpanded ? (
                        <>
                          Ocultar <ChevronUp size={13} />
                        </>
                      ) : (
                        <>
                          {isTravel ? "Datas e histórico" : "Detalhes"} <ChevronDown size={13} />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Proposta A para Viagem: Hospedagem e Voo 100% independentes sempre visíveis */}
                {isTravel && meta?.stayQuote && (
                  <TravelSplitCards
                    sim={sim}
                    override={travelOverrides[sim.id]}
                    onOverrideChange={(patch) => onTravelOverrideChange?.(sim.id, patch)}
                  />
                )}

                {isExpanded && (
                  <div className="space-y-3 border-t border-(--color-border)/60 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-(--color-text-secondary)">
                      <span>
                        {meta
                          ? `Última checagem: ${new Date(meta.checkedAt).toLocaleString("pt-BR")}`
                          : "Clique em 'Atualizar' para buscar o menor preço à vista e parcelado."}
                      </span>
                      {!isTravel && (
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2.5 py-1 text-xs font-semibold text-(--color-text-primary) hover:bg-black/5">
                          <Camera size={12} className="text-(--color-primary)" />
                          Ler Print de Oferta
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={isRefreshingThis}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadOfferScreenshot(sim.id, f);
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>

                {/* Detalhamento se for COMPRA / PRODUTO */}
                {!isTravel && meta?.productOffers && meta.productOffers.length > 0 && (
                  <div className="space-y-3">
                    <div className="overflow-x-auto rounded-(--radius-md) border border-(--color-border)">
                      <table className="w-full border-collapse text-xs tabular-nums">
                        <thead>
                          <tr className="border-b border-(--color-border) bg-black/[0.025] text-[11px] font-semibold text-(--color-text-secondary)">
                            <th className="px-3 py-2 text-left">Loja</th>
                            <th className="px-3 py-2 text-left">Produto</th>
                            <th className="px-3 py-2 text-right">À vista (PIX)</th>
                            <th className="px-3 py-2 text-right">Parcelado</th>
                            <th className="px-3 py-2 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-(--color-border)/60">
                          {meta.productOffers.map((offer, idx) => {
                            const isActiveStore =
                              sim.cashPriceCents === offer.cashPriceCents &&
                              sim.totalAmountCents === offer.installmentTotalCents;
                            return (
                              <tr
                                key={`${offer.store}-${idx}`}
                                className={cn(isActiveStore && "bg-(--color-positive-soft)/40 font-medium")}
                              >
                                <td className="whitespace-nowrap px-3 py-2.5">
                                  <div className="font-semibold text-(--color-text-primary)">{offer.store}</div>
                                  <div className="text-[11px] text-(--color-text-tertiary)">{offer.seller}</div>
                                </td>
                                <td className="px-3 py-2.5">
                                  <div className="line-clamp-1 font-medium text-(--color-text-primary)">
                                    {offer.title}
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-(--color-positive)">
                                  {formatCurrencyBRL(offer.cashPriceCents)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                                  <div className="font-semibold text-(--color-text-primary)">
                                    {formatCurrencyBRL(offer.installmentTotalCents)}
                                  </div>
                                  <div className="text-[11px] text-(--color-text-tertiary)">
                                    {offer.installments}x de{" "}
                                    {formatCurrencyBRL(Math.round(offer.installmentTotalCents / offer.installments))}
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {!isActiveStore ? (
                                      <button
                                        type="button"
                                        onClick={() => handleSelectStoreOffer(sim, offer)}
                                        className="rounded-(--radius-md) bg-(--color-primary-soft) px-2.5 py-1 text-[11px] font-semibold text-(--color-primary) hover:opacity-85"
                                      >
                                        Aplicar
                                      </button>
                                    ) : (
                                      <span className="rounded-full bg-(--color-positive-soft) px-2 py-0.5 text-[10px] font-semibold text-(--color-positive)">
                                        Na simulação
                                      </span>
                                    )}
                                    <a
                                      href={offer.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-(--color-primary) hover:underline"
                                    >
                                      Loja <ExternalLink size={11} />
                                    </a>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Detalhamento se for VIAGEM (Voos Multi-Origem RAO/VCP + Resort/Estadia por Data) */}
                {isTravel && (
                  <TravelTrackingDetailsCard
                    sim={sim}
                    onSimulationUpdated={onSimulationUpdated}
                    onSnapshotAdded={onSnapshotAdded}
                    onAlertAdded={onAlertAdded}
                  />
                )}

                {/* Gráfico de Histórico de Evolução do Preço */}
                {history.length > 0 && <PriceHistoryChart history={history} isTravel={isTravel} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Modal de Configuração de Alertas no Celular (Push + Telegram) */}
      {alertModalOpen && (
        <Modal open onClose={() => setAlertModalOpen(false)} title="Alertas de Queda de Preço no Celular">
          <div className="space-y-4 text-sm">
            <div className="rounded-(--radius-lg) border border-(--color-primary)/25 bg-(--color-primary-soft)/25 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-(--color-text-primary)">1. Notificação Push no Navegador / Celular</p>
                  <p className="mt-0.5 text-xs text-(--color-text-secondary)">
                    Receba alertas nativos no celular (adicione à tela inicial) e no computador assim que o preço cair.
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={requestBrowserPushPermission} className="text-xs">
                  {pushPermission === "granted" ? "✓ Push Ativo" : "Ativar Push"}
                </Button>
              </div>
            </div>

            <div className="space-y-3 rounded-(--radius-lg) border border-(--color-border) p-3.5">
              <p className="font-semibold text-(--color-text-primary)">
                2. Alerta Instantâneo no Telegram (Recomendado para Black Friday)
              </p>
              <p className="text-xs text-(--color-text-secondary)">
                Se quiser receber mensagem instantânea no Telegram do celular com o link direto da oferta verificada e o
                veredito da Caixinha CDI, informe o Token do Bot e seu Chat ID (opcional):
              </p>
              <FieldGroup label="Telegram Bot Token (opcional)">
                <Input
                  type="password"
                  value={notifForm.telegramBotToken ?? ""}
                  onChange={(e) => setNotifForm({ ...notifForm, telegramBotToken: e.target.value })}
                  placeholder="Ex.: 123456789:ABCdefGHIjklMNO..."
                />
              </FieldGroup>
              <FieldGroup label="Telegram Chat ID (opcional)">
                <Input
                  value={notifForm.telegramChatId ?? ""}
                  onChange={(e) => setNotifForm({ ...notifForm, telegramChatId: e.target.value })}
                  placeholder="Ex.: 987654321"
                />
              </FieldGroup>
            </div>

            <FieldGroup label="Sensibilidade do Alerta (% mínimo de queda real para notificar)">
              <Input
                type="number"
                min={1}
                max={50}
                value={notifForm.dropThresholdPercent ?? 4}
                onChange={(e) => setNotifForm({ ...notifForm, dropThresholdPercent: Number(e.target.value) || 4 })}
              />
            </FieldGroup>

            {notifStatus && <p className="text-xs font-medium text-(--color-primary)">{notifStatus}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setAlertModalOpen(false)}>
                Fechar
              </Button>
              <Button type="button" onClick={handleSaveNotifConfig}>
                Salvar configurações
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TravelTrackingDetailsCard({
  sim,
  onSimulationUpdated,
  onSnapshotAdded,
  onAlertAdded,
}: {
  sim: Simulation;
  onSimulationUpdated: (sim: Simulation) => void;
  onSnapshotAdded: (snap: SimulationPriceSnapshot) => void;
  onAlertAdded: (alert: SimulationPriceAlert) => void;
}) {
  const rawCfg = (sim.trackerConfig ?? {}) as Partial<TravelTrackerConfig>;
  const [outboundDate, setOutboundDate] = useState(rawCfg.outboundDate || sim.startDate);
  const [returnDate, setReturnDate] = useState(() => {
    if (rawCfg.returnDate && rawCfg.returnDate > (rawCfg.outboundDate || sim.startDate)) return rawCfg.returnDate;
    const ms = new Date(`${rawCfg.outboundDate || sim.startDate}T12:00:00Z`).getTime();
    return new Date((Number.isNaN(ms) ? Date.now() : ms) + 5 * 86400000).toISOString().slice(0, 10);
  });
  const [accommodationName, setAccommodationName] = useState(rawCfg.accommodationName || sim.description);
  const [destinationAirport, setDestinationAirport] = useState(rawCfg.destinationAirport || "MCZ");
  const [isUpdatingDates, startDateUpdate] = useTransition();

  const meta = sim.bestOfferMeta;
  const flightQuotes = meta?.flightQuotes ?? [];
  const stayQuote = meta?.stayQuote;

  function handleApplyNewTravelDates() {
    startDateUpdate(async () => {
      const nextConfig: TravelTrackerConfig = {
        destinationAirport,
        destinationLabel:
          destinationAirport === "MCZ"
            ? "Maceió - AL (MCZ)"
            : destinationAirport === "REC"
              ? "Recife - PE (REC)"
              : destinationAirport,
        originAirports: rawCfg.originAirports?.length ? rawCfg.originAirports : ["RAO", "VCP"],
        accommodationName,
        outboundDate,
        returnDate,
        adults: rawCfg.adults ?? 2,
        allowStops: rawCfg.allowStops ?? true,
        highFrequencyBlackFriday: true,
        targetTotalCents: rawCfg.targetTotalCents ?? null,
      };

      await updateSimulation(sim.id, {
        description: sim.description,
        cashPriceCents: sim.cashPriceCents,
        totalAmountCents: sim.totalAmountCents,
        installments: sim.installments,
        startDate: sim.startDate,
        category: "travel",
        autoTrack: true,
        trackerConfig: nextConfig,
      });

      const refreshed = await refreshSimulationPriceTracking(sim.id);
      if (refreshed.ok) {
        onSimulationUpdated(refreshed.simulation);
        if (refreshed.snapshot) onSnapshotAdded(refreshed.snapshot);
        if (refreshed.alert) onAlertAdded(refreshed.alert);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-(--radius-lg) border border-(--color-border) bg-black/[0.015] p-4">
      {/* Barra rápida para alterar Destino, Resort/Estadia e Datas da Viagem */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-(--color-text-secondary)">
            Destino / Aeroporto
          </label>
          <select
            value={destinationAirport}
            onChange={(e) => setDestinationAirport(e.target.value)}
            className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2.5 py-1.5 text-xs"
          >
            <option value="MCZ">Maceió - AL (MCZ)</option>
            <option value="REC">Recife - PE (REC)</option>
            <option value="BPS">Porto Seguro - BA (BPS)</option>
            <option value="NAT">Natal - RN (NAT)</option>
            <option value="FOR">Fortaleza - CE (FOR)</option>
            <option value="SSA">Salvador - BA (SSA)</option>
            <option value="POA">Gramado / POA (POA)</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-[11px] font-semibold text-(--color-text-secondary)">
            Estadia / Resort monitorado
          </label>
          <input
            type="text"
            value={accommodationName}
            onChange={(e) => setAccommodationName(e.target.value)}
            placeholder="Ex.: Japaratinga Lounge Resort ou Salinas Maragogi"
            className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2.5 py-1.5 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-(--color-text-secondary)">
            Ida / Check-in
          </label>
          <input
            type="date"
            value={outboundDate}
            onChange={(e) => setOutboundDate(e.target.value)}
            className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2.5 py-1.5 text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-(--color-text-secondary)">
            Volta / Check-out
          </label>
          <div className="flex gap-1.5">
            <input
              type="date"
              min={outboundDate}
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className="w-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-2 py-1.5 text-xs"
            />
            <Button
              type="button"
              onClick={handleApplyNewTravelDates}
              disabled={isUpdatingDates}
              className="shrink-0 px-2.5 py-1.5 text-xs"
            >
              {isUpdatingDates ? "..." : "Cotar"}
            </Button>
          </div>
        </div>
      </div>

      {/* Comparativo de Voos (Ribeirão Preto RAO vs Campinas VCP) + Hospedagem */}
      {flightQuotes.length > 0 && stayQuote && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Coluna 1: Passagens Aéreas Multi-Origem */}
          <div className="space-y-2 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-(--color-text-primary)">
                <Plane size={14} className="text-(--color-primary)" />
                Passagens Aéreas (Ida {formatDateBR(outboundDate)} · Volta {formatDateBR(returnDate)})
              </span>
              <span className="text-[11px] text-(--color-text-tertiary)">{rawCfg.adults ?? 2} adultos c/ taxas</span>
            </div>
            <div className="space-y-2">
              {flightQuotes.map((fq) => {
                const isBestOrigin = fq.originAirport === meta?.selectedFlightOrigin;
                return (
                  <div
                    key={fq.originAirport}
                    className={cn(
                      "rounded-(--radius-md) border p-2.5 text-xs",
                      isBestOrigin
                        ? "border-(--color-positive) bg-(--color-positive-soft)/35"
                        : "border-(--color-border)"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {fq.originAirport === "RAO"
                          ? "Saindo de Ribeirão Preto (RAO)"
                          : fq.originAirport === "VCP"
                            ? "Saindo de Campinas (VCP)"
                            : `Saindo de ${fq.originAirport}`}{" "}
                        → {fq.destinationAirport}
                      </span>
                      <span className="font-bold tabular-nums text-(--color-text-primary)">
                        {formatCurrencyBRL(fq.cashTotalCents)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-(--color-text-secondary)">
                      <span>
                        {fq.airline} · {fq.stopsCount === 0 ? "Voo Direto" : `${fq.stopsCount} escala`} (
                        {fq.durationSummary})
                      </span>
                      <a
                        href={fq.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-(--color-primary) hover:underline"
                      >
                        Google Flights <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Coluna 2: Estadia / Resort nas Datas */}
          <div className="flex flex-col justify-between rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3.5 text-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold text-(--color-text-primary)">
                  <Hotel size={14} className="text-(--color-primary)" />
                  Estadia: {stayQuote.accommodationName}
                </span>
                {stayQuote.isBlackFridayPromo && (
                  <span className="rounded-full bg-(--color-warning-soft) px-2 py-0.5 text-[10px] font-semibold text-(--color-warning)">
                    Monitorando Black Friday
                  </span>
                )}
              </div>
              <p className="text-[11px] text-(--color-text-secondary)">
                {stayQuote.nights} diárias ({formatDateBR(outboundDate)} a {formatDateBR(returnDate)}) ·{" "}
                <b>{stayQuote.boardBasis}</b> · {stayQuote.roomType}
              </p>

              <div className="grid grid-cols-2 gap-2 rounded-(--radius-md) bg-black/[0.03] p-2.5">
                <div>
                  <span className="block text-[10px] uppercase text-(--color-text-tertiary)">
                    Estadia À Vista (PIX)
                  </span>
                  <span className="text-sm font-bold tabular-nums text-(--color-positive)">
                    {formatCurrencyBRL(stayQuote.cashTotalCents)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-(--color-text-tertiary)">
                    Estadia Parcelada ({stayQuote.installments}x)
                  </span>
                  <span className="text-sm font-bold tabular-nums text-(--color-text-primary)">
                    {formatCurrencyBRL(stayQuote.installmentTotalCents)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-(--color-border)/60 pt-2.5">
              <span className="text-[11px] text-(--color-text-secondary)">
                Total Voo + Estadia: <b>{formatCurrencyBRL(meta?.cashPriceCents ?? sim.cashPriceCents ?? 0)}</b> à vista
              </span>
              <a
                href={stayQuote.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-(--color-primary) hover:underline"
              >
                Ver tarifas no Resort <ExternalLink size={11} />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PriceHistoryChart({
  history,
  isTravel,
}: {
  history: SimulationPriceSnapshot[];
  isTravel: boolean;
}) {
  const chartData = history.map((h) => ({
    date: new Date(h.capturedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    cash: h.cashPriceCents / 100,
    installment: h.installmentTotalCents / 100,
    flight: h.flightCashPriceCents ? h.flightCashPriceCents / 100 : undefined,
    stay: h.stayCashPriceCents ? h.stayCashPriceCents / 100 : undefined,
  }));

  const minCash = Math.min(...history.map((h) => h.cashPriceCents));
  const maxCash = Math.max(...history.map((h) => h.cashPriceCents));
  const latest = history[history.length - 1];

  return (
    <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h5 className="text-xs font-semibold text-(--color-text-primary)">
            Histórico de Preços Rastreados ({history.length}{" "}
            {history.length === 1 ? "verificação registrada" : "verificações registradas"})
          </h5>
          <p className="text-[11px] text-(--color-text-tertiary)">
            Menor histórico à vista: <b className="text-(--color-positive)">{formatCurrencyBRL(minCash)}</b> · Maior:{" "}
            <b>{formatCurrencyBRL(maxCash)}</b> · Atual: <b>{formatCurrencyBRL(latest?.cashPriceCents ?? minCash)}</b>
          </p>
        </div>
      </div>

      {chartData.length >= 2 && (
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height={176}>
            <LineChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-text-tertiary)" }}
                axisLine={false}
                tickLine={false}
                width={66}
                tickFormatter={(v) => `R$ ${Number(v).toLocaleString("pt-BR")}`}
              />
              <Tooltip
                formatter={(v) => formatCurrencyBRL(Math.round(Number(v) * 100))}
                contentStyle={{ borderRadius: 10, border: "1px solid var(--color-border)", fontSize: 11 }}
              />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="cash"
                name={isTravel ? "Total à vista (Voo + Estadia)" : "Menor à vista (PIX)"}
                stroke="var(--color-positive)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="installment"
                name={isTravel ? "Total Parcelado" : "Menor Parcelado (Mesma Loja)"}
                stroke="var(--color-primary)"
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={{ r: 2.5 }}
              />
              {isTravel && (
                <>
                  <Line type="monotone" dataKey="stay" name="Só Estadia (Resort)" stroke="var(--chart-2)" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="flight" name="Só Voo (RAO/VCP)" stroke="var(--chart-3)" strokeWidth={1.5} dot={false} />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function TravelSplitCards({
  sim,
  override,
  onOverrideChange,
}: {
  sim: Simulation;
  override?: TravelPartOverride;
  onOverrideChange: (patch: Partial<TravelPartOverride>) => void;
}) {
  const rawCfg = (sim.trackerConfig ?? {}) as Partial<TravelTrackerConfig>;
  const meta = sim.bestOfferMeta;
  const stay = meta?.stayQuote;
  const flights = meta?.flightQuotes ?? [];
  if (!stay && flights.length === 0) return null;

  const includeStay = override ? override.includeStay : rawCfg.includeStay !== false;
  const includeFlight = override ? override.includeFlight : rawCfg.includeFlight !== false;
  const activeOrigin = override?.originAirport || meta?.selectedFlightOrigin || flights[0]?.originAirport;
  const activeFlight = flights.find((f) => f.originAirport === activeOrigin) ?? flights[0];

  const stayOut = rawCfg.outboundDate || sim.startDate;
  const stayRet = rawCfg.returnDate || sim.startDate;
  const flightOut = activeFlight?.outboundDate || (rawCfg.sameDatesForFlight === false && rawCfg.flightOutboundDate ? rawCfg.flightOutboundDate : stayOut);
  const flightRet = activeFlight?.returnDate || (rawCfg.sameDatesForFlight === false && rawCfg.flightReturnDate ? rawCfg.flightReturnDate : stayRet);

  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
      {/* Card 1: Hospedagem independente */}
      {stay && (
        <div
          className={cn(
            "flex flex-col justify-between gap-3 rounded-(--radius-lg) border p-3.5 transition-opacity",
            includeStay
              ? "border-(--color-border) bg-(--color-surface)"
              : "border-dashed border-(--color-border) bg-black/[0.02] opacity-55"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary-soft) text-(--color-primary)">
                <Hotel size={15} />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-(--color-text-tertiary)">Hospedagem</p>
                <p className="text-sm font-bold text-(--color-text-primary)">{stay.accommodationName}</p>
                <p className="text-[11px] text-(--color-text-secondary)">
                  {formatDateBR(stayOut)} → {formatDateBR(stayRet)} · {stay.nights} noites · {stay.boardBasis}
                </p>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-(--color-text-secondary)">
              <input
                type="checkbox"
                checked={includeStay}
                onChange={(e) => onOverrideChange({ includeStay: e.target.checked })}
                className="h-3.5 w-3.5 accent-(--color-primary)"
              />
              Entra na conta
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-(--radius-md) border border-(--color-border) bg-black/[0.02] p-2.5 tabular-nums">
            <div>
              <span className="block text-[10px] text-(--color-text-secondary)">À vista (PIX)</span>
              <span className="text-sm font-extrabold text-(--color-positive)">{formatCurrencyBRL(stay.cashTotalCents)}</span>
            </div>
            <div>
              <span className="block text-[10px] text-(--color-text-secondary)">Parcelado ({stay.installments}×)</span>
              <span className="text-sm font-extrabold text-(--color-text-primary)">
                {formatCurrencyBRL(stay.installmentTotalCents)}
              </span>
              <span className="block text-[10px] text-(--color-text-tertiary)">
                {stay.installments}× de {formatCurrencyBRL(Math.round(stay.installmentTotalCents / Math.max(1, stay.installments)))}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-(--color-text-tertiary)">{stay.provider}</span>
            <a
              href={stay.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-(--color-primary) hover:underline"
            >
              Site oficial <ExternalLink size={11} />
            </a>
          </div>
        </div>
      )}

      {/* Card 2: Passagem Aérea independente (Cartão de Embarque) */}
      {activeFlight && (
        <div
          className={cn(
            "flex flex-col justify-between gap-3 rounded-(--radius-lg) border p-3.5 transition-opacity",
            includeFlight
              ? "border-(--color-border) bg-(--color-surface)"
              : "border-dashed border-(--color-border) bg-black/[0.02] opacity-55"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary-soft) text-(--color-primary)">
                <Plane size={15} />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-(--color-text-tertiary)">
                  Passagem Aérea ({rawCfg.adults ?? 2} adultos c/ taxas)
                </p>
                <p className="text-sm font-bold text-(--color-text-primary)">
                  {activeFlight.originAirport} → {activeFlight.destinationAirport} · {activeFlight.airline}
                </p>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-(--color-text-secondary)">
              <input
                type="checkbox"
                checked={includeFlight}
                onChange={(e) => onOverrideChange({ includeFlight: e.target.checked })}
                className="h-3.5 w-3.5 accent-(--color-primary)"
              />
              Entra na conta
            </label>
          </div>

          {flights.length > 1 && (
            <div className="flex flex-wrap gap-1.5 tabular-nums">
              {flights.map((fq) => {
                const selected = fq.originAirport === activeFlight.originAirport;
                return (
                  <button
                    key={fq.originAirport}
                    type="button"
                    onClick={() => onOverrideChange({ originAirport: fq.originAirport })}
                    className={cn(
                      "flex-1 rounded-(--radius-md) border px-2.5 py-1.5 text-left text-xs transition-colors",
                      selected
                        ? "border-(--color-primary) bg-(--color-primary-soft)/70"
                        : "border-(--color-border) bg-(--color-surface) hover:bg-black/[0.02]"
                    )}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>{fq.originAirport === "VCP" ? "VCP · Campinas" : fq.originAirport === "RAO" ? "RAO · Rib. Preto" : fq.originAirport}</span>
                      <span className={selected ? "text-(--color-positive)" : ""}>{formatCurrencyBRL(fq.cashTotalCents)}</span>
                    </div>
                    <div className="text-[10px] text-(--color-text-secondary)">
                      {fq.stopsCount === 0 ? "Direto" : `${fq.stopsCount} escala`} · {fq.durationSummary.split(" ")[0]}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Trechos estilo cartão de embarque */}
          <div className="space-y-2 rounded-(--radius-md) border border-dashed border-(--color-border) bg-black/[0.015] px-3 py-2 text-xs tabular-nums">
            <div className="grid grid-cols-[72px_1fr] items-center gap-2">
              <div>
                <span className="block text-[9.5px] font-bold uppercase text-(--color-text-tertiary)">Ida</span>
                <span className="font-semibold">{formatDateBR(flightOut).slice(0, 5)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="block text-sm font-extrabold">{activeFlight.outboundDepartureTime || (activeFlight.originAirport === "RAO" ? "06:00" : "08:15")}</span>
                  <span className="text-[10px] font-bold text-(--color-primary)">{activeFlight.originAirport}</span>
                </div>
                <div className="flex-1 border-b border-(--color-border) pb-0.5 text-center text-[10px] text-(--color-text-secondary)">
                  {activeFlight.stopsCount === 0 ? "Direto" : `${activeFlight.stopsCount} escala`} · {activeFlight.durationSummary.split(" ")[0]}
                </div>
                <div className="text-right">
                  <span className="block text-sm font-extrabold">{activeFlight.outboundArrivalTime || (activeFlight.originAirport === "RAO" ? "10:50" : "11:25")}</span>
                  <span className="text-[10px] font-bold text-(--color-primary)">{activeFlight.destinationAirport}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-[72px_1fr] items-center gap-2 border-t border-(--color-border)/60 pt-2">
              <div>
                <span className="block text-[9.5px] font-bold uppercase text-(--color-text-tertiary)">Volta</span>
                <span className="font-semibold">{formatDateBR(flightRet).slice(0, 5)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="block text-sm font-extrabold">{activeFlight.returnDepartureTime || (activeFlight.originAirport === "RAO" ? "14:20" : "15:40")}</span>
                  <span className="text-[10px] font-bold text-(--color-primary)">{activeFlight.destinationAirport}</span>
                </div>
                <div className="flex-1 border-b border-(--color-border) pb-0.5 text-center text-[10px] text-(--color-text-secondary)">
                  {activeFlight.stopsCount === 0 ? "Direto" : `${activeFlight.stopsCount} escala`}
                </div>
                <div className="text-right">
                  <span className="block text-sm font-extrabold">{activeFlight.returnArrivalTime || (activeFlight.originAirport === "RAO" ? "19:15" : "18:55")}</span>
                  <span className="text-[10px] font-bold text-(--color-primary)">{activeFlight.originAirport}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums">
            <span className="text-(--color-text-secondary)">
              À vista <b className="text-(--color-positive)">{formatCurrencyBRL(activeFlight.cashTotalCents)}</b> · {activeFlight.installments}× de{" "}
              <b>{formatCurrencyBRL(Math.round(activeFlight.installmentTotalCents / Math.max(1, activeFlight.installments)))}</b>
            </span>
            <a
              href={activeFlight.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-(--color-primary) hover:underline"
            >
              Google Flights <ExternalLink size={11} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
