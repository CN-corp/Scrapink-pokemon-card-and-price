// customer-portal : ouvre le portail client Stripe (factures, carte, changement de formule,
// résiliation) pour l'utilisateur connecté, et renvoie { url }.
// Secrets : STRIPE_SECRET_KEY, SITE_URL.
import { adminClient, corsHeaders, json, requireUser, siteUrl, stripe } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Méthode non autorisée" }, 405);
  try {
    const admin = adminClient();
    const user = await requireUser(req, admin);
    if (!user) return json(req, { error: "Connectez-vous d'abord." }, 401);

    const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
    if (!profile?.stripe_customer_id) {
      return json(req, { error: "Aucun abonnement Stripe associé à ce compte." }, 404);
    }
    const session = await stripe("POST", "billing_portal/sessions", {
      customer: profile.stripe_customer_id,
      return_url: `${siteUrl()}/#/abonnement`,
      locale: "fr",
    });
    return json(req, { url: session.url });
  } catch (e) {
    console.error("customer-portal", e);
    return json(req, { error: "Portail momentanément indisponible. Réessayez plus tard." }, 500);
  }
});
