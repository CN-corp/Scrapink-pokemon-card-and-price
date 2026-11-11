// Chances de tirage ESTIMÉES (« pull rates ») : aucune source officielle n'existe, The Pokémon Company
// ne publie pas ses taux. Les valeurs ci-dessous sont des moyennes arrondies des estimations communautaires
// (ouvertures de milliers de boosters relayées par les sites de collectionneurs), par époque et par rareté.
// Elles varient d'une extension et d'un lot d'impression à l'autre : on les affiche toujours comme estimations.
//
// Méthode : ODDS[rareté] = nombre moyen de cartes de cette rareté par booster (4 = quatre par booster,
// 1/15 = une tous les 15 boosters). Chance d'une carte précise = ODDS[rareté] / nombre de cartes de cette
// rareté dans l'extension. Les reverse holo et les cartes Énergie ne sont pas comptés.
//
// Résumé (une carte de la rareté, par booster) :
//   Écarlate et Violet (2023-2025, booster de 10) : Commune 4 · Peu commune 3 · Rare 0,75 · Double rare 1/6
//     · Illustration rare 1/12 · Ultra rare 1/15 · ACE SPEC 1/20 · Illustration spéciale 1/45 · Hyper rare 1/80
//     · Chromatique 1/4 (Destinées de Paldea) · Ultra rare chromatique 1/13 · Noir et blanc 1/180
//   Méga-Évolution (2025-) : comme Écarlate et Violet, Hyper rare Méga ≈ 1/600 (provisoire)
//   Épée et Bouclier (2020-2022) : Commune 5 · Peu commune 3 · Rare 0,45 · Rare holo 0,27 · V 1/7
//     · VMAX/VSTAR 1/14 · Full art 1/20 · Radieuse/Magnifique 1/20 · Arc-en-ciel 1/55 · Secrète 1/70
//     Galerie des dresseurs 1/9 (Galarian Gallery de Zénith Suprême : 1/4) · Célébrations : 4 cartes holo,
//     V 1/3, VMAX 1/8, Mew doré 1/45, Classic Collection 1 booster sur 2
//   Soleil et Lune : Rare holo 1/4 · GX 1/8 · Prisme 1/12 · Full art 1/30 · Arc-en-ciel 1/40 · Secrète 1/60
//   XY / Noir et Blanc : Rare holo 1/4 · EX/BREAK 1/8 · ACE SPEC 1/12 · Full art 1/36 · Secrète 1/72
//   DP / Platine / HGSS / EX / Wizards : Rare holo 1/3 · LV.X/Prime 1/10-1/12 · EX 1/9 · Étoile 1/36 · Secrète 1/72
//   Japon (booster de 5) : Commune 3 · Peu commune 1 · RR 1/4,5 · AR 1/10 · SR 1/30 · SAR 1/80 · UR 1/150
//     (packs « High Class » à 10 cartes : cartes rares environ 3 fois plus fréquentes)
//   Promos, decks, coffrets, kits, Énergies, POP, McDonald's : « Hors booster ».

