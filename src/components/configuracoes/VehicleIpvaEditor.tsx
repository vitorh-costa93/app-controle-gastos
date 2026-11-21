"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { FileText, Sparkles } from "lucide-react";
import { Person, Category, TransactionType } from "@/types/db";
import {
  FipeOption,
  IpvaChoiceOption,
  VehiclePdfAnalysis,
  VehicleSettings,
  analyzeVehiclePdf,
  chooseIpva,
  listFipeBrands,
  listFipeModels,
  listFipeYears,
  saveVehicle,
  simulateIpva,
} from "@/lib/data/vehicle";
import { IPVA_RULES, computeIpva, nextIpvaYear } from "@/lib/domain/ipva";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Select } from "@/components/ui/Field";
import { formatCurrencyBRL } from "@/lib/utils/format";

function centsToInputBRL(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function parseInputBRLToCents(raw: string): number {
  const cleaned = raw.replace(/[^\d,]/g, "").replace(",", ".");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
}

export function VehicleIpvaEditor({
  vehicle: initialVehicle,
  people,
  categories,
  types,
}: {
  vehicle: VehicleSettings | null;
  people: Person[];
  categories: Category[];
  types: TransactionType[];
}) {
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [editing, setEditing] = useState(!initialVehicle);
  const [brands, setBrands] = useState<FipeOption[]>([]);
  const [models, setModels] = useState<FipeOption[]>([]);
  const [years, setYears] = useState<FipeOption[]>([]);
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [yearId, setYearId] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [pdfAnalysis, setPdfAnalysis] = useState<VehiclePdfAnalysis | null>(null);
  const [includeLicensing, setIncludeLicensing] = useState(true);
  const [licensingInput, setLicensingInput] = useState(centsToInputBRL(IPVA_RULES.licensingCents));
  const [launchedFromPdf, setLaunchedFromPdf] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [analyzingPdf, setAnalyzingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function run<T extends { ok: boolean }>(action: () => Promise<T>, onOk: (r: Extract<T, { ok: true }>) => void) {
    setError(null);
    setMessage(null);
    startSaving(async () => {
      const result = await action();
      if (!result.ok) {
        setError((result as unknown as { error: string }).error);
        return;
      }
      onOk(result as Extract<T, { ok: true }>);
    });
  }

  useEffect(() => {
    if (!editing || brands.length > 0) return;
    startLoading(async () => {
      try {
        setBrands(await listFipeBrands());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível carregar as marcas.");
      }
    });
  }, [editing, brands.length]);

  function pickBrand(id: string) {
    setBrandId(id);
    setModelId("");
    setYearId("");
    setModels([]);
    setYears([]);
    if (!id) return;
    startLoading(async () => {
      try {
        setModels(await listFipeModels(id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível carregar os modelos.");
      }
    });
  }

  function pickModel(id: string) {
    setModelId(id);
    setYearId("");
    setYears([]);
    if (!id) return;
    startLoading(async () => {
      try {
        setYears(await listFipeYears(brandId, id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível carregar os anos.");
      }
    });
  }

  function handleSaveVehicle() {
    const brand = brands.find((b) => b.code === brandId);
    const model = models.find((m) => m.code === modelId);
    const year = years.find((y) => y.code === yearId);
    if (!brand || !model || !year) return;
    run(
      () =>
        saveVehicle({
          brandId,
          brandName: brand.name,
          modelId,
          modelName: model.name,
          yearId,
          yearName: year.name,
        }),
      (r) => {
        setVehicle(r.vehicle);
        setEditing(false);
        setMessage("Valor FIPE atualizado.");
      }
    );
  }

  async function handlePdfUpload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setMessage(null);
    setLaunchedFromPdf(null);
    setAnalyzingPdf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await analyzeVehiclePdf(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const analysis = result.analysis;
      setPdfAnalysis(analysis);
      setLicensingInput(centsToInputBRL(analysis.licensingCents));
      if (analysis.vehicle) {
        setVehicle(analysis.vehicle);
        setEditing(false);
      } else if (analysis.cashWithoutDiscountCents === null) {
        setEditing(true);
      }
      setMessage(
        analysis.notes || "PDF analisado! Confira os valores abaixo e escolha a opção para lançar."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar o PDF.");
    } finally {
      setAnalyzingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const plan = vehicle ? computeIpva(vehicle.fipeCents) : null;
  const year = pdfAnalysis?.year ?? nextIpvaYear(new Date());
  const imposto = types.find((t) => t.name.toLowerCase().includes("imposto"))?.id ?? null;
  const categoriaIpva = categories.find((c) => c.name.toLowerCase().includes("ipva"))?.id ?? null;
  const hasSimulations = (vehicle?.ipvaSimulationIds.length ?? 0) > 0;
  const visibleModels = models.filter((m) => m.name.toLowerCase().includes(modelFilter.trim().toLowerCase()));

  const cashWithDiscountCents = pdfAnalysis?.cashWithDiscountCents ?? plan?.cashCents ?? null;
  const cashWithoutDiscountCents = pdfAnalysis?.cashWithoutDiscountCents ?? plan?.fullCents ?? null;
  const installmentCents = pdfAnalysis?.installmentCents ?? plan?.installmentCents ?? null;
  const licensingCents = parseInputBRLToCents(licensingInput) || IPVA_RULES.licensingCents;

  function handleChoose(option: IpvaChoiceOption) {
    if (cashWithDiscountCents === null || cashWithoutDiscountCents === null || !installmentCents) return;
    run(
      () =>
        chooseIpva(option, personId, imposto, categoriaIpva, {
          cashWithDiscountCents,
          cashWithoutDiscountCents,
          installmentCents,
          licensingCents,
          includeLicensing,
          year,
          plateFinalDigit: pdfAnalysis?.plateFinalDigit ?? null,
          ipvaFirstDueDate: pdfAnalysis?.ipvaFirstDueDate ?? null,
          licensingDueDate: pdfAnalysis?.licensingDueDate ?? null,
        }),
      (r) => {
        if (r.vehicle) setVehicle(r.vehicle);
        const label =
          option === "cash_discount"
            ? "à vista com desconto"
            : option === "cash_full"
              ? "à vista sem desconto"
              : `${installmentCents.length}x`;
        const licMsg = includeLicensing ? " + Licenciamento anual" : "";
        const doneText = `Lançamentos criados: IPVA (${label})${licMsg} em Cadastro → Recorrências.`;
        setLaunchedFromPdf(doneText);
        setMessage(doneText);
      }
    );
  }

  const showOptions =
    cashWithDiscountCents !== null && cashWithoutDiscountCents !== null && installmentCents !== null && (!editing || Boolean(pdfAnalysis));

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Veículo, IPVA e Licenciamento</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        Envie o PDF do licenciamento (CRLV-e ou guia de IPVA) para a IA identificar o veículo e calcular à vista com
        desconto, à vista sem desconto, parcelado e licenciamento — ou selecione o carro manualmente pela tabela FIPE.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-(--radius-md) border border-dashed border-(--color-border) bg-(--color-surface-subtle,transparent) p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => void handlePdfUpload(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={analyzingPdf || saving}
          onClick={() => fileInputRef.current?.click()}
        >
          <Sparkles size={15} className="mr-1.5" />
          {analyzingPdf ? "Lendo PDF com IA..." : "Enviar PDF do licenciamento (IA)"}
        </Button>
        {pdfAnalysis && (
          <span className="inline-flex items-center gap-1 text-xs text-(--color-text-secondary)">
            <FileText size={14} />
            {pdfAnalysis.vehicleSummary}
            {pdfAnalysis.plate ? ` · Placa ${pdfAnalysis.plate}` : ""}
            {pdfAnalysis.uf ? ` (${pdfAnalysis.uf})` : ""}
          </span>
        )}
      </div>

      {vehicle && !editing && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">
              {vehicle.brandName} {vehicle.modelName} · {vehicle.yearName}
            </p>
            <p className="text-xs text-(--color-text-tertiary)">
              FIPE {formatCurrencyBRL(vehicle.fipeCents)} · referência {vehicle.fipeMonth} · código {vehicle.fipeCode}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={saving}
              onClick={() =>
                run(
                  () =>
                    saveVehicle({
                      brandId: vehicle.brandId,
                      brandName: vehicle.brandName,
                      modelId: vehicle.modelId,
                      modelName: vehicle.modelName,
                      yearId: vehicle.yearId,
                      yearName: vehicle.yearName,
                    }),
                  (r) => {
                    setVehicle(r.vehicle);
                    setPdfAnalysis(null);
                    setMessage("Valor FIPE atualizado.");
                  }
                )
              }
            >
              Atualizar valor
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Trocar veículo
            </Button>
          </div>
        </div>
      )}

      {showOptions && (
        <div className="mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col justify-between rounded-(--radius-md) border border-(--color-border) p-3">
              <div>
                <p className="text-xs text-(--color-text-tertiary)">IPVA {year} — à vista c/ desconto</p>
                <p className="text-lg font-semibold tabular-nums">{formatCurrencyBRL(cashWithDiscountCents)}</p>
                <p className="text-xs text-(--color-text-tertiary)">
                  {IPVA_RULES.cashDiscountPct}% de desconto (cota única)
                </p>
              </div>
              {(!vehicle?.ipvaChosen || pdfAnalysis) && !launchedFromPdf && (
                <Button
                  size="sm"
                  className="mt-3 w-full"
                  disabled={saving || !personId}
                  onClick={() => handleChoose("cash_discount")}
                  type="button"
                >
                  Escolher c/ desconto
                </Button>
              )}
            </div>

            <div className="flex flex-col justify-between rounded-(--radius-md) border border-(--color-border) p-3">
              <div>
                <p className="text-xs text-(--color-text-tertiary)">IPVA {year} — à vista s/ desconto</p>
                <p className="text-lg font-semibold tabular-nums">{formatCurrencyBRL(cashWithoutDiscountCents)}</p>
                <p className="text-xs text-(--color-text-tertiary)">valor cheio em cota única</p>
              </div>
              {(!vehicle?.ipvaChosen || pdfAnalysis) && !launchedFromPdf && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3 w-full"
                  disabled={saving || !personId}
                  onClick={() => handleChoose("cash_full")}
                  type="button"
                >
                  Escolher s/ desconto
                </Button>
              )}
            </div>

            <div className="flex flex-col justify-between rounded-(--radius-md) border border-(--color-border) p-3">
              <div>
                <p className="text-xs text-(--color-text-tertiary)">
                  IPVA {year} — {installmentCents.length} parcelas
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {installmentCents.length}x de {formatCurrencyBRL(installmentCents[0])}
                </p>
                <p className="text-xs text-(--color-text-tertiary)">
                  total {formatCurrencyBRL(installmentCents.reduce((s, v) => s + v, 0))}
                </p>
              </div>
              {(!vehicle?.ipvaChosen || pdfAnalysis) && !launchedFromPdf && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3 w-full"
                  disabled={saving || !personId}
                  onClick={() => handleChoose("installments")}
                  type="button"
                >
                  Escolher {installmentCents.length}x
                </Button>
              )}
            </div>

            <div className="flex flex-col justify-between rounded-(--radius-md) border border-(--color-border) p-3">
              <div>
                <p className="text-xs text-(--color-text-tertiary)">Licenciamento {year}</p>
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-sm text-(--color-text-tertiary)">R$</span>
                  <Input
                    value={licensingInput}
                    onChange={(e) => setLicensingInput(e.target.value)}
                    aria-label="Valor do licenciamento"
                    className="h-8 text-sm font-semibold tabular-nums"
                  />
                </div>
                <p className="mt-1 text-xs text-(--color-text-tertiary)">
                  {pdfAnalysis?.licensingFromPdf ? "lido do PDF" : `referência ${pdfAnalysis?.uf ?? IPVA_RULES.uf}`}
                </p>
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-(--color-text-secondary)">
                <input
                  type="checkbox"
                  checked={includeLicensing}
                  onChange={(e) => setIncludeLicensing(e.target.checked)}
                />
                Lançar licenciamento junto
              </label>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-[220px_auto_auto]">
            <FieldGroup label="Lançar para quem?">
              <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FieldGroup>

            {vehicle && !vehicle.ipvaChosen && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    run(simulateIpva, (r) => {
                      setVehicle(r.vehicle);
                      setMessage("Cenários criados. Compare o impacto no saldo em Simulação.");
                    })
                  }
                  type="button"
                >
                  {hasSimulations ? "Refazer simulação" : "Simular à vista × parcelado"}
                </Button>
                {hasSimulations && (
                  <Link
                    href="/simulacao"
                    className="inline-flex h-9 items-center rounded-(--radius-md) px-3 text-xs font-medium text-(--color-primary) hover:bg-black/5"
                  >
                    Ver em Simulação
                  </Link>
                )}
              </div>
            )}
          </div>

          {vehicle?.ipvaChosen && !pdfAnalysis && (
            <p className="mt-3 text-sm text-(--color-positive)">
              Escolhido:{" "}
              {vehicle.ipvaChosen.option === "cash_discount"
                ? "à vista c/ desconto"
                : vehicle.ipvaChosen.option === "cash_full"
                  ? "à vista s/ desconto"
                  : vehicle.ipvaChosen.option === "cash"
                    ? "à vista"
                    : `${IPVA_RULES.maxInstallments} cotas`}{" "}
              (a partir de {vehicle.ipvaChosen.year}). Ele repete todo ano em Cadastro → Recorrências.
            </p>
          )}
        </div>
      )}

      {editing && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FieldGroup label="Marca">
            <Select value={brandId} onChange={(e) => pickBrand(e.target.value)}>
              <option value="">{loading && brands.length === 0 ? "Carregando..." : "Selecione"}</option>
              {brands.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup label="Filtrar modelo">
            <Input
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              placeholder="Ex.: Onix 1.0"
              disabled={models.length === 0}
            />
          </FieldGroup>
          <FieldGroup label="Modelo">
            <Select value={modelId} onChange={(e) => pickModel(e.target.value)} disabled={models.length === 0}>
              <option value="">Selecione</option>
              {visibleModels.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name}
                </option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup label="Ano / combustível">
            <Select value={yearId} onChange={(e) => setYearId(e.target.value)} disabled={years.length === 0}>
              <option value="">Selecione</option>
              {years.map((y) => (
                <option key={y.code} value={y.code}>
                  {y.name}
                </option>
              ))}
            </Select>
          </FieldGroup>
          <div className="flex gap-2 sm:col-span-2">
            <Button onClick={handleSaveVehicle} disabled={!yearId || saving} type="button">
              Buscar valor FIPE
            </Button>
            {vehicle && (
              <Button variant="ghost" onClick={() => setEditing(false)} type="button">
                Cancelar
              </Button>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-(--color-negative)">{error}</p>}
      {message && <p className="mt-3 text-sm text-(--color-text-secondary)">{message}</p>}
    </Card>
  );
}
