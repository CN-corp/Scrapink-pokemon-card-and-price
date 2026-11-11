// create-checkout : ouvre une session Stripe Checkout (abonnement Pro mensuel ou annuel)
// pour l'utilisateur connecté, et renvoie { url } vers la page de paiement Stripe.
// Secrets : STRIPE_SECRET_KEY, STRIPE_PRICE_MONTH, STRIPE_PRICE_YEAR, SITE_URL
// (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase).
import { adminClient, corsHeaders, env, json, requireUser, siteUrl, stripe } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Méthode non autorisée" }, 405);
  try {
    const admin = adminClient();
    const user = await requireUser(req, admin);
    if (!user) return json(req, { error: "Connectez-vous pour vous abonner." }, 401);

    const { interval } = await req.json().catch(() => ({}));
    if (interval !== "month" && interval !== "year") return json(req, { error: "Formule inconnue." }, 400);
    const price = env(interval === "year" ? "STRIPE_PRICE_YEAR" : "STRIPE_PRICE_MONTH");

    const { data: profile, error } = await admin.from("profiles")
      .select("id, email, pseudo, plan, pro_until, pro_interval, stripe_customer_id, banned")
      .eq("id", user.id).single();
    if (error || !profile) return json(req, { error: "Profil introuvable." }, 404);
    if (profile.banned) return json(req, { error: "Ce compte est suspendu." }, 403);
    const activeSub = profile.plan === "pro" && ["month", "year"].includes(profile.pro_interval ?? "") &&
      (!profile.pro_until || new Date(profile.pro_until) > new Date());
    if (activeSub) {
      return json(req, { error: "Vous avez déjà un abonnement actif : gérez-le depuis « Gérer ou résilier »." }, 409);
    }

    // Client Stripe : réutilisé s'il existe, sinon créé et mémorisé dans le profil.
    let customer = profile.stripe_customer_id as string | null;
    if (!customer) {
      const c = await stripe("POST", "customers", {
        email: user.email ?? profile.email ?? undefined,
        name: profile.pseudo,
        metadata: { user_id: user.id },
      }, `customer-${user.id}`);
      customer = c.id as string;
      const { error: upErr } = await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", user.id);
      if (upErr) throw upErr;
    }

    const site = siteUrl();
    const session = await stripe("POST", "checkout/sessions", {
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { user_id: user.id } },
      metadata: { user_id: user.id, interval },
      locale: "fr",
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      custom_text: {
        submit: {
          message: "En validant, vous demandez l'accès immédiat à Pokédex Trader Pro et renoncez à votre droit de rétractation de 14 jours. Abonnement résiliable à tout moment.",
        },
      },
      success_url: `${site}/#/abonnement?checkout=ok`,
      cancel_url: `${site}/#/tarifs`,
    });
    return json(req, { url: session.url });
  } catch (e) {
    console.error("create-checkout", e);
    return json(req, { error: "Paiement momentanément indisponible. Réessayez plus tard." }, 500);
  }
});