// Libellés français : [singulier, pluriel, court (pastille)]
const R = {
  'Common': ['Commune', 'Communes', 'Commune'],
  'Common Holo': ['Commune holo', 'Communes holo', 'Commune holo'],
  'Uncommon': ['Peu commune', 'Peu communes', 'Peu commune'],
  'Rare': ['Rare', 'Rares', 'Rare'],
  'Rare Holo': ['Rare holo', 'Rares holo', 'Holo'],
  'Holo Rare': ['Rare holo', 'Rares holo', 'Holo'],
  'Super Rare Holo': ['Super rare holo', 'Super rares holo', 'SR holo'],
  'Double Rare': ['Double rare', 'Double rares', 'Double rare'],
  'Triple Rare': ['Triple rare', 'Triple rares', 'Triple rare'],
  'Ultra Rare': ['Ultra rare', 'Ultra rares', 'Ultra rare'],
  'Illustration Rare': ['Illustration rare', 'Illustrations rares', 'Illustration'],
  'Special Illustration Rare': ['Illustration spéciale rare', 'Illustrations spéciales rares', 'Illus. spéciale'],
  'Hyper Rare': ['Hyper rare', 'Hyper rares', 'Hyper rare'],
  'Art Rare': ['Art rare (AR)', 'Art rares (AR)', 'AR'],
  'Special Art Rare': ['Art spécial rare (SAR)', 'Arts spéciaux rares (SAR)', 'SAR'],
  'Super Rare': ['Super rare (SR)', 'Super rares (SR)', 'SR'],
  'Rare Holo V': ['Rare holo V', 'Rares holo V', 'V'],
  'Rare Holo VMAX': ['Rare holo VMAX', 'Rares holo VMAX', 'VMAX'],
  'Rare Holo VSTAR': ['Rare holo VSTAR', 'Rares holo VSTAR', 'VSTAR'],
  'Rare Holo EX': ['Rare holo EX', 'Rares holo EX', 'EX'],
  'Rare Holo GX': ['Rare holo GX', 'Rares holo GX', 'GX'],
  'Rare Holo LV.X': ['Rare holo NIV.X', 'Rares holo NIV.X', 'NIV.X'],
  'Rare Holo Star': ['Rare étoile ★', 'Rares étoile ★', 'Étoile ★'],
  'Rare Holo LEGEND': ['LÉGENDE', 'LÉGENDE', 'LÉGENDE'],
  'LEGEND': ['LÉGENDE', 'LÉGENDE', 'LÉGENDE'],
  'Rare Ultra': ['Ultra rare (full art)', 'Ultra rares (full art)', 'Full art'],
  'Rare Rainbow': ['Rare arc-en-ciel', 'Rares arc-en-ciel', 'Arc-en-ciel'],
  'Rare Secret': ['Rare secrète', 'Rares secrètes', 'Secrète'],
  'Rare Shiny': ['Rare chromatique', 'Rares chromatiques', 'Chromatique'],
  'Shiny Rare': ['Rare chromatique', 'Rares chromatiques', 'Chromatique'],
  'Rare Shiny GX': ['Rare chromatique GX', 'Rares chromatiques GX', 'Chroma GX'],
  'Shiny Ultra Rare': ['Ultra rare chromatique', 'Ultra rares chromatiques', 'Chroma UR'],
  'Shiny Secret Rare': ['Rare secrète chromatique', 'Rares secrètes chromatiques', 'Chroma SSR'],
  'Rare BREAK': ['Rare TURBO', 'Rares TURBO', 'TURBO'],
  'Rare Prime': ['Rare Prime', 'Rares Prime', 'Prime'],
  'Rare Prism Star': ['Rare Prisme ★', 'Rares Prisme ★', 'Prisme ★'],
  'Prism Rare': ['Rare Prisme', 'Rares Prisme', 'Prisme'],
  'Rare Shining': ['Rare brillante', 'Rares brillantes', 'Brillante'],
  'Shining': ['Rare brillante', 'Rares brillantes', 'Brillante'],
  'Radiant Rare': ['Rare radieuse', 'Rares radieuses', 'Radieuse'],
  'Kagayaku': ['Radieuse (K)', 'Radieuses (K)', 'Radieuse'],
  'Amazing Rare': ['Rare magnifique', 'Rares magnifiques', 'Magnifique'],
  'ACE SPEC Rare': ['ACE SPEC', 'ACE SPEC', 'ACE SPEC'],
  'Trainer Gallery Rare Holo': ['Galerie des dresseurs', 'Galerie des dresseurs', 'Galerie'],
  'Classic Collection': ['Classic Collection', 'Classic Collection', 'Classic'],
  'Character Rare': ['Personnage rare (CHR)', 'Personnages rares (CHR)', 'CHR'],
  'Character Super Rare': ['Personnage super rare (CSR)', 'Personnages super rares (CSR)', 'CSR'],
  'Trainer Rare': ['Dresseur rare (TR)', 'Dresseurs rares (TR)', 'TR'],
  'Pikachu Rare': ['Pikachu rare', 'Pikachu rares', 'Pikachu'],
  'Black White Rare': ['Rare noir et blanc', 'Rares noir et blanc', 'Noir & blanc'],
  'RGB Rare': ['Rare RGB', 'Rares RGB', 'RGB'],
  'Futuristic Rare': ['Rare futuriste', 'Rares futuristes', 'Futuriste'],
  'Mega Attack Rare': ['Rare attaque Méga', 'Rares attaque Méga', 'Attaque Méga'],
  'Mega Ultra Rare': ['Ultra rare Méga', 'Ultra rares Méga', 'Méga UR'],
  'Mega Hyper Rare': ['Hyper rare Méga', 'Hyper rares Méga', 'Méga hyper'],
  'Promo': ['Promo', 'Promos', 'Promo'],
};
// Orthographes équivalentes dans les données (pokemontcg.io, TCGdex)
const ALIAS = { 'Holo Rare V': 'Rare Holo V', 'Holo Rare VMAX': 'Rare Holo VMAX', 'Holo Rare VSTAR': 'Rare Holo VSTAR', 'Rare Holo ex': 'Rare Holo EX',
  'MEGA_ATTACK_RARE': 'Mega Attack Rare', 'Rare ACE': 'ACE SPEC Rare', 'ACE Rare': 'ACE SPEC Rare', 'None': null, '': null };
