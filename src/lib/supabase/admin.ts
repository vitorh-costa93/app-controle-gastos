import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com service role — nunca importar em código que roda no navegador.
 * Todas as operações de dados do app passam por aqui (server actions / route handlers),
 * já que não há autenticação individual nem policies de RLS abertas ao cliente.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configuradas no ambiente do servidor."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Isolado no schema "meudinheiro" para conviver no mesmo projeto Supabase
    // com outras tabelas/dados sem colidir (ver supabase/migrations/0001_init.sql).
    db: { schema: "meudinheiro" },
  });
}
