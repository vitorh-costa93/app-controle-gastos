"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { pivotBookmarkSchema, type PivotBookmark } from "@/lib/pivot-bookmarks";

const PREFIX = "pivot_bookmark:";

export async function listPivotBookmarks(): Promise<PivotBookmark[]> {
  const { data, error } = await createAdminClient().from("app_settings").select("value").like("key", `${PREFIX}%`).order("updated_at");
  if (error) throw new Error("Não foi possível carregar as views.");
  return (data ?? []).flatMap((row) => {
    const result = pivotBookmarkSchema.safeParse(row.value);
    return result.success ? [result.data] : [];
  });
}

export async function savePivotBookmark(input: PivotBookmark): Promise<PivotBookmark> {
  const bookmark = pivotBookmarkSchema.parse(input);
  const { error } = await createAdminClient().from("app_settings").upsert({
    key: `${PREFIX}${bookmark.id}`, value: bookmark, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Não foi possível salvar a view.");
  return bookmark;
}