// Cartes mal classées dans les données sources (le Mew doré de Célébrations est notée « Rare Holo »)
const FIX = { 'cel25-25': 'Rare Secret' };

const SV = { 'Common': 4, 'Uncommon': 3, 'Rare': 0.75, 'Double Rare': 1 / 6, 'Illustration Rare': 1 / 12, 'Ultra Rare': 1 / 15, 'ACE SPEC Rare': 1 / 20,
  'Special Illustration Rare': 1 / 45, 'Hyper Rare': 1 / 80, 'Shiny Rare': 1 / 4, 'Shiny Ultra Rare': 1 / 13, 'Black White Rare': 1 / 180 };
const SWSH = { 'Common': 5, 'Uncommon': 3, 'Rare': 0.45, 'Rare Holo': 0.27, 'Rare Holo V': 1 / 7, 'Rare Holo VMAX': 1 / 14, 'Rare Holo VSTAR': 1 / 14,
  'Rare Ultra': 1 / 20, 'Amazing Rare': 1 / 20, 'Radiant Rare': 1 / 20, 'Rare Rainbow': 1 / 55, 'Rare Secret': 1 / 70, 'Trainer Gallery Rare Holo': 1 / 9, 'Rare Shiny': 1 / 3 };
const JP_MODERN = { 'Common': 3, 'Uncommon': 1, 'Rare': 0.65, 'Double Rare': 1 / 4.5, 'Art Rare': 1 / 10, 'ACE SPEC Rare': 1 / 12, 'Super Rare': 1 / 30,
  'Special Art Rare': 1 / 80, 'Ultra Rare': 1 / 150, 'Shiny Rare': 0.3, 'Shiny Secret Rare': 1 / 30, 'Black White Rare': 1 / 200,
  'Mega Attack Rare': 1 / 20, 'Mega Ultra Rare': 1 / 300, 'Character Rare': 1 / 10, 'Character Super Rare': 1 / 40 };

