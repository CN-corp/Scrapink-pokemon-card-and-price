// =====================================================================
// Réglages du site : à remplir après avoir créé le projet Supabase
// (voir site/README.md, étape 7).
//
// Tant que SUPABASE_URL ou SUPABASE_ANON_KEY est vide, le site tourne en
// MODE DÉMO : données d'exemple, aucune connexion réelle, et une petite
// barre en bas de l'écran pour passer de Visiteur à Gratuit, Pro ou Modérateur.
//
// La clé « anon » est publique par nature : elle peut figurer ici.
// Ne mettez JAMAIS ici la clé « service_role » ni une clé secrète Stripe.
// =====================================================================
export const CONFIG = {
  // Supabase > Project Settings > API > Project URL, ex. "https://abcdefgh.supabase.co"
  SUPABASE_URL: '',
  // Supabase > Project Settings > API > Project API keys > anon public
  SUPABASE_ANON_KEY: '',

  // Prix affichés si la base n'a pas encore de réglages (Modération > Réglages les remplace).
  // Ils doivent correspondre aux prix créés dans Stripe.
  PRICE_MONTH: 5.99,
  PRICE_YEAR: 49,

  // Adresse de contact affichée dans le pied de page et les pages légales
  CONTACT_EMAIL: 'contact@exemple.fr',

  // true = forcer le mode démo même si Supabase est configuré (pour tester)
  FORCE_DEMO: false,
};
