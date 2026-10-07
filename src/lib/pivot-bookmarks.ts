import { z } from "zod";

export const pivotDimension = z.enum(["month", "person", "category", "type", "fixedVariable", "direction", "considered", "bank"]);
const measure = z.enum(["sum", "count"]);
export const pivotConfigSchema = z.object({
  rowDims: z.array(pivotDimension).max(8),
  colDims: z.array(pivotDimension).max(8),
  measures: z.array(measure).max(2),
  descDims: z.array(pivotDimension).max(8),
  expandTo: z.number().int().min(1).max(8).nullable(),
  toggled: z.array(z.string().max(2000)).max(1000),
  totals: z.enum(["none", "row", "column", "both"]),
  totalAgg: z.enum(["sum", "avg"]),
  directionFilter: z.enum(["expense", "income", "all"]),
  valueFilters: z.partialRecord(pivotDimension, z.array(z.string().max(300)).max(1000)),
  currentMonthOnly: z.boolean(),
  valueSort: z.object({ colKey: z.string().max(2000), measure, dir: z.enum(["asc", "desc"]) }).nullable(),
});
export const pivotBookmarkSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500),
  config: pivotConfigSchema,
});
export type PivotBookmark = z.infer<typeof pivotBookmarkSchema>;
