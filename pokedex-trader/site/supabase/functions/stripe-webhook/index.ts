// stripe-webhook : reçoit les événements Stripe et met à jour l'offre de l'utilisateur.
// Événements gérés : checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted. La signature Stripe est vérifiée (HMAC-SHA256).
// À déployer SANS vérification JWT : `supabase functions deploy stripe-webhook --no-verify-jwt`.
// Secrets : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
import { adminClient, env, stripe } from "../_shared/common.ts";

const TOLERANCE_S = 300;
const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Vérifie l'en-tête Stripe-Signature ("t=...,v1=...,v1=...") sur le corps brut. */
async function verifySignature(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => s.trim());
    if (k === "t") t = v;
    else if (k === "v1" && v) sigs.push(v);
  }
  if (!t || !sigs.length) return false;
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`)));
  return sigs.some((s) => safeEqual(s, expected));
}

type Sub = Record<string, any>;

/** Fin de la période payée (champ déplacé sur les lignes d'abonnement dans les versions récentes de l'API). */
function periodEnd(sub: Sub): number | null {
  return sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
}

/** Applique l'état d'un abonnement Stripe (relu chez Stripe : l'ordre des événements n'a pas d'importance). */
async function applySubscription(sub: Sub, hintUserId?: string | null) {
  const admin = adminClient();
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  let userId: string | null = sub.metadata?.user_id || hintUserId || null;
  if (!userId && customer) {
    const { data } = await admin.from("profiles").select("id").eq("stripe_customer_id", customer).maybeSingle();
    userId = data?.id ?? null;
  }
  if (!userId) {
    console.warn("stripe-webhook: utilisateur introuvable pour", sub.id, customer);
    return;
  }
  const { data: before } = await admin.from("profiles")
    .select("plan, pro_until, pro_since, pro_interval").eq("id", userId).maybeSingle();
  if (!before) {
    console.warn("stripe-webhook: profil supprimé", userId);
    return;
  }

  const interval = sub.items?.data?.[0]?.price?.recurring?.interval === "year" ? "year" : "month";
  const end = periodEnd(sub);
  const live = ["active", "trialing", "past_due"].includes(sub.status);
  const patch: Record<string, unknown> = { stripe_customer_id: customer };

  if (live) {
    // Actif (y compris résiliation programmée en fin de période, ou paiement en retard) :
    // Pro jusqu'à la fin de la période payée (+ 3 jours de grâce si le paiement est en retard).
    const until = end ? new Date((end + (sub.status === "past_due" ? 3 * 86400 : 0)) * 1000) : null;
    patch.plan = "pro";
    patch.pro_until = until?.toISOString() ?? null;
    patch.pro_interval = interval;
    patch.pro_since = before.plan === "pro" && before.pro_since ? before.pro_since
      : new Date((sub.start_date ?? Date.now() / 1000) * 1000).toISOString();
  } else if (["canceled", "unpaid", "incomplete_expired"].includes(sub.status)) {
    // Fin d'abonnement. Un accès Pro offert manuellement par un modérateur n'est pas retiré.
    if (before.pro_interval === "manual" && before.pro_until && new Date(before.pro_until) > new Date()) {
      // on ne touche qu'à l'identifiant client
    } else {
      patch.plan = "free";
      patch.pro_until = new Date((sub.ended_at ?? Date.now() / 1000) * 1000).toISOString();
      patch.pro_interval = interval;
    }
  } else {
    // incomplete / paused : pas d'accès tant que le paiement n'est pas confirmé.
    return;
  }

  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
  await admin.from("audit_log").insert({
    actor: null,
    actor_pseudo: "Stripe",
    action: "stripe.subscription",
    target_type: "profiles",
    target_id: userId,
    details: { subscription: sub.id, status: sub.status, plan: patch.plan ?? before.plan, pro_until: patch.pro_until ?? null, interval },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });
  const payload = await req.text();
  let ok = false;
  try {
    ok = await verifySignature(payload, req.headers.get("stripe-signature"), env("STRIPE_WEBHOOK_SECRET"));
  } catch (e) {
    console.error("stripe-webhook: configuration", e);
    return new Response("Configuration incomplète", { status: 500 });
  }
  if (!ok) return new Response("Signature invalide", { status: 400 });

  let event: Record<string, any>;
  try { event = JSON.parse(payload); } catch { return new Response("JSON invalide", { status: 400 }); }

  try {
    const obj = event.data?.object ?? {};
    switch (event.type) {
      case "checkout.session.completed": {
        if (obj.mode !== "subscription" || !obj.subscription) break;
        const subId = typeof obj.subscription === "string" ? obj.subscription : obj.subscription.id;
        const sub = await stripe("GET", `subscriptions/${subId}`);
        await applySubscription(sub, obj.client_reference_id ?? obj.metadata?.user_id);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // On relit l'abonnement chez Stripe pour appliquer l'état le plus récent.
        const sub = await stripe("GET", `subscriptions/${obj.id}`).catch(() => obj);
        await applySubscription(sub);
        break;
      }
      default:
        break; // autres événements ignorés
    }
  } catch (e) {
    console.error("stripe-webhook", event.type, e);
    return new Response("Erreur de traitement", { status: 500 }); // Stripe réessaiera
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
