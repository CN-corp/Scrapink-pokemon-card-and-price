// Backend réel : Supabase (Auth + Postgres via l'API REST, protégé par Row Level Security)
// et fonctions Edge pour Stripe. La bibliothèque est chargée à la demande depuis cdn.jsdelivr.net.
import { CONFIG } from '../config.js';
import { norm, byNumber, pickSibling, AVATAR_TYPES, AVATAR_MAX } from './util.js';

const SUPABASE_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const CARD_COLS = 'id,name,set_id,set_name,number,rarity,lang,image_small,image_large,release_date,price,price_date,ref_id,variants';
const MV_COLS = 'card_id,signal,buy_score,sell_score,confidence,rank_buy,rank_sell,price,mom7,mom30,mom90,mom365,trend_year,est30,est90,est30_low,est30_high,exp_return30_net,vol30,rsi,ath_365,other_market,history_days,reasons_buy,reasons_sell,updated_at,name,set_id,set_name,number,rarity,lang,image_small,image_large,release_date,card_price';

const unwrap = ({ data, error }) => { if (error) throw error; return data; };
const likeEsc = s => s.replace(/[\\%_]/g, c => '\\' + c);
const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

export async function createSupabaseBackend() {
  const { createClient } = await import(SUPABASE_LIB);
  const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const SITE = location.origin + location.pathname;
  let session = (await sb.auth.getSession()).data.session;
  let authCb = () => {};
  sb.auth.onAuthStateChange((event, s) => {
    session = s;
    // Ne pas appeler Supabase dans ce rappel (recommandation de la bibliothèque) : on diffère
    if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'PASSWORD_RECOVERY'].includes(event)) setTimeout(() => authCb(event), 0);
  });
  const uid = () => session?.user?.id || null;
  const needUser = () => { if (!uid()) throw new Error('Connectez-vous d\'abord.'); };

  async function fetchAll(make, page = 1000) {
    const out = [];
    for (let from = 0; ; from += page) {
      const rows = unwrap(await make().range(from, from + page - 1));
      out.push(...rows);
      if (rows.length < page) return out;
    }
  }
  function textFilter(qb, q) {
    for (const w of norm(q || '').split(/\s+/).filter(Boolean)) qb = qb.ilike('search', `%${likeEsc(w)}%`);
    return qb;
  }
  function marketFilters(qb, f) {
    if (f.lang) qb = qb.eq('lang', f.lang);
    if (f.signal) qb = qb.eq('signal', f.signal);
    if (f.max != null) qb = qb.lte('price', f.max);
    if (f.ids) qb = qb.in('card_id', f.ids);
    return textFilter(qb, f.q);
  }
  async function invoke(name, body) {
    const { data, error } = await sb.functions.invoke(name, { body: body || {} });
    if (error) {
      let msg = error.message;
      try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (e) { /* corps illisible */ }
      throw new Error(msg);
    }
    return data;
  }

  const api = {
    mode: 'live',
    async init() {},
    onAuth(cb) { authCb = cb; },
    currentUser() { return session?.user ? { id: session.user.id, email: session.user.email } : null; },
    async getProfile() {
      if (!uid()) return null;
      return unwrap(await sb.from('profiles').select('*').eq('id', uid()).maybeSingle());
    },
    isRecovery() { return /type=recovery/.test(location.hash) || /reset=1/.test(location.search); },

    async signUp({ email, password, pseudo }) {
      const data = unwrap(await sb.auth.signUp({ email, password, options: { data: { pseudo }, emailRedirectTo: SITE } }));
      return { needsConfirm: !data.session };
    },
    async signIn({ email, password }) { unwrap(await sb.auth.signInWithPassword({ email, password })); },
    async magicLink(email) { unwrap(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: SITE, shouldCreateUser: false } })); },
    async resetPassword(email) { unwrap(await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE + '?reset=1' })); },
    async updatePassword(password) { unwrap(await sb.auth.updateUser({ password })); },
    async signOut() { await sb.auth.signOut(); },
    async updatePseudo(pseudo) { needUser(); unwrap(await sb.from('profiles').update({ pseudo }).eq('id', uid())); },
    // Photo de profil (membres Pro) : fichier dans le bucket public « avatars », dossier du membre, puis set_avatar (schema.sql, section 17)
    async setAvatar(file) {
      needUser();
      if (!file) { unwrap(await sb.rpc('set_avatar', { url: null })); return null; }
      if (!AVATAR_TYPES.includes(file.type)) throw new Error('Format accepté : JPG, PNG ou GIF.');
      if (file.size > AVATAR_MAX) throw new Error('Image trop lourde : 2 Mo au plus.');
      const path = `${uid()}/avatar.${file.type.split('/')[1].replace('jpeg', 'jpg')}`;
      unwrap(await sb.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' }));
      const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
      unwrap(await sb.rpc('set_avatar', { url }));
      return url;
    },
    async touch() { if (uid()) await sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', uid()); },
    async deleteAccount() { needUser(); unwrap(await sb.rpc('delete_my_account')); await sb.auth.signOut(); },
    async exportMyData() {
      needUser();
      const [profile, transactions, wishlist, alerts, master_sets, owned] = await Promise.all([api.getProfile(), api.transactions(), api.wishlist(), api.alerts(), api.masterSets(), api.owned()]);
      return { profile, transactions, wishlist, alerts, master_sets, owned };
    },

    // --- public
    async status() { return unwrap(await sb.rpc('public_status')); },
    async settings() {
      const rows = unwrap(await sb.from('site_settings').select('key,value'));
      return Object.fromEntries(rows.map(r => [r.key, r.value]));
    },
    async announcements() {
      const now = new Date();
      const rows = unwrap(await sb.from('announcements').select('id,title,body,level,active,starts_at,ends_at,created_at').eq('active', true).order('id', { ascending: false }));
      return rows.filter(a => (!a.starts_at || new Date(a.starts_at) <= now) && (!a.ends_at || new Date(a.ends_at) > now));
    },
    // Langue des cartes choisie : filtrée côté base, avant la limite du nombre de cartes (market_teaser)
    async teaser(lang = '') { return unwrap(await sb.rpc('market_teaser', { p_lang: lang || null })) || []; },
    async searchCards({ q = '', lang = '', set_id = '', min = null, max = null, sort = 'price', limit = 60 } = {}) {
      let qb = textFilter(sb.from('cards').select(CARD_COLS), q);
      if (lang) qb = qb.eq('lang', lang);
      if (set_id) qb = qb.eq('set_id', set_id);
      if (min != null) qb = qb.gte('price', min);
      if (max != null) qb = qb.lte('price', max);
      qb = sort === 'name' ? qb.order('name') : sort === 'date' ? qb.order('release_date', { ascending: false, nullsFirst: false })
        : sort === 'number' ? qb.order('number') : qb.order('price', { ascending: false, nullsFirst: false });
      const rows = unwrap(await qb.limit(limit));
      return sort === 'number' ? rows.sort(byNumber) : rows;
    },
    async cardsByIds(ids) {
      const out = [];
      for (const c of chunks([...new Set(ids)], 100)) out.push(...unwrap(await sb.from('cards').select(CARD_COLS).in('id', c)));
      return out;
    },
    async card(id) { return unwrap(await sb.from('cards').select(CARD_COLS).eq('id', id).maybeSingle()); },
    // Même carte en EN / FR / JP (voir pickSibling)
    async cardLangs(id) {
      const c = await api.card(id); if (!c) return {};
      const L = c.lang || 'EN', q = () => sb.from('cards').select('id,number');
      const byName = async (lang, x) => x.release_date ? pickSibling(unwrap(await q().eq('lang', lang).eq('name', x.name).eq('release_date', x.release_date).limit(30)), x.number) : null;
      const enId = L === 'EN' ? c.id : L === 'FR' ? c.ref_id : await byName('EN', c);
      const en = enId ? (enId === c.id ? c : await api.card(enId)) : null;
      return { EN: en?.id || null, FR: L === 'FR' ? c.id : en ? pickSibling(unwrap(await q().eq('lang', 'FR').eq('ref_id', en.id).limit(30)), en.number) : null,
        JP: L === 'JP' ? c.id : en ? await byName('JP', en) : null };
    },
    // Hausses et baisses de la semaine (accueil, public)
    async weekMovers(lim = 5, lang = '') {
      const rows = (unwrap(await sb.rpc('week_movers', { lim: lang ? 20 : lim })) || []).filter(r => !lang || r.lang === lang).map(r => ({ ...r, price: +r.price, prev: +r.prev, pct: +r.pct }));
      return { up: rows.filter(r => r.dir === 'up').slice(0, lim), down: rows.filter(r => r.dir === 'down').slice(0, lim) };
    },
    async sets() { return fetchAll(() => sb.from('sets').select('*').order('release_date', { ascending: false, nullsFirst: false }).order('id')); },
    async setCards(set_id) { return (await fetchAll(() => sb.from('cards').select(CARD_COLS).eq('set_id', set_id).order('id'))).sort(byNumber); },
    // Collections : vue publique set_overview (schema.sql), lisible sans compte comme sets et cards
    async collections() { return fetchAll(() => sb.from('set_overview').select('*').order('release_date', { ascending: false, nullsFirst: false }).order('id')); },

    // --- communauté : portefeuilles partagés (fonctions publiques, section 15 de schema.sql) et actualités
    async leaderboard(lim = 50) { return unwrap(await sb.rpc('public_leaderboard', { lim })) || []; },
    async publicPortfolio(slug) { return unwrap(await sb.rpc('public_portfolio', { slug })); },
    async myPerformance() {
      needUser();
      const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
      return (await fetchAll(() => sb.from('portfolio_snapshots').select('date,value,invested,pnl,pnl_pct').gte('date', since).order('date')))
        .map(r => ({ ...r, value: +r.value, invested: +r.invested, pnl: +r.pnl, pnl_pct: r.pnl_pct == null ? null : +r.pnl_pct }));
    },
    async updateSharing(patch) {
      needUser();
      const ok = {}; for (const k of ['share_portfolio', 'share_amounts']) if (k in patch) ok[k] = !!patch[k];
      unwrap(await sb.from('profiles').update(ok).eq('id', uid()));
    },
    async news(lim = 20) { return unwrap(await sb.from('news').select('id,title,url,source,lang,kind,published_at').eq('active', true).order('published_at', { ascending: false }).limit(lim)); },
    async allNews() { return unwrap(await sb.from('news').select('*').order('published_at', { ascending: false }).limit(300)); },
    async saveNews(n) {
      const row = { title: n.title, url: n.url || null, source: n.source || null, lang: n.lang || 'FR', kind: n.kind || 'site', active: n.active !== false,
        ...(n.published_at ? { published_at: n.published_at } : {}) };
      if (n.id) unwrap(await sb.from('news').update(row).eq('id', n.id));
      else unwrap(await sb.from('news').insert(row));
    },
    async deleteNews(id) { unwrap(await sb.from('news').delete().eq('id', id)); },

    // --- Pro (la RLS renvoie zéro ligne sans abonnement)
    async market({ kind = 'buy', limit, ...f } = {}) {
      let qb = marketFilters(sb.from('market_view').select(MV_COLS), f);
      if (kind === 'buy') {
        qb = qb.gte('price', f.min ?? 50);
        if (f.score != null) qb = qb.gte('buy_score', f.score);
        qb = qb.order('buy_score', { ascending: false }).order('exp_return30_net', { ascending: false, nullsFirst: false });
      } else {
        qb = qb.gte('price', Math.max(10, f.min ?? 0)).not('mom7', 'is', null);
        if (f.score != null) qb = qb.gte('buy_score', f.score);
        qb = qb.order('mom7', { ascending: kind === 'cold' });
      }
      return unwrap(await qb.limit(limit || (kind === 'buy' ? 150 : 30)));
    },
    async rank({ mode = 'buy', sort = 'rank', conf = 0, limit = 150, offset = 0, ...f } = {}) {
      const sell = mode === 'sell';
      let qb = marketFilters(sb.from('market_view').select(MV_COLS, { count: 'exact' }), f).gte('price', f.min ?? 50);
      if (conf) qb = qb.gte('confidence', conf);
      if (f.score != null) qb = qb.gte(sell ? 'rank_sell' : 'rank_buy', f.score);
      const [col, asc] = { rank: [sell ? 'rank_sell' : 'rank_buy', false], score: [sell ? 'sell_score' : 'buy_score', false], conf: ['confidence', false],
        gain: ['exp_return30_net', sell], year: ['trend_year', sell], price: ['price', false] }[sort] || ['rank_buy', false];
      const { data, error, count } = await qb.order(col, { ascending: asc, nullsFirst: false }).range(offset, offset + limit - 1);
      if (error) throw error;
      return { rows: data, total: count ?? data.length };
    },
    async analysis(id) { return unwrap(await sb.from('market_view').select(MV_COLS).eq('card_id', id).maybeSingle()); },
    async analysisByIds(ids) {
      const out = [];
      for (const c of chunks([...new Set(ids)], 100)) out.push(...unwrap(await sb.from('market_view').select(MV_COLS).in('card_id', c)));
      return out;
    },
    // Découverte Pro (compte gratuit, 5 cartes) : reveal_card / reveal_status, schema.sql section 16
    async revealStatus() { return unwrap(await sb.rpc('reveal_status')); },
    async revealCard(id) {
      const r = unwrap(await sb.rpc('reveal_card', { cid: id }));
      return { ...r, history: (r?.history || []).map(([d, v]) => [d, +v]) };
    },
    // Historique des cotes : public (lisible sans compte, comme la cote : schema.sql, section 7)
    async history(id) {
      const rows = await fetchAll(() => sb.from('price_history').select('date,price').eq('card_id', id).order('date'));
      return rows.map(r => [r.date, +r.price]);
    },
    async histories(ids) {
      const out = {};
      for (const c of chunks([...new Set(ids)], 40)) {
        const rows = await fetchAll(() => sb.from('price_history').select('card_id,date,price').in('card_id', c).order('card_id').order('date'));
        for (const r of rows) (out[r.card_id] ||= []).push([r.date, +r.price]);
      }
      return out;
    },

    // --- données personnelles (RLS : propriétaire uniquement)
    async transactions() { needUser(); return fetchAll(() => sb.from('transactions').select('*').order('date').order('created_at')); },
    async addTransaction(t) { needUser(); return unwrap(await sb.from('transactions').insert({ ...t, user_id: uid() }).select().single()); },
    async deleteTransaction(id) { needUser(); unwrap(await sb.from('transactions').delete().eq('id', id)); },
    async wishlist() { needUser(); return fetchAll(() => sb.from('wishlist').select('*').order('created_at')); },
    async upsertWish(w) { needUser(); unwrap(await sb.from('wishlist').upsert({ ...w, user_id: uid() }, { onConflict: 'user_id,card_id' })); },
    async deleteWish(card_id) { needUser(); unwrap(await sb.from('wishlist').delete().eq('card_id', card_id)); },
    async alerts() { needUser(); return unwrap(await sb.from('price_alerts').select('*').order('created_at')); },
    async addAlert(a) { needUser(); unwrap(await sb.from('price_alerts').insert({ ...a, user_id: uid() })); },
    async updateAlert(id, patch) { needUser(); unwrap(await sb.from('price_alerts').update(patch).eq('id', id)); },
    async deleteAlert(id) { needUser(); unwrap(await sb.from('price_alerts').delete().eq('id', id)); },
    async masterSets() { needUser(); return unwrap(await sb.from('master_sets').select('*').order('created_at')); },
    async followSet(set_id, patch = {}) {
      needUser();
      unwrap(await sb.from('master_sets').upsert({ user_id: uid(), set_id, ...patch }, { onConflict: 'user_id,set_id', ignoreDuplicates: true }));
    },
    async updateMasterSet(set_id, patch) { needUser(); unwrap(await sb.from('master_sets').update(patch).eq('set_id', set_id)); },
    async unfollowSet(set_id) { needUser(); unwrap(await sb.from('master_sets').delete().eq('set_id', set_id)); },
    async owned() { needUser(); return fetchAll(() => sb.from('owned_cards').select('card_id,variant,qty').order('card_id')); },
    async setOwned(card_id, variant, qty) {
      needUser();
      if (qty > 0) unwrap(await sb.from('owned_cards').upsert({ user_id: uid(), card_id, variant, qty: Math.min(999, qty), updated_at: new Date().toISOString() }, { onConflict: 'user_id,card_id,variant' }));
      else unwrap(await sb.from('owned_cards').delete().match({ card_id, variant }));
    },

    // --- abonnement : Stripe Checkout et portail client (fonctions Edge)
    async checkout(interval) { needUser(); const d = await invoke('create-checkout', { interval }); if (d?.url) location.assign(d.url); return d; },
    async portal() { needUser(); const d = await invoke('customer-portal'); if (d?.url) location.assign(d.url); return d; },

    // --- modération (fonctions SQL qui refusent les non-modérateurs)
    async kpiOverview() { return unwrap(await sb.rpc('kpi_overview')); },
    async kpiTimeseries(weeks = 26) { return unwrap(await sb.rpc('kpi_timeseries', { n_weeks: weeks })); },
    async kpiTopUsers(lim = 20) { return unwrap(await sb.rpc('kpi_top_users', { lim })); },
    async searchUsers(q = '', lim = 50, off = 0) {
      const rows = unwrap(await sb.rpc('mod_search_users', { q, lim, page_offset: off })) || [];
      return { rows, total: rows[0]?.total ?? 0 };
    },
    async userDetail(id) { return unwrap(await sb.rpc('mod_user_detail', { target: id })); },
    async setPro(id, until) { unwrap(await sb.rpc('mod_set_pro', { target: id, until_ts: until ? new Date(until).toISOString() : null })); },
    async setRole(id, role) { unwrap(await sb.rpc('mod_set_role', { target: id, new_role: role })); },
    async setBanned(id, ban, reason) { unwrap(await sb.rpc('mod_set_banned', { target: id, ban, reason: reason || null })); },
    async allAnnouncements() { return unwrap(await sb.from('announcements').select('*').order('id', { ascending: false })); },
    async saveAnnouncement(a) {
      const row = { title: a.title, body: a.body, level: a.level, active: a.active, starts_at: a.starts_at || null, ends_at: a.ends_at || null };
      if (a.id) unwrap(await sb.from('announcements').update(row).eq('id', a.id));
      else unwrap(await sb.from('announcements').insert(row));
    },
    async deleteAnnouncement(id) { unwrap(await sb.from('announcements').delete().eq('id', id)); },
    async saveSetting(key, value) { unwrap(await sb.from('site_settings').upsert({ key, value }, { onConflict: 'key' })); },
    async syncRuns(lim = 15) { return unwrap(await sb.from('sync_runs').select('*').order('started_at', { ascending: false }).limit(lim)); },
    async dataHealth() { return unwrap(await sb.rpc('mod_data_health')); },
    async auditLog({ q = '', lim = 100 } = {}) {
      let qb = sb.from('audit_log').select('*').order('at', { ascending: false }).limit(lim);
      const s = (q || '').replace(/[,()*%\\]/g, ' ').trim();
      if (s) qb = qb.or(`action.ilike.*${s}*,actor_pseudo.ilike.*${s}*,target_id.ilike.*${s}*`);
      return unwrap(await qb);
    },
  };
  return api;
}
