import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();

function validPublicConfiguration() {
  try {
    const url = new URL(supabaseUrl);
    return url.protocol === "https:" && /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url.origin) &&
      url.origin === supabaseUrl && publishableKey.startsWith("sb_publishable_");
  } catch {
    return false;
  }
}

export const supabaseAuthConfigured = validPublicConfiguration();

if (import.meta.env.PROD && !supabaseAuthConfigured) {
  throw new Error("Owner authentication requires valid public Supabase configuration.");
}

export const supabase = createClient(
  supabaseUrl || "https://invalid.localhost",
  publishableKey || "sb_publishable_missing",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } },
);

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabaseAuthConfigured) return null;
  const { data, error } = await supabase.auth.getSession();
  return error ? null : data.session;
}

export async function signInOwner(email: string, password: string) {
  if (!supabaseAuthConfigured) throw new Error("Owner authentication is not configured.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error("A verified owner session is required.");
  return data.session;
}

export async function signOutOwner() {
  await supabase.auth.signOut({ scope: "local" });
}
