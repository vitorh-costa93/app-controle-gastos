"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Person, Category, TransactionType } from "@/types/db";
import {
  FipeOption,
  VehicleSettings,
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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

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

  const plan = vehicle ? computeIpva(vehicle.fipeCents) : null;
  const year = nextIpvaYear(new Date());
  const imposto = types.find((t) => t.name.toLowerCase().includes("imposto"))?.id ?? null;
  const categoriaIpva = categories.find((c) => c.name.toLowerCase().includes("ipva"))?.id ?? null;
  const hasSimulations = (vehicle?.ipvaSimulationIds.length ?? 0) > 0;
  const visibleModels = models.filter((m) => m.name.toLowerCase().includes(modelFilter.trim().toLowerCase()));

  return (
    <Card className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Veículo e IPVA</h3>
      <p className="mb-4 text-xs text-(--color-text-tertiary)">
        Informe o carro e o app busca o valor atual na tabela FIPE e calcula o IPVA ({IPVA_RULES.uf}:{" "}
        {IPVA_RULES.rate * 100}% da FIPE, até {IPVA_RULES.maxInstallments} cotas) à vista e parcelado, para você
        comparar em Simulação e escolher.
      </p>

      {vehicle && !editing && plan && (
        <div className="mb-4">
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-(--radius-md) border border-(--color-border) p-3">
              <p className="text-xs text-(--color-text-tertiary)">IPVA {year} — à vista</p>
              <p className="text-lg font-semibold tabular-nums">{formatCurrencyBRL(plan.cashCents)}</p>
              {IPVA_RULES.cashDiscountPct > 0 && (
                <p className="text-xs text-(--color-text-tertiary)">com {IPVA_RULES.cashDiscountPct}% de desconto</p>
              )}
            </div>
            <div className="rounded-(--radius-md) border border-(--color-border) p-3">
              <p className="text-xs text-(--color-text-tertiary)">IPVA {year} — {IPVA_RULES.maxInstallments} cotas</p>
              <p className="text-lg font-semibold tabular-nums">
                {IPVA_RULES.maxInstallments}x de {formatCurrencyBRL(plan.installmentCents[0])}
              </p>
              <p className="text-xs text-(--color-text-tertiary)">total {formatCurrencyBRL(plan.fullCents)}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-(--color-text-tertiary)">
            Vencimento aproximado em janeiro (o dia exato depende do final da placa). Confira o valor oficial no
            site da Sefaz-SP antes de pagar.
          </p>

          {vehicle.ipvaChosen ? (
            <p className="mt-3 text-sm text-(--color-positive)">
              Escolhido: {vehicle.ipvaChosen.option === "cash" ? "à vista" : `${IPVA_RULES.maxInstallments} cotas`} (a
              partir de {vehicle.ipvaChosen.year}). Ele repete todo ano em Cadastro → Recorrências.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() =>
                    run(simulateIpva, (r) => {
                      setVehicle(r.vehicle);
                      setMessage("Cenários criados. Compare o impacto no saldo em Simulação e escolha abaixo.");
                    })
                  }
                  type="button"
                >
                  {hasSimulations ? "Refazer simulação" : "Simular à vista × parcelado"}
                </Button>
                {hasSimulations && (
                  <Link
                    href="/simulacao"
                    className="inline-flex h-10 items-center rounded-(--radius-md) px-4 text-sm font-medium text-(--color-primary) hover:bg-black/5"
                  >
                    Ver em Simulação
                  </Link>
                )}
              </div>

              {hasSimulations && (
                <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
                  <FieldGroup label="IPVA de quem?">
                    <Select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </FieldGroup>
                  <Button
                    disabled={saving || !personId}
                    onClick={() =>
                      run(
                        () => chooseIpva("cash", personId, imposto, categoriaIpva),
                        (r) => {
                          setVehicle(r.vehicle);
                          setMessage("IPVA à vista lançado como saída anual.");
                        }
                      )
                    }
                    type="button"
                  >
                    Escolher à vista
                  </Button>
                  <Button
                    disabled={saving || !personId}
                    onClick={() =>
                      run(
                        () => chooseIpva("installments", personId, imposto, categoriaIpva),
                        (r) => {
                          setVehicle(r.vehicle);
                          setMessage("IPVA parcelado lançado como saídas anuais.");
                        }
                      )
                    }
                    type="button"
                  >
                    Escolher {IPVA_RULES.maxInstallments}x
                  </Button>
                </div>
              )}
            </div>
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