// Profils de booster par époque. odds : voir l'en-tête ; flat : l'extension entière partage un emplacement
// (ex. Classic Collection : une carte environ un booster sur deux) ; provisional : époque trop récente.
const PROFILES = {
  me: { name: 'Méga-Évolution', pack: 'booster de 10 cartes', provisional: true,
    odds: { ...SV, 'Mega Attack Rare': 1 / 20, 'Mega Hyper Rare': 1 / 600, 'Pikachu Rare': 1 / 6, 'Futuristic Rare': 1 / 400 } },
  sv: { name: 'Écarlate et Violet', pack: 'booster de 10 cartes', odds: SV },
  swsh: { name: 'Épée et Bouclier', pack: 'booster de 10 cartes', odds: SWSH },
  tg: { name: 'Galerie des dresseurs', pack: 'booster de l\'extension principale',
    odds: { 'Trainer Gallery Rare Holo': 1 / 9, 'Rare Holo V': 1 / 40, 'Rare Holo VMAX': 1 / 80, 'Rare Holo VSTAR': 1 / 80, 'Rare Ultra': 1 / 80, 'Rare Secret': 1 / 250 } },
  gg: { name: 'Galarian Gallery (Zénith Suprême)', pack: 'booster Zénith Suprême',
    odds: { 'Trainer Gallery Rare Holo': 1 / 4, 'Rare Holo V': 1 / 15, 'Rare Holo VMAX': 1 / 40, 'Rare Holo VSTAR': 1 / 40, 'Rare Ultra': 1 / 30, 'Rare Secret': 1 / 60 } },
  vault: { name: 'Coffre chromatique', pack: 'booster de l\'extension (emplacement chromatique)',
    odds: { 'Rare Shiny': 0.4, 'Rare Shiny GX': 1 / 12, 'Rare Holo V': 1 / 10, 'Rare Holo VMAX': 1 / 30, 'Rare Ultra': 1 / 30, 'Rare Secret': 1 / 70 } },
  cel: { name: 'Célébrations', pack: 'booster de 4 cartes holo',
    odds: { 'Rare': 1.76, 'Rare Holo': 0.74, 'Rare Holo V': 1 / 3, 'Rare Holo VMAX': 1 / 8, 'Rare Ultra': 1 / 20, 'Rare Secret': 1 / 45 } },
  classic: { name: 'Classic Collection', pack: 'booster de l\'extension anniversaire', flat: 0.5 },
  sm: { name: 'Soleil et Lune', pack: 'booster de 10 cartes',
    odds: { 'Common': 5, 'Uncommon': 3, 'Rare': 0.6, 'Rare Holo': 0.25, 'Rare Holo GX': 1 / 8, 'Rare Prism Star': 1 / 12, 'Rare Ultra': 1 / 30,
      'Rare Rainbow': 1 / 40, 'Rare Secret': 1 / 60, 'Rare Shiny': 1 / 4, 'Rare Shiny GX': 1 / 12 } },
  xy: { name: 'XY', pack: 'booster de 10 cartes',
    odds: { 'Common': 5, 'Uncommon': 3, 'Rare': 0.62, 'Rare Holo': 0.25, 'Rare Holo EX': 1 / 8, 'Rare BREAK': 1 / 8, 'Rare Ultra': 1 / 36, 'Rare Secret': 1 / 72 } },
  bw: { name: 'Noir et Blanc', pack: 'booster de 10 cartes',
    odds: { 'Common': 5, 'Uncommon': 3, 'Rare': 0.6, 'Rare Holo': 0.25, 'Rare Holo EX': 1 / 9, 'ACE SPEC Rare': 1 / 12, 'Rare Ultra': 1 / 36, 'Rare Secret': 1 / 72 } },
  dp: { name: 'Diamant et Perle, Platine, HGSS', pack: 'booster de 10 cartes',
    odds: { 'Common': 5, 'Uncommon': 3, 'Rare': 0.6, 'Rare Holo': 1 / 3, 'Rare Holo LV.X': 1 / 12, 'Rare Prime': 1 / 10, 'LEGEND': 1 / 18, 'Rare Shining': 1 / 36, 'Rare Secret': 1 / 72 } },
  ex: { name: 'EX', pack: 'booster de 9 cartes',
    odds: { 'Common': 5, 'Uncommon': 2, 'Rare': 0.6, 'Rare Holo': 1 / 3, 'Rare Holo EX': 1 / 9, 'Rare Holo Star': 1 / 36, 'Rare Secret': 1 / 72 } },
  wotc: { name: 'Wizards of the Coast', pack: 'booster de 11 cartes',
    odds: { 'Common': 7, 'Uncommon': 3, 'Rare': 0.67, 'Rare Holo': 1 / 3, 'Rare Shining': 1 / 36, 'Rare Secret': 1 / 40 } },
  'jp-modern': { name: 'Japon (Écarlate et Violet, Méga)', pack: 'booster japonais de 5 cartes', odds: JP_MODERN },
  'jp-swsh': { name: 'Japon (Épée et Bouclier)', pack: 'booster japonais de 5 cartes',
    odds: { 'Common': 3, 'Uncommon': 1, 'Rare': 0.55, 'Double Rare': 1 / 3.5, 'Triple Rare': 1 / 10, 'Character Rare': 1 / 10, 'Character Super Rare': 1 / 40,
      'Kagayaku': 1 / 15, 'Amazing Rare': 1 / 12, 'Super Rare': 1 / 30, 'Hyper Rare': 1 / 70, 'Ultra Rare': 1 / 100, 'Shiny Rare': 0.3, 'Shiny Secret Rare': 1 / 40 } },
  'jp-sm': { name: 'Japon (Soleil et Lune)', pack: 'booster japonais de 5 cartes',
    odds: { 'Common': 3, 'Uncommon': 1, 'Rare': 0.55, 'Holo Rare': 1 / 3, 'Double Rare': 1 / 3.5, 'Prism Rare': 1 / 10, 'Trainer Rare': 1 / 15, 'Super Rare': 1 / 25,
      'Hyper Rare': 1 / 60, 'Ultra Rare': 1 / 90, 'Shiny Rare': 0.3, 'Shiny Secret Rare': 1 / 40, 'Character Rare': 1 / 10 } },
  'jp-old': { name: 'Japon (XY et avant)', pack: 'booster japonais de 5 cartes',
    odds: { 'Common': 3, 'Uncommon': 1, 'Rare': 0.6, 'Holo Rare': 1 / 3, 'Double Rare': 1 / 5, 'Super Rare': 1 / 30, 'Ultra Rare': 1 / 80, 'Shining': 1 / 30,
      'Rare Holo LEGEND': 1 / 15, 'Rare Holo LV.X': 1 / 12, 'Super Rare Holo': 1 / 20 } },
};
// Rareté absente du profil : estimation générique par mots-clés (l'ordre compte)
const GENERIC = [[/hyper|secret|gold|black white|futuristic|rgb/i, 1 / 150], [/special (illustration|art)|character super|shiny (ultra|secret)/i, 1 / 60],
  [/rainbow|ultra|vmax|vstar|super rare|triple/i, 1 / 25], [/illustration|art rare|radiant|kagayaku|amazing|ace|prism|break|prime|legend|lv\.x|character|gallery|shining|star|classic|pikachu/i, 1 / 12],
  [/double|holo (v|ex|gx)|\bv\b|\bex\b|\bgx\b/i, 1 / 7], [/shiny/i, 1 / 4], [/holo/i, 1 / 3.5], [/uncommon/i, 3], [/common/i, 4], [/rare/i, 0.6]];

