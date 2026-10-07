import { z } from "zod";

const uuid = z.uuid();
export const bulkEditSchema = z.object({
  ids: z.array(z.string().regex(/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|projected:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:\d{4}-(?:0[1-9]|1[0-2]))$/i)).min(1).max(500),
  patch: z.object({
    referenceMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
    personId: uuid.optional(),
    direction: z.enum(["income", "expense"]).optional(),
    fixedVariable: z.enum(["fixed", "variable"]).optional(),
    typeId: uuid.nullable().optional(),
    categoryId: uuid.nullable().optional(),
    bank: z.enum(["picpay", "nubank"]).nullable().optional(),
  }).strict().refine((p) => Object.keys(p).length > 0, "Escolha ao menos um campo para alterar."),
}).strict().refine((value) => new Set(value.ids).size === value.ids.length, "Há registros repetidos na seleção.");

export type BulkEditPatch = z.infer<typeof bulkEditSchema>["patch"];

export function bulkDatabasePatch(patch: BulkEditPatch): Record<string, string | null> {
  const names = { referenceMonth: "reference_month", personId: "person_id", direction: "direction", fixedVariable: "fixed_variable", typeId: "type_id", categoryId: "category_id", bank: "bank" } as const;
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [names[key as keyof BulkEditPatch], value]));
}
