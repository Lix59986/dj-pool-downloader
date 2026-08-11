import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function assertEnv() {
  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Отсутствуют переменные окружения NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (см. .env.example)",
    );
  }
}

/** Клиент с анонимным ключом (для входа пользователя). */
export function supabaseAnon(): SupabaseClient {
  assertEnv();
  return createClient(supabaseUrl, anonKey);
}

/** Клиент с service-role ключом (только серверные операции: admin.createUser и т.п.). */
export function supabaseAdmin(): SupabaseClient {
  if (!serviceRoleKey) {
    throw new Error("Отсутствует переменная окружения SUPABASE_SERVICE_ROLE_KEY (см. .env.example)");
  }
  assertEnv();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Клиент от имени пользователя по его JWT (для проверки прав через RLS). */
export function supabaseUser(token: string): SupabaseClient {
  assertEnv();
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