const NON_BOOSTER_ID = /^(?:fr-)?(?:[a-z]+p|np|mcd\d*|tk[\w-]*|si1|pop\d+|bp|fut20|ru1|sve|mee)$/i;
const NON_BOOSTER_NAME = /promo|énergie|energies|energy|trainer kit|kit dresseur|mcdonald|futsal|rumble|best of game|southern islands|pop series|start(er)? ?deck|starter set|\bdeck\b|vending|unnumbered|premium|gift|special box|trainer box|jumbo/i;
const HIGH_CLASS = /high class|shiny treasure|terastal festival|vstar universe|vmax climax|shiny star|all stars|gx ultra shiny|mega dream|30th celebration/i;

/** Rareté normalisée d'une carte (orthographes unifiées, corrections connues) ; null si inconnue */
export function rarityOf(c) {
  const fix = FIX[c.id] || FIX[c.ref_id];
  if (fix) return fix;
  const r = c.rarity == null ? null : String(c.rarity).trim();
  return r in ALIAS ? ALIAS[r] : r || null;
}
export const rarityLabel = (r, i = 0) => r ? (R[r]?.[i] ?? r) : 'Rareté non renseignée';

/** Profil de booster d'une extension (époque, format), ou { none: raison } si elle n'est pas vendue en booster */
export function packProfile(set) {
  const id = (set?.id || '').toLowerCase(), name = set?.name || '', base = id.replace(/^fr-/, ''), y = +(set?.release_date || '').slice(0, 4) || 0;
  if (NON_BOOSTER_ID.test(id) || NON_BOOSTER_NAME.test(name)) return { key: 'none', none: 'promos, decks, coffrets ou cartes distribuées hors booster' };
  const hc = HIGH_CLASS.test(name);
  if (set?.lang === 'JP') {
    const s = set.series || '';
    const key = /Méga|Écarlate/.test(s) ? 'jp-modern' : /Épée/.test(s) ? 'jp-swsh' : /Soleil/.test(s) ? 'jp-sm' : /XY|Noir|Japon/.test(s) || y < 2017 ? 'jp-old'
      : y >= 2023 ? 'jp-modern' : y >= 2020 ? 'jp-swsh' : 'jp-sm';
    return { key, ...PROFILES[key], boost: hc ? 3 : 1, ...(hc ? { pack: 'booster « High Class » japonais de 10 cartes' } : {}) };
  }
  let key = /^cel25c$|^me\d*pt5c$|^me55c$/.test(base) ? 'classic' : base === 'cel25' ? 'cel' : /gg$/.test(base) ? 'gg' : /^swsh\d+tg$/.test(base) ? 'tg'
    : /^sma$|^swsh45sv$/.test(base) ? 'vault' : /^me/.test(base) ? 'me' : /^[rz]?sv/.test(base) ? 'sv' : /^(swsh|pgo)/.test(base) ? 'swsh'
    : /^(sm|det)/.test(base) ? 'sm' : /^(xy|g1|dc)/.test(base) ? 'xy' : /^(bw|dv)/.test(base) ? 'bw' : /^(dp|pl|hgss|col)/.test(base) ? 'dp'
    : /^ex/.test(base) ? 'ex' : /^(base|gym|neo|ecard|lc)/.test(base) ? 'wotc' : null;
  if (!key) key = (set?.release_date || '') >= '2025-09' ? 'me' : y >= 2023 ? 'sv' : y >= 2020 ? 'swsh' : y >= 2017 ? 'sm' : y >= 2014 ? 'xy' : y >= 2011 ? 'bw' : y >= 2007 ? 'dp' : y >= 2003 ? 'ex' : 'wotc';
  return { key, ...PROFILES[key], boost: 1 };
}

