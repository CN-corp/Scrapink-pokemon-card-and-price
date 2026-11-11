// MODE DÉMO : même interface que le backend Supabase, sur des données d'exemple
// (assets/demo-data.json). Les modifications restent dans ce navigateur (localStorage).
// Les mêmes règles d'accès que la base (RLS) sont appliquées ici, pour un aperçu fidèle.
import { store, norm, byNumber, addDays, pickSibling, AVATAR_TYPES, AVATAR_MAX } from './util.js';
import { summary, perfSeries } from './fifo.js';

const KEY = 'pt-demo-v2';
const PERSONAS = { visitor: null, free: 'demo-free', pro: 'demo-pro', mod: 'demo-mod' };
const DENIED = () => Object.assign(new Error('Accès réservé aux modérateurs'), { code: '42501' });
const RLS = t => Object.assign(new Error(`new row violates row-level security policy for table "${t}"`), { code: '42501' });
const clone = o => JSON.parse(JSON.stringify(o));

export async function createDemoBackend() {
  const inline = document.getElementById('demo-data');
  const base = inline ? JSON.parse(inline.textContent) : await (await fetch('assets/demo-data.json')).json();
  // Format compact de l'aperçu (packs) : une ligne par carte, les champs communs portés par l'extension
  // [id ('' = set-numéro), nom, numéro, rareté, visuel (id /_blob ou adresse), cote, ref_id, variantes, date de cote, date de sortie]
  if (base.packs) {
    const { variants, price_date, sets, low = {}, sheets = [] } = base.packs;
    // visuel : "planche:case" (planche = [id /_blob, colonnes, lignes], dessinée par spriteBg), id /_blob seul, ou adresse
    const pic = im => { if (!im) return null; const m = /^(\d+):(\d+)$/.exec(im);
      if (m) { const [b, c, r] = sheets[+m[1]]; return `/_blob/${b}#s${m[2]},${c},${r}`; } return /^(https?:|\/)/.test(im) ? im : '/_blob/' + im; };
    for (const [set_id, p] of Object.entries(sets)) for (const [id, name, number, rarity, im, price = null, ref_id = null, v = 0, pd, rd] of p.rows) {
      const cid = id || `${set_id}-${number}`, img = pic(im);
      base.cards.push({ id: cid, name, set_id, set_name: p.set_name, number, rarity, lang: p.lang, image_small: img, image_large: img,
        release_date: rd || p.release_date, price, price_date: price == null ? null : pd || price_date, ref_id, variants: variants[v],
        low: low[cid] ?? null, search: norm(`${name} ${p.set_name} ${number} ${cid}`) });
    }
  }

  // Les dates des comptes fictifs suivent la date du jour (les cotes restent celles de l'export)
  const shiftDays = Math.max(0, Math.floor((Date.now() - new Date(base.end_date + 'T09:00:00Z')) / 864e5));
  const shift = v => v ? new Date(new Date(v).getTime() + shiftDays * 864e5).toISOString() : v;
  for (const u of base.users) for (const k of ['created_at', 'last_seen', 'pro_since', 'pro_until']) u[k] = shift(u[k]);
  for (const k of ['announcements', 'sync_runs', 'audit_log']) for (const r of base[k]) for (const f of ['created_at', 'started_at', 'finished_at', 'at']) if (r[f]) r[f] = shift(r[f]);
  for (const p of Object.values(base.personas)) for (const a of p.alerts) a.triggered_at &&= shift(a.triggered_at);
  base.status.last_sync = shift(base.status.last_sync);

  const cards = base.cards, cardMap = new Map(cards.map(c => [c.id, c]));
  const anaMap = new Map(base.analysis.map(a => [a.card_id, a]));
  // Historique de la cote : seulement celui de la carte elle-même (jamais celui d'une autre langue ou d'un autre marché)
  const histOf = id => (base.history[id] || []).map((p, i) => [base.dates[i], p]);
  const sealed = cards.filter(c => c.kind === 'sealed'), isCard = c => c.kind !== 'sealed';
  // Même carte en EN / FR / JP : index construits à la première fiche ouverte (voir pickSibling)
  let langIdx = null;
  const nameKey = c => `${norm(c.name)}|${c.release_date || ''}`;
  const push = (m, k, c) => { if (k) (m.get(k) || m.set(k, []).get(k)).push(c); };
  const langIndex = () => {
    if (langIdx) return langIdx;
    langIdx = { en: new Map(), fr: new Map(), jp: new Map() };
    for (const c of cards) {
      if (!isCard(c)) continue;
      const L = c.lang || 'EN';
      if (L === 'EN') push(langIdx.en, nameKey(c), c); else if (L === 'FR') push(langIdx.fr, c.ref_id, c); else if (L === 'JP') push(langIdx.jp, nameKey(c), c);
    }
    return langIdx;
  };
  // Hausses et baisses de la semaine : cote du dernier relevé contre celle d'il y a 7 jours (historique public)
  // (aperçu : base.week_movers, cote du jour contre la moyenne Cardmarket des 7 derniers jours, quand l'historique est encore court)
  let movers = null;
  const weekMoves = () => movers ||= base.week_movers ? [...base.week_movers.up, ...base.week_movers.down].map(r => ({ ...r, prev_label: 'moy. 7 j' })) : Object.entries(base.history).map(([id, h]) => {
    const c = cardMap.get(id), n = h.length;
    if (!c || n < 8 || !(h[n - 8] >= 5) || !(h[n - 1] > 0)) return null;
    return { card_id: id, name: c.name, set_name: c.set_name, number: c.number, lang: c.lang, image_small: c.image_small, kind: c.kind,
      price: h[n - 1], prev: h[n - 8], pct: Math.round((h[n - 1] / h[n - 8] - 1) * 1000) / 10 };
  }).filter(Boolean);
  const market = () => base.analysis.map(a => { const c = cardMap.get(a.card_id) || {}; return { ...c, ...a, card_price: c.price }; });

  let st = store.get(KEY, null);
  const fresh = () => ({ persona: 'visitor', personas: clone(base.personas), profiles: {}, announcements: clone(base.announcements),
    settings: clone(base.settings), audit: clone(base.audit_log), news: clone(base.news || []), seq: 1000 });
  if (!st || !st.personas) st = fresh();
  st.news ||= clone(base.news || []);
  const save = () => store.set(KEY, st);
  let authCb = () => {};

  const users = () => base.users.map(u => ({ ...u, ...(st.profiles[u.id] || {}) }));
  const uid = () => st.persona === 'visitor' ? null : st.persona;
  const me = () => users().find(u => u.id === uid()) || null;
  const mine = () => (st.personas[uid()] ||= { transactions: [], wishlist: [], alerts: [], master_sets: [], owned: [] });
  const activePro = p => !!p && !p.banned && p.plan === 'pro' && (!p.pro_until || new Date(p.pro_until) > new Date());
  const isModP = p => !!p && !p.banned && (p.role === 'moderator' || p.role === 'admin');
  const proAccess = () => activePro(me()) || isModP(me());
  const needUser = () => { if (!uid()) throw RLS('session'); };
  const needWriter = t => { needUser(); if (me()?.banned) throw RLS(t); };
  const needMod = () => { if (!isModP(me())) throw DENIED(); };
  const revealLimit = () => Math.max(0, Math.min(50, st.settings.free_reveals ?? 5));
  const audit = (action, target_type, target_id, details) => {
    st.audit.unshift({ id: ++st.seq, at: new Date().toISOString(), actor_pseudo: me()?.pseudo, action, target_type, target_id, details });
  };
  const patchProfile = (id, patch) => { st.profiles[id] = { ...(st.profiles[id] || {}), ...patch }; save(); };
  const txOf = id => id in st.personas ? st.personas[id].transactions : (base.transactions[id] || []);
  const priceOf = id => cardMap.get(id)?.price ?? null;

  // Portefeuilles partagés : mêmes règles que public_leaderboard / public_portfolio (schema.sql, section 15)
  const histFor = histOf;
  const isProU = u => activePro(u);
  const shared = () => users().filter(u => u.share_portfolio && !u.banned);
  const r1 = v => v == null ? null : Math.round(v * 10) / 10;
  function board() {
    return shared().map(u => {
      const txs = txOf(u.id); if (!txs.length) return null;
      const s = summary(txs, priceOf, id => cardMap.get(id));
      if (s.invested < 20) return null;
      const top = s.pos[0], tc = top && cardMap.get(top.cid);
      return { slug: u.share_slug, pseudo: u.pseudo, pro: isProU(u), member_since: u.created_at, cards: s.cards, trades: txs.length,
        pnl_pct: r1(s.pnl / s.invested * 100), value: u.share_amounts ? Math.round(s.value * 100) / 100 : null,
        pnl: u.share_amounts ? Math.round(s.pnl * 100) / 100 : null, top_card_id: tc?.id ?? null, top_name: tc?.name ?? null, top_image: tc?.image_small ?? null };
    }).filter(Boolean).sort((a, b) => b.pnl_pct - a.pnl_pct || a.slug.localeCompare(b.slug)).map((r, i) => ({ rank: i + 1, ...r }));
  }

  function filterMarket(rows, f) {
    return rows.filter(r => (!f.lang || r.lang === f.lang) && (!f.signal || r.signal === f.signal)
      && (f.min == null || r.price >= f.min) && (f.max == null || r.price <= f.max)
      && (!f.q || norm(f.q).split(/\s+/).every(w => (r.search || '').includes(w)))
      && (!f.ids || f.ids.includes(r.card_id)));
  }

  const api = {
    mode: 'demo',
    async init() {},
    onAuth(cb) { authCb = cb; },
    currentUser() { const u = me(); return u ? { id: u.id, email: u.email } : null; },
    async getProfile() { return me() ? clone(me()) : null; },
    demoPersona() { return Object.entries(PERSONAS).find(([, v]) => (v || 'visitor') === st.persona)?.[0] || 'visitor'; },
    demoSwitch(key) { st.persona = PERSONAS[key] || 'visitor'; save(); authCb(); },
    demoReset() { const p = st.persona; st = fresh(); st.persona = p; save(); authCb(); },

    async signUp({ pseudo }) { st.persona = 'demo-free'; if (pseudo) patchProfile('demo-free', { pseudo }); save(); authCb(); return { needsConfirm: false }; },
    async signIn({ email }) { const e = (email || '').toLowerCase(); st.persona = /mod|admin/.test(e) ? 'demo-mod' : /pro/.test(e) ? 'demo-pro' : 'demo-free'; save(); authCb(); },
    async magicLink() { return { demo: true }; },
    async resetPassword() { return { demo: true }; },
    async updatePassword() { return { demo: true }; },
    async signOut() { st.persona = 'visitor'; save(); authCb(); },
    async updatePseudo(pseudo) { needUser(); patchProfile(uid(), { pseudo }); },
    // Photo de profil : membres Pro (bucket avatars et set_avatar dans schema.sql). La démo la garde dans ce navigateur, réduite à 256 px
    // (le GIF reste tel quel pour garder son animation).
    async setAvatar(file) {
      needWriter('profiles');
      if (!proAccess()) throw Object.assign(new Error('La photo de profil est réservée aux membres Pro.'), { code: '42501' });
      if (!file) { patchProfile(uid(), { avatar_url: null }); return null; }
      if (!AVATAR_TYPES.includes(file.type)) throw new Error('Format accepté : JPG, PNG ou GIF.');
      if (file.size > AVATAR_MAX) throw new Error('Image trop lourde : 2 Mo au plus.');
      const url = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(new Error('Lecture de l\'image impossible.')); r.readAsDataURL(file); });
      const small = file.type === 'image/gif' ? url : await new Promise(ok => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, 256 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          ok(cv.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
        };
        img.onerror = () => ok(url); img.src = url;
      });
      patchProfile(uid(), { avatar_url: small });
      return small;
    },
    async touch() { if (uid()) patchProfile(uid(), { last_seen: new Date().toISOString() }); },
    async deleteAccount() {
      needUser();
      const p = me();
      if (activePro(p) && ['month', 'year'].includes(p.pro_interval)) throw new Error('Résiliez d\'abord votre abonnement (Mon abonnement > Gérer)');
      st.personas[uid()] = { transactions: [], wishlist: [], alerts: [], master_sets: [], owned: [] };
      st.persona = 'visitor'; save(); authCb();
    },
    async exportMyData() { needUser(); return { profile: me(), ...clone(mine()) }; },

    // --- public
    async status() { return { ...base.status }; },
    async settings() { return clone(st.settings); },
    async announcements() {
      const now = new Date();
      return st.announcements.filter(a => a.active && (!a.starts_at || new Date(a.starts_at) <= now) && (!a.ends_at || new Date(a.ends_at) > now));
    },
    async teaser(lang = '') {
      const n = Math.max(0, Math.min(10, +st.settings.free_teaser_count || 5));
      return market().filter(r => (!lang || r.lang === lang) && r.price >= 50 && /^ACHAT/.test(r.signal)).sort((a, b) => b.buy_score - a.buy_score || b.confidence - a.confidence)
        .slice(0, n).map(r => ({ card_id: r.card_id, name: r.name, set_name: r.set_name, lang: r.lang, image_small: r.image_small, price: r.price,
          signal: proAccess() ? r.signal : null, buy_score: proAccess() ? r.buy_score : null })); // signal et score : Pro seulement (market_teaser)
    },
    async searchCards({ q = '', lang = '', set_id = '', min = null, max = null, sort = 'price', limit = 60, kind = 'card' } = {}) {
      const words = norm(q).split(/\s+/).filter(Boolean);
      let rows = cards.filter(c => (kind === 'all' || (kind === 'sealed') === (c.kind === 'sealed')) && (!lang || c.lang === lang) && (!set_id || c.set_id === set_id) && (min == null || (c.price ?? 0) >= min)
        && (max == null || (c.price ?? 0) <= max) && words.every(w => c.search.includes(w)));
      rows.sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'number' ? byNumber : sort === 'date' ? (a, b) => (b.release_date || '').localeCompare(a.release_date || '') : (a, b) => (b.price ?? -1) - (a.price ?? -1));
      return clone(rows.slice(0, limit));
    },
    async cardsByIds(ids) { return clone(ids.map(i => cardMap.get(i)).filter(Boolean)); },
    async card(id) { return cardMap.has(id) ? clone(cardMap.get(id)) : null; },
    // Séries hors démo : fiche d'extension seule (base.sets_overview), sans la liste des cartes
    async cardLangs(id) {
      const c = cardMap.get(id); if (!c || !isCard(c)) return {};
      const ix = langIndex(), L = c.lang || 'EN';
      const en = L === 'EN' ? c : L === 'FR' ? cardMap.get(c.ref_id) : cardMap.get(pickSibling(ix.en.get(nameKey(c)), c.number));
      return { EN: en?.id || null, FR: L === 'FR' ? c.id : en ? pickSibling(ix.fr.get(en.id), en.number) : null,
        JP: L === 'JP' ? c.id : en ? pickSibling(ix.jp.get(nameKey(en)), en.number) : null };
    },
    async weekMovers(lim = 5, lang = '') {
      const rows = weekMoves().filter(r => !lang || r.lang === lang);
      return clone({ up: rows.filter(r => r.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, lim), down: rows.filter(r => r.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, lim) });
    },
    async sets() { return clone([...base.sets, ...(base.sets_overview || []).map(o => ({ id: o.id, name: o.name, series: o.series, release_date: o.release_date, total: o.total, lang: o.lang, logo: o.logo, overview_only: true }))]); },
    async setCards(set_id) { return clone(cards.filter(c => c.set_id === set_id && isCard(c)).sort(byNumber)); },
    // Produits scellés (displays, coffrets, boosters…) : cote, variation 7 / 30 / 90 jours (publique, comme l'historique)
    async products({ type = '', q = '', set_id = '', sort = 'price', limit = 2000 } = {}) {
      const words = norm(q).split(/\s+/).filter(Boolean);
      const chg = (h, k) => h.length > k && h[h.length - 1 - k] ? h[h.length - 1] / h[h.length - 1 - k] - 1 : null;
      const rows = sealed.filter(c => (!type || c.ptype === type) && (!set_id || c.set_id === set_id) && words.every(w => c.search.includes(w)))
        .map(c => { const h = base.history[c.id] || []; return { ...c, chg7: chg(h, 7), chg30: chg(h, 30), chg90: chg(h, h.length - 1) }; });
      const key = { price: r => r.price, chg30: r => r.chg30 ?? -9, drop30: r => -(r.chg30 ?? 9), date: r => r.release_date || '', name: null }[sort];
      rows.sort(key ? (a, b) => (key(b) > key(a) ? 1 : key(b) < key(a) ? -1 : 0) : (a, b) => a.name.localeCompare(b.name));
      return clone(rows.slice(0, limit));
    },
    // Collections : extensions + nombre de cartes, valeur totale et carte phare (comme la vue set_overview)
    async collections() {
      return clone(base.sets.map(s => {
        const cs = cards.filter(c => c.set_id === s.id && isCard(c)), pr = cs.filter(c => c.price != null);
        const top = pr.reduce((b, c) => !b || c.price > b.price || (c.price === b.price && c.id < b.id) ? c : b, null);
        return { ...s, cards: cs.length, priced: pr.length, value: Math.round(pr.reduce((a, c) => a + c.price, 0) * 100) / 100,
          top_id: top?.id ?? null, top_name: top?.name ?? null, top_number: top?.number ?? null, top_rarity: top?.rarity ?? null,
          top_price: top?.price ?? null, top_image: top?.image_small ?? null };
      }).concat((base.sets_overview || []).map(o => ({ ...o, overview_only: true }))).sort((a, b) => (b.release_date || '').localeCompare(a.release_date || '') || a.id.localeCompare(b.id)));
    },

    // --- communauté : portefeuilles partagés (publics) et actualités du bandeau
    async leaderboard(lim = 50) { return isModP(me()) ? clone(board().slice(0, lim)) : []; },
    async publicPortfolio(slug) {
      const u = shared().find(x => x.share_slug === slug); if (!u) return null;
      const txs = txOf(u.id), s = summary(txs, priceOf, id => cardMap.get(id)), amt = !!u.share_amounts;
      return clone({ slug: u.share_slug, pseudo: u.pseudo, avatar_url: u.avatar_url || null, member_since: u.created_at, amounts: amt, pro: isProU(u), trades: txs.length,
        invested: amt ? s.invested : null, value: amt ? s.value : null, pnl: amt ? s.pnl : null, realized: amt ? s.realizedPnl : null,
        pnl_pct: s.invested ? r1(s.pnl / s.invested * 100) : null, rank: isModP(me()) ? board().find(r => r.slug === slug)?.rank ?? null : null,
        positions: s.pos.map(p => { const c = cardMap.get(p.cid) || {}; return { card_id: p.cid, name: c.name, set_id: c.set_id, set_name: c.set_name, number: c.number,
          rarity: c.rarity, lang: c.lang, image_small: c.image_small, qty: p.q, price: p.price,
          perf_pct: p.value == null || !p.cost ? null : r1((p.value - p.cost) / p.cost * 100), value: amt && p.value != null ? Math.round(p.value * 100) / 100 : null }; }),
        series: perfSeries(txs, base.dates, histFor, priceOf).map(x => ({ date: x.date, pnl_pct: x.pnl_pct, value: amt ? x.value : null })) });
    },
    async myPerformance() { needUser(); return proAccess() ? clone(perfSeries(mine().transactions, base.dates, histFor, priceOf)) : []; }, // RLS portfolio_snapshots : Pro
    async updateSharing(patch) {
      needWriter('profiles');
      const ok = {}; for (const k of ['share_portfolio', 'share_amounts']) if (k in patch) ok[k] = !!patch[k];
      patchProfile(uid(), ok);
    },
    async news(lim = 20) { return clone(st.news.filter(n => n.active).sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, lim)); },
    async allNews() { needMod(); return clone(st.news).sort((a, b) => b.published_at.localeCompare(a.published_at)); },
    async saveNews(n0) {
      needMod();
      const n = Object.fromEntries(Object.entries(n0).filter(([, v]) => v !== undefined));
      if (n.id) { Object.assign(st.news.find(x => x.id === n.id), n); audit('news.update', 'news', String(n.id), n); }
      else { const row = { lang: 'FR', kind: 'site', active: true, published_at: new Date().toISOString(), ...n, id: ++st.seq, created_at: new Date().toISOString() }; st.news.push(row); audit('news.insert', 'news', String(row.id), row); }
      save();
    },
    async deleteNews(id) { needMod(); st.news = st.news.filter(n => n.id !== id); audit('news.delete', 'news', String(id), null); save(); },

    // --- Pro : vide sans accès Pro (comme la RLS) ; l'historique des cotes est public
    async market({ kind = 'buy', limit, ...f } = {}) {
      if (!proAccess()) return [];
      let rows = market();
      if (kind === 'buy') rows = filterMarket(rows, { ...f, min: f.min ?? 50 }).filter(r => f.score == null || r.buy_score >= f.score).sort((a, b) => b.buy_score - a.buy_score || b.exp_return30_net - a.exp_return30_net);
      else rows = filterMarket(rows.filter(r => r.price >= 10 && r.mom7 != null), f).filter(r => f.score == null || r.buy_score >= f.score).sort((a, b) => kind === 'hot' ? b.mom7 - a.mom7 : a.mom7 - b.mom7);
      return clone(rows.slice(0, limit || (kind === 'buy' ? 150 : 30)));
    },
    async rank({ mode = 'buy', sort = 'rank', conf = 0, limit = 150, offset = 0, ...f } = {}) {
      if (!proAccess()) return { rows: [], total: 0 };
      const sell = mode === 'sell';
      const key = { rank: r => sell ? r.rank_sell : r.rank_buy, score: r => sell ? r.sell_score : r.buy_score, conf: r => r.confidence,
        gain: r => (sell ? -1 : 1) * (r.exp_return30_net ?? 0), year: r => (sell ? -1 : 1) * (r.trend_year ?? r.mom365 ?? r.mom90 ?? 0), price: r => r.price }[sort];
      const rows = filterMarket(market(), { ...f, min: f.min ?? 50 }).filter(r => (r.confidence ?? 0) >= conf && (f.score == null || (sell ? r.rank_sell : r.rank_buy) >= f.score))
        .sort((a, b) => (key(b) ?? -1e9) - (key(a) ?? -1e9));
      return { rows: clone(rows.slice(offset, offset + limit)), total: rows.length };
    },
    async analysis(id) { if (!proAccess()) return null; const a = anaMap.get(id); return a ? clone({ ...cardMap.get(id), ...a }) : null; },
    async analysisByIds(ids) { if (!proAccess()) return []; return clone(ids.filter(i => anaMap.has(i)).map(i => ({ ...cardMap.get(i), ...anaMap.get(i) }))); },
    async history(id) { return histOf(id); },
    async histories(ids) { const out = {}; for (const i of ids) out[i] = await api.history(i); return out; },
    // Découverte Pro : mêmes règles que reveal_card / reveal_status (schema.sql, section 16)
    async revealStatus() {
      needUser(); const list = (st.reveals ||= {})[uid()] || [];
      return { limit: revealLimit(), used: list.length, cards: clone(list) };
    },
    async revealCard(id) {
      needWriter('pro_reveals');
      const list = ((st.reveals ||= {})[uid()] ||= []), a = anaMap.get(id);
      if (a && !proAccess() && !list.includes(id)) {
        if (list.length >= revealLimit()) throw Object.assign(new Error('reveal_quota'), { code: 'P0001' });
        list.push(id); save();
      }
      return { analysis: a ? clone({ ...cardMap.get(id), ...a }) : null, history: a ? histFor(id) : [], used: list.length, limit: revealLimit() };
    },

    // --- données personnelles
    async transactions() { needUser(); return clone(mine().transactions); },
    async addTransaction(t) {
      needWriter('transactions');
      if (!cardMap.has(t.card_id)) throw new Error('Carte inconnue');
      if (t.side === 'sell') {
        const held = mine().transactions.filter(x => x.card_id === t.card_id && x.date <= t.date).reduce((a, x) => a + (x.side === 'buy' ? x.quantity : -x.quantity), 0);
        if (t.quantity > held) throw new Error(`Vente impossible : vous détenez ${held} exemplaire(s) de cette carte à cette date`);
      }
      const row = { ...t, id: 'tx-' + (++st.seq), created_at: new Date().toISOString() };
      mine().transactions.push(row); save(); return clone(row);
    },
    async deleteTransaction(id) { needUser(); const m = mine(); m.transactions = m.transactions.filter(t => t.id !== id); save(); },
    async wishlist() { needUser(); return clone(mine().wishlist); },
    async upsertWish(w) { needWriter('wishlist'); const m = mine(); m.wishlist = m.wishlist.filter(x => x.card_id !== w.card_id); m.wishlist.push({ created_at: new Date().toISOString(), ...w }); save(); },
    async deleteWish(card_id) { needUser(); const m = mine(); m.wishlist = m.wishlist.filter(x => x.card_id !== card_id); save(); },
    async alerts() { needUser(); return clone(mine().alerts); },
    // Alertes de prix : tout compte non suspendu (comme la RLS de price_alerts)
    async addAlert(a) { needWriter('price_alerts'); mine().alerts.push({ id: 'al-' + (++st.seq), active: true, triggered_at: null, created_at: new Date().toISOString(), ...a }); save(); },
    async updateAlert(id, patch) { needWriter('price_alerts'); const a = mine().alerts.find(x => x.id === id); if (a) Object.assign(a, patch); save(); },
    async deleteAlert(id) { needUser(); const m = mine(); m.alerts = m.alerts.filter(x => x.id !== id); save(); },
    async masterSets() { needUser(); return clone(mine().master_sets); },
    async followSet(set_id, patch = {}) {
      needWriter('master_sets'); const m = mine();
      if (!m.master_sets.some(x => x.set_id === set_id)) m.master_sets.push({ set_id, variant_mode: 'base', pinned: false, created_at: new Date().toISOString(), ...patch });
      save();
    },
    async updateMasterSet(set_id, patch) { needWriter('master_sets'); const x = mine().master_sets.find(s => s.set_id === set_id); if (x) Object.assign(x, patch); save(); },
    async unfollowSet(set_id) { needUser(); const m = mine(); m.master_sets = m.master_sets.filter(s => s.set_id !== set_id); save(); },
    async owned() { needUser(); return clone(mine().owned); },
    async setOwned(card_id, variant, qty) {
      needWriter('owned_cards'); const m = mine();
      m.owned = m.owned.filter(o => !(o.card_id === card_id && o.variant === variant));
      if (qty > 0) m.owned.push({ card_id, variant, qty: Math.min(999, qty) });
      save();
    },

    // --- abonnement (simulé)
    async checkout(interval) {
      needUser();
      const p = me(), now = new Date();
      patchProfile(uid(), { plan: 'pro', pro_interval: interval, pro_since: activePro(p) ? p.pro_since : now.toISOString(),
        pro_until: addDays(now, interval === 'year' ? 365 : 30).toISOString() });
      authCb(); return { demo: true };
    },
    async portal() { needUser(); return { demo: true }; },
    async demoCancel() { patchProfile(uid(), { plan: 'free', pro_until: new Date().toISOString() }); authCb(); },

    // --- modération
    async kpiOverview() {
      needMod();
      const U = users(), now = Date.now(), d = n => now - n * 864e5;
      const pro = U.filter(activePro), pm = +st.settings.pro_price_month || 0, py = +st.settings.pro_price_year || 0;
      const month = pro.filter(u => u.pro_interval === 'month').length, year = pro.filter(u => u.pro_interval === 'year').length;
      const churn = U.filter(u => !activePro(u) && u.pro_until && new Date(u.pro_until) >= d(30) && new Date(u.pro_until) <= now).length;
      return { users: U.length, pro: pro.length, pro_month: month, pro_year: year, pro_manual: pro.length - month - year,
        new7: U.filter(u => new Date(u.created_at) > d(7)).length, new30: U.filter(u => new Date(u.created_at) > d(30)).length,
        churn30: churn, active7: U.filter(u => u.last_seen && new Date(u.last_seen) > d(7)).length, banned: U.filter(u => u.banned).length,
        staff: U.filter(u => isModP({ ...u, banned: false })).length, price_month: pm, price_year: py,
        mrr: Math.round((month * pm + year * py / 12) * 100) / 100,
        conversion: U.length ? Math.round(pro.length / U.length * 1000) / 10 : 0,
        churn_rate: pro.length + churn ? Math.round(churn / (pro.length + churn) * 1000) / 10 : 0 };
    },
    async kpiTimeseries(weeks = 26) {
      needMod();
      const U = users(), out = [], now = new Date();
      const monday = new Date(now); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      for (let i = weeks - 1; i >= 0; i--) {
        const ws = new Date(monday.getTime() - i * 7 * 864e5), we = new Date(ws.getTime() + 7 * 864e5), lim = we < now ? we : now;
        out.push({ week_start: ws.toISOString().slice(0, 10),
          signups: U.filter(u => new Date(u.created_at) >= ws && new Date(u.created_at) < we).length,
          pro_active: U.filter(u => u.pro_since && new Date(u.pro_since) < we && (!u.pro_until || new Date(u.pro_until) >= lim)).length });
      }
      return out;
    },
    async kpiTopUsers(lim = 20) {
      needMod();
      const rows = users().filter(u => !u.banned).map(u => {
        const txs = txOf(u.id); if (!txs.length) return null;
        const s = summary(txs, priceOf);
        return { user_id: u.id, pseudo: u.pseudo, plan: activePro(u) ? 'pro' : 'free', trades: txs.length, invested: s.invested, realized: s.realizedPnl,
          latent: s.latent, pnl: s.pnl, pnl_pct: s.invested ? Math.round(s.pnl / s.invested * 1000) / 10 : null, value: s.value };
      }).filter(Boolean).sort((a, b) => b.pnl - a.pnl).slice(0, lim);
      rows.forEach((r, i) => { r.rank = i + 1; });
      return rows;
    },
    async searchUsers(q = '', lim = 50, off = 0) {
      needMod();
      const nq = norm(q);
      const rows = users().filter(u => !nq || norm(u.pseudo).includes(nq) || norm(u.email).includes(nq) || u.id === q)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { rows: rows.slice(off, off + lim).map(u => ({ ...u, email: undefined, email_masked: u.email.replace(/^(.).*(@.*)$/, '$1•••$2') })), total: rows.length };
    },
    async userDetail(id) {
      needMod();
      const u = users().find(x => x.id === id); if (!u) throw new Error('Utilisateur introuvable');
      const txs = txOf(id), s = txs.length ? summary(txs, priceOf) : null, p = st.personas[id];
      audit('profiles.view', 'profiles', id, null); save();
      return { profile: clone(u), portfolio: s && { trades: txs.length, invested: s.invested, realized: s.realizedPnl, latent: s.latent, value: s.value },
        counts: { wishlist: p?.wishlist.length || 0, master_sets: p?.master_sets.length || 0, alerts: p?.alerts.length || 0 },
        audit: st.audit.filter(a => a.target_id === id && a.action !== 'profiles.view').slice(0, 20) };
    },
    async setPro(id, until) {
      needMod();
      const u = users().find(x => x.id === id); if (!u) throw new Error('Utilisateur introuvable');
      if (until && new Date(until) > new Date()) {
        patchProfile(id, { plan: 'pro', pro_until: new Date(until).toISOString(), pro_since: activePro(u) ? u.pro_since : new Date().toISOString(),
          pro_interval: activePro(u) && ['month', 'year'].includes(u.pro_interval) ? u.pro_interval : 'manual' });
        audit('profiles.grant_pro', 'profiles', id, { until, before: u.pro_until });
      } else {
        patchProfile(id, { plan: 'free', pro_until: !u.pro_until || new Date(u.pro_until) > new Date() ? new Date().toISOString() : u.pro_until });
        audit('profiles.revoke_pro', 'profiles', id, { before: u.pro_until });
      }
      save(); if (id === uid()) authCb();
    },
    async setRole(id, role) {
      needMod();
      if (!['user', 'moderator', 'admin'].includes(role)) throw new Error('Rôle inconnu');
      if (id === uid()) throw new Error('Vous ne pouvez pas changer votre propre rôle');
      const u = users().find(x => x.id === id); if (!u) throw new Error('Utilisateur introuvable');
      if ((role !== 'user' || u.role !== 'user') && me().role !== 'admin') throw new Error('Seul un admin peut nommer ou retirer un modérateur');
      patchProfile(id, { role }); audit('profiles.set_role', 'profiles', id, { from: u.role, to: role }); save();
    },
    async setBanned(id, ban, reason) {
      needMod();
      if (id === uid()) throw new Error('Vous ne pouvez pas vous bannir vous-même');
      const u = users().find(x => x.id === id); if (!u) throw new Error('Utilisateur introuvable');
      if (u.role !== 'user' && me().role !== 'admin') throw new Error('Seul un admin peut bannir un modérateur');
      patchProfile(id, { banned: ban, ban_reason: ban ? (reason || '').slice(0, 300) : null });
      audit(ban ? 'profiles.ban' : 'profiles.unban', 'profiles', id, { reason }); save();
    },
    async allAnnouncements() { needMod(); return clone(st.announcements).sort((a, b) => b.id - a.id); },
    async saveAnnouncement(a) {
      needMod();
      if (a.id) { const x = st.announcements.find(y => y.id === a.id); Object.assign(x, a, { updated_at: new Date().toISOString() }); audit('announcements.update', 'announcements', String(a.id), a); }
      else { const row = { ...a, id: ++st.seq, created_at: new Date().toISOString() }; st.announcements.push(row); audit('announcements.insert', 'announcements', String(row.id), row); }
      save();
    },
    async deleteAnnouncement(id) { needMod(); st.announcements = st.announcements.filter(a => a.id !== id); audit('announcements.delete', 'announcements', String(id), null); save(); },
    async saveSetting(key, value) { needMod(); st.settings[key] = value; audit('site_settings.update', 'site_settings', key, { key, value }); save(); },
    async syncRuns(lim = 15) { needMod(); return clone(base.sync_runs.slice(0, lim)); },
    async dataHealth() {
      needMod();
      const langs = {}; cards.forEach(c => { langs[c.lang] = (langs[c.lang] || 0) + 1; });
      return { cards: cards.length, cards_priced: cards.filter(c => c.price != null).length, sets: base.sets.length, analysis: base.analysis.length,
        analysis_updated: base.analysis[0]?.updated_at, history_rows: Object.values(base.history).reduce((a, h) => a + h.length, 0),
        history_last: base.end_date, last_price_date: base.end_date, langs };
    },
    async auditLog({ q = '', lim = 100 } = {}) {
      needMod();
      const nq = norm(q);
      return clone(st.audit.filter(a => !nq || norm(`${a.action} ${a.actor_pseudo} ${a.target_id} ${JSON.stringify(a.details || '')}`).includes(nq)).slice(0, lim));
    },
    userPseudo(id) { return users().find(u => u.id === id)?.pseudo; },
  };
  return api;
}
