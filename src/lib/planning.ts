import { z } from "zod";

const id = z.string().uuid();
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
const cents = z.number().int().safe();
export const categoryLimitSchema = z.object({ personId: id, categoryId: id, month: monthSchema, amountCents: cents.positive() });
export const saveCategoryLimitSchema = categoryLimitSchema.extend({ amountCents: cents.positive().nullable() });
export const reserveEntrySchema = z.object({ id, personId: id, date: dateSchema, amountCents: cents.refine((value) => value !== 0), note: z.string().trim().max(200) });
export const saveReserveEntrySchema = reserveEntrySchema.extend({ id: id.optional() });
export const reserveConfigSchema = z.object({ essentialCategoryIds: z.array(id).max(500).refine((ids) => new Set(ids).size === ids.length), targetMonths: z.number().int().min(1).max(120), targetAmountCents: cents.positive().nullable().default(null) });
export type CategoryLimit = z.infer<typeof categoryLimitSchema>;
export type ReserveEntry = z.infer<typeof reserveEntrySchema>;
export type ReserveConfig = z.infer<typeof reserveConfigSchema>;
export type PlanningData = { limits: CategoryLimit[]; reserveEntries: ReserveEntry[]; reserveConfig: ReserveConfig };
export const defaultReserveConfig: ReserveConfig = { essentialCategoryIds: [], targetMonths: 6, targetAmountCents: null };

export function getCategoryLimit(data: PlanningData, personIds: string[], categoryId: string, month: string): number | null {
  const ids = [...new Set(personIds)];
  if (!ids.length) return null;
  const values = ids.map((personId) => data.limits.find((limit) => limit.personId === personId && limit.categoryId === categoryId && limit.month === month)?.amountCents);
  return values.some((value) => value === undefined) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

/** Inclui todos os movimentos até o fim do mês selecionado. */
export function getReserveBalance(data: PlanningData, personIds: string[], month: string): number {
  const ids = new Set(personIds);
  return data.reserveEntries.filter((entry) => ids.has(entry.personId) && entry.date.slice(0, 7) <= month).reduce((sum, entry) => sum + entry.amountCents, 0);
}
