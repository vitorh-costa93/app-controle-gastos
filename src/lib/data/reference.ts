"use server";

import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { Person, Category, TransactionType } from "@/types/db";

// Pessoas/categorias/tipos mudam raramente — cacheados com invalidação sob demanda
// (revalidateTag nas mutações abaixo), em vez de bater no Supabase a cada navegação.
const CACHE_REVALIDATE_SECONDS = 300;

export const listPeople = unstable_cache(
  async (): Promise<Person[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("people")
      .select("*")
      .eq("active", true)
      .order("created_at");
    if (error) {
      console.error("listPeople failed:", error);
      throw new Error("Não foi possível carregar as pessoas.");
    }
    return data as Person[];
  },
  ["people"],
  { tags: ["people"], revalidate: CACHE_REVALIDATE_SECONDS }
);

export const listCategories = unstable_cache(
  async (): Promise<Category[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("active", true)
      .order("name");
    if (error) {
      console.error("listCategories failed:", error);
      throw new Error("Não foi possível carregar as categorias.");
    }
    return data as Category[];
  },
  ["categories"],
  { tags: ["categories"], revalidate: CACHE_REVALIDATE_SECONDS }
);

export const listTransactionTypes = unstable_cache(
  async (): Promise<TransactionType[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("transaction_types")
      .select("*")
      .eq("active", true)
      .order("name");
    if (error) {
      console.error("listTransactionTypes failed:", error);
      throw new Error("Não foi possível carregar os tipos.");
    }
    return data as TransactionType[];
  },
  ["transaction-types"],
  { tags: ["transaction-types"], revalidate: CACHE_REVALIDATE_SECONDS }
);

export async function createPerson(
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const { error } = await supabase.from("people").insert({ name, initials });
  if (error) {
    console.error("createPerson failed:", error);
    if (error.code === "23505") return { ok: false, error: "Já existe uma pessoa com esse nome." };
    return { ok: false, error: "Não foi possível adicionar esta pessoa." };
  }
  revalidateTag("people");
  revalidatePath("/configuracoes");
  return { ok: true };
}

export async function createCategory(
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("categories").insert({ name });
  if (error) {
    console.error("createCategory failed:", error);
    return { ok: false, error: "Não foi possível adicionar esta categoria." };
  }
  revalidateTag("categories");
  revalidatePath("/configuracoes");
  return { ok: true };
}

export async function createTransactionType(
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("transaction_types").insert({ name });
  if (error) {
    console.error("createTransactionType failed:", error);
    return { ok: false, error: "Não foi possível adicionar este tipo." };
  }
  revalidateTag("transaction-types");
  revalidatePath("/configuracoes");
  return { ok: true };
}

export async function deactivateReferenceItem(
  table: "people" | "categories" | "transaction_types",
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from(table).update({ active: false }).eq("id", id);
  if (error) {
    console.error("deactivateReferenceItem failed:", error);
    return { ok: false, error: "Não foi possível remover este item." };
  }
  const tag = table === "people" ? "people" : table === "categories" ? "categories" : "transaction-types";
  revalidateTag(tag);
  revalidatePath("/configuracoes");
  return { ok: true };
}
