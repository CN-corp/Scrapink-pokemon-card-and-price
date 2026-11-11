// État global de l'application et droits d'accès côté interface.
// (Les vrais contrôles sont faits par la base : Row Level Security.)

export const S = {
  api: null,          // backend actif (démo ou Supabase)
  user: null,         // { id, email } ou null
  profile: null,      // ligne profiles
  settings: {},       // site_settings
  status: null,       // public_status()
  announcements: [],
  sets: null,         // toutes les extensions (cache)
  collections: null,  // extensions avec nombre de cartes, valeur totale et carte phare (cache)
  setCards: {},       // set_id -> cartes (cache)
  cards: new Map(),   // id -> carte (cache)
  cardLang: 'EN',     // langue des cartes affichées sur tout le site (voir setCardLang)
};

const listeners = {};
export function on(evt, fn) { (listeners[evt] ||= []).push(fn); }
export function emit(evt, data) { (listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

export const isLogged = () => !!S.user;
export function isProPlan(p = S.profile) {
  return !!p && !p.banned && p.plan === 'pro' && (!p.pro_until || new Date(p.pro_until) > new Date());
}
export const isMod = (p = S.profile) => !!p && !p.banned && (p.role === 'moderator' || p.role === 'admin');
export const isAdmin = (p = S.profile) => !!p && !p.banned && p.role === 'admin';
/** Accès aux données Pro : abonnés Pro, modérateurs et admins (même règle que has_pro_access() en SQL) */
export const hasPro = () => isProPlan() || isMod();
/** 'anon' | 'free' | 'pro' | 'mod' */
export function tier() {
  if (!S.user) return 'anon';
  if (isMod()) return 'mod';
  return isProPlan() ? 'pro' : 'free';
}

export function setting(key, def) {
  const v = S.settings?.[key];
  return v === undefined || v === null ? def : v;
}

// Langue des cartes, comme le choix de langue d'un site : chaque page ne montre que les cartes de cette langue, chacune à la
// cote de son propre marché (jamais convertie ni empruntée à une autre langue). La fiche carte garde ses boutons EN / FR / JP.
export const CARD_LANGS = ['FR', 'EN', 'JP'];
try { const l = localStorage.getItem('pt-card-lang'); if (CARD_LANGS.includes(l)) S.cardLang = l; } catch (e) { /* stockage bloqué */ }
export function setCardLang(l) {
  if (!CARD_LANGS.includes(l) || l === S.cardLang) return;
  S.cardLang = l;
  try { localStorage.setItem('pt-card-lang', l); } catch (e) { /* stockage bloqué */ }
  emit('cardLang', l);
}

export function cacheCards(list) {
  for (const c of list || []) if (c?.id) S.cards.set(c.id, { ...(S.cards.get(c.id) || {}), ...c });
  return list;
}
