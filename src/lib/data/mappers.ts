import {
  TransactionRow,
  RecurrenceRule as RecurrenceRuleRow,
  SimulationRow,
  SimulationPriceSnapshotRow,
  SimulationPriceAlertRow,
} from "@/types/db";
import {
  Transaction,
  RecurrenceRule,
  RecurrenceAmountVersion,
  Simulation,
  SimulationPriceSnapshot,
  SimulationPriceAlert,
} from "@/types/domain";

/** Postgres NUMERIC chega como string ("1234.56") — converte para centavos exatos. */
export function reaisStringToCents(value: string | number): number {
  const [reais, cents = "0"] = String(value).split(".");
  const sign = reais.startsWith("-") ? -1 : 1;
  const reaisAbs = reais.replace("-", "");
  return sign * (Number(reaisAbs) * 100 + Number(cents.padEnd(2, "0").slice(0, 2)));
}

export function centsToReaisString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    bank: row.bank ?? null,
    id: row.id,
    registrationDate: row.registration_date,
    referenceMonth: row.reference_month,
    personId: row.person_id,
    direction: row.direction,
    fixedVariable: row.fixed_variable,
    typeId: row.type_id,
    categoryId: row.category_id,
    installmentCurrent: row.installment_current,
    installmentTotal: row.installment_total,
    amountCents: reaisStringToCents(row.amount),
    description: row.description,
    considered: row.considered,
    validated: row.validated ?? false,
    source: row.source,
    aiConfidence: row.ai_confidence,
    recurrenceRuleId: row.recurrence_rule_id,
    installmentGroupId: row.installment_group_id ?? null,
    unplannedExcluded: row.unplanned_excluded ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRecurrenceRuleRow(row: RecurrenceRuleRow, amountHistory: RecurrenceAmountVersion[] = []): RecurrenceRule {
  return {
    id: row.id,
    description: row.description,
    personId: row.person_id,
    direction: row.direction,
    typeId: row.type_id,
    categoryId: row.category_id,
    amountCents: reaisStringToCents(row.amount),
    frequency: row.frequency,
    startDate: row.start_date,
    endDate: row.end_date,
    active: row.active,
    bank: row.bank ?? null,
    skippedMonths: row.skipped_months ?? [],
    amountHistory,
  };
}

export function mapSimulationRow(row: SimulationRow): Simulation {
  const totalAmountCents = reaisStringToCents(row.total_amount);
  return {
    id: row.id,
    description: row.description,
    totalAmountCents,
    cashPriceCents: row.cash_price == null ? null : reaisStringToCents(row.cash_price),
    installments: row.installments,
    installmentAmountCents: Math.round(totalAmountCents / Math.max(1, row.installments)),
    startDate: row.start_date,
    active: row.active,
    aiSummary: row.ai_summary,
    imageUrl: row.image_url,
    category: row.category ?? "product",
    autoTrack: row.auto_track ?? false,
    trackerConfig: row.tracker_config ?? null,
    bestOfferMeta: row.best_offer_meta ?? null,
    lastTrackedAt: row.last_tracked_at ?? null,
    createdAt: row.created_at,
  };
}

export function mapSimulationPriceSnapshotRow(row: SimulationPriceSnapshotRow): SimulationPriceSnapshot {
  return {
    id: row.id,
    simulationId: row.simulation_id,
    capturedAt: row.captured_at,
    category: row.category,
    storeOrProvider: row.store_or_provider,
    cashPriceCents: reaisStringToCents(row.cash_price),
    installmentTotalCents: reaisStringToCents(row.installment_total),
    installments: row.installments,
    flightCashPriceCents: row.flight_cash_price == null ? null : reaisStringToCents(row.flight_cash_price),
    flightOrigin: row.flight_origin,
    stayCashPriceCents: row.stay_cash_price == null ? null : reaisStringToCents(row.stay_cash_price),
    stayInstallmentTotalCents: row.stay_installment_total == null ? null : reaisStringToCents(row.stay_installment_total),
    offerUrl: row.offer_url,
    verifiedNew: row.verified_new,
  };
}

export function mapSimulationPriceAlertRow(row: SimulationPriceAlertRow): SimulationPriceAlert {
  return {
    id: row.id,
    simulationId: row.simulation_id,
    snapshotId: row.snapshot_id,
    createdAt: row.created_at,
    alertType: row.alert_type,
    title: row.title,
    message: row.message,
    previousCashPriceCents: row.previous_cash_price == null ? null : reaisStringToCents(row.previous_cash_price),
    newCashPriceCents: reaisStringToCents(row.new_cash_price),
    dropPercent: row.drop_percent == null ? null : Number(row.drop_percent),
    offerUrl: row.offer_url,
    readAt: row.read_at,
    notifiedChannels: row.notified_channels ?? [],
  };
}