const genericOdds = r => (GENERIC.find(([rx]) => rx.test(r)) || [0, 0.3])[1];
function tierOdds(profile, r) {
  if (!r || profile.none) return null;
  if (r === 'Promo') return null;
  if (profile.flat) return profile.flat;
  const o = profile.odds?.[r] ?? genericOdds(r);
  return o < 1 && profile.boost > 1 ? Math.min(0.9, o * profile.boost) : o;
}
// 1 commune, 2 peu commune, 3 rare, 4 holo / double rare, 5 ultra, 6 secrète / spéciale ; 0 inconnue ; 7 hors booster
function levelOf(r, odds, kind) {
  if (kind === 'none') return 7;
  if (!r) return 0;
  if (/^common/i.test(r)) return 1;
  if (/^uncommon/i.test(r)) return 2;
  return odds >= 0.3 ? 3 : odds >= 0.1 ? 4 : odds >= 1 / 30 ? 5 : 6;
}

/** Niveau de mise en scène de l'achat d'une carte (celebrate.js) : 1 commune ou peu commune, 2 rare ou holo,
 *  3 ultra rare (ex, V, illustration rare…), 4 secrète ou spéciale (illustration spéciale, hyper rare, gold…) */
export function celebrationTier(c) {
  const r = rarityOf(c);
  if (!r) return 1;
  if (r === 'Promo') return 2;
  if (/rainbow|secret|gold|hyper|special/i.test(r)) return 4;
  const o = genericOdds(r), lv = levelOf(r, o, 'pack');
  return lv <= 2 || lv === 0 ? 1 : lv === 3 || (lv === 4 && o >= 0.2) ? 2 : lv <= 5 ? 3 : 4;
}

