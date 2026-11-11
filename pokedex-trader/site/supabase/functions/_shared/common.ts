// Outils partagés par les fonctions Edge (Deno) : CORS, client Supabase "service", appels Stripe.
// Aucune clé n'est écrite ici : tout vient des secrets du projet Supabase.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Secret manquant : ${name}`);
  return v;
}

/** URL publique du site, sans "/" final (ex. https://pokedex-trader.netlify.app). */
export function siteUrl(): string {
  return env("SITE_URL").replace(/\/+$/, "");
}

export function corsHeaders(req: Request): Record<string, string> {
  const site = siteUrl();
  const origin = req.headers.get("origin") ?? "";
  // On autorise le site lui-même (et localhost pour les essais).
  const allowed = origin === site || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : site,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Client avec la clé service_role : contourne la RLS. Ne jamais l'exposer au navigateur. */
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Utilisateur connecté à partir du jeton envoyé par le site (en-tête Authorization). */
export async function requireUser(req: Request, admin: SupabaseClient) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/** Encode un objet imbriqué au format formulaire attendu par l'API Stripe (a[b][0]=c). */
function formEncode(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") formEncode(item as Record<string, unknown>, `${key}[${i}]`, out);
        else out.append(`${key}[${i}]`, String(item));
      });
    } else if (typeof v === "object") {
      formEncode(v as Record<string, unknown>, key, out);
    } else {
      out.append(key, String(v));
    }
  }
  return out;
}

/** Appel à l'API REST Stripe (sans SDK). */
export async function stripe<T = Record<string, any>>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` };
  let url = `https://api.stripe.com/v1/${path}`;
  let body: string | undefined;
  if (params && method === "GET") url += "?" + formEncode(params).toString();
  if (params && method === "POST") {
    body = formEncode(params).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(url, { method, headers, body });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status} : ${data?.error?.message ?? "erreur inconnue"}`);
  return data as T;
}