/** Chances de tirage de toutes les cartes d'une extension.
 *  Renvoie { profile, byId: Map(id -> info), tiers: [info de groupe], rarest first }.
 *  info = { rarity, label, plural, short, kind: 'pack' | 'none' | 'unknown', odds (rareté / booster), p (cette carte / booster), n, level } */
export function dropTable(set, cards) {
  const profile = packProfile(set);
  const groups = new Map();
  for (const c of cards || []) {
    const r = rarityOf(c);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(c);
  }
  const tiers = [];
  for (const [r, list] of groups) {
    const odds = tierOdds(profile, r);
    const kind = odds != null ? 'pack' : (profile.none || r === 'Promo') ? 'none' : 'unknown';
    const n = profile.flat ? (cards || []).length : list.length;
    const p = odds != null ? Math.min(0.99, odds / n) : null;
    // Ordre d'affichage : chance par carte croissante ; sans taux, rareté générique (pour classer les hors booster)
    const sortKey = kind === 'pack' ? p : 10 + (r ? genericOdds(r) / Math.max(1, list.length) : 50);
    tiers.push({ rarity: r, label: rarityLabel(r), plural: rarityLabel(r, 1), short: rarityLabel(r, 2), kind, odds, p, n: list.length, level: profile.flat && kind === 'pack' ? 5 : levelOf(r, odds ?? (r ? genericOdds(r) : 1), kind), cards: list, sortKey });
  }
  tiers.sort((a, b) => a.sortKey - b.sortKey || (a.rarity || '').localeCompare(b.rarity || ''));
  const byId = new Map();
  for (const t of tiers) for (const c of t.cards) byId.set(c.id, t);
  return { profile, byId, tiers };
}

/** « 1 booster sur 1 400 », ou « ≈ 7 % par booster » pour les communes et peu communes (pct) */
export function fmtOdds(p, short = false, pct = false) {
  if (p == null) return short ? '—' : 'Taux inconnu';
  if (pct || p >= 0.25) return short ? `${Math.max(1, Math.round(p * 100))} %` : `≈ ${Math.max(1, Math.round(p * 100))} % par booster`;
  const n = roundN(1 / p);
  return short ? `1 sur ${n}` : `1 booster sur ${n}`;
}
function roundN(n) {
  if (n < 100) return String(Math.round(n));
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return (Math.round(n / mag) * mag).toLocaleString('fr-FR');
}
/** Chance d'une carte précise à partir de son info de dropTable() */
export const fmtCard = (t, short = false) => !t ? '—' : t.kind === 'none' ? 'Hors booster' : t.kind === 'unknown' ? (short ? '—' : 'Taux inconnu') : fmtOdds(t.p, short, t.level <= 2);
/** Texte court de la chance d'une rareté entière : « 1 booster sur 15 » ou « 4 par booster » */
export function fmtTier(odds) {
  if (odds == null) return '';
  if (odds >= 1) return `environ ${String(Math.round(odds * 10) / 10).replace('.', ',')} par booster`;
  if (odds >= 0.5) return `environ ${Math.round(odds * 100)} % des boosters`;
  return `environ 1 booster sur ${roundN(1 / odds)}`;
}

/** Explication affichée dans les bulles « ? » (texte simple, sans HTML) */
export const DROP_HELP = [
  'Ce sont des estimations, pas des chiffres officiels : The Pokémon Company ne publie pas ses taux de tirage.',
  'Nous partons des taux moyens relevés par la communauté (ouverture de milliers de boosters) pour chaque rareté et chaque époque, puis nous les divisons par le nombre de cartes de cette rareté dans l\'extension.',
  'Exemple : si une ultra rare sort environ 1 booster sur 15 et que l\'extension en compte 16, une ultra rare précise sort environ 1 booster sur 240.',
  'Les taux réels varient d\'une extension et d\'un lot à l\'autre. Les reverse holo et les Énergies ne sont pas comptés. Promos, decks et coffrets : « Hors booster ».',
];
