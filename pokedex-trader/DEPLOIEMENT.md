# Pokédex Trader : guide de déploiement (pour le développeur)

Export préparé le 11/11/2026. Ce dossier contient tout le code nécessaire, sans base de données,
sans secrets, sans sauvegardes ni caches.

## 1. Architecture

```
            ┌──────────────────────────┐   cron quotidien   ┌──────────────────────────────┐
 APIs  ───▶ │ moteur/ (Python, SQLite) │ ─ publish-site ──▶ │ Supabase (Postgres + Auth +  │
 publiques  │ cotes, analyse, history  │   (service_role)   │ RLS + Edge Functions Stripe) │
            └──────────────────────────┘                    └──────────────┬───────────────┘
                                                                           │ clé anon (publique)
                                         ┌─────────────────────────────────▼─────────────┐
                                         │ site/ : site statique (HTML/JS, aucun build)  │
                                         │ Netlify, Cloudflare Pages, ou NAS Docker      │
                                         └───────────────────────────────────────────────┘
                                                        ▲ Stripe Checkout / portail / webhook
```

| Dossier | Contenu |
|---|---|
| `site/` | le site public : `index.html`, `assets/` (JS en modules ES, pas de build), `_headers` / `_redirects` (Netlify) |
| `site/supabase/` | `schema.sql` (tables, RLS, fonctions ; idempotent), Edge Functions Stripe, `config.toml` |
| `site/README.md` | guide pas à pas très détaillé (Supabase, Stripe, légal) : **la référence pour chaque clic** |
| `moteur/` | le moteur Python (bibliothèque standard uniquement) qui récupère les cotes, calcule l'analyse et publie vers Supabase |
| `moteur/README.md` | doc du moteur et de sa ligne de commande |
| `moteur/SYNCHRO_EN_LIGNE.md` | procédure quotidienne actuelle (pour info : elle alimente aussi une page interne claude.ai, étapes 1, 2, 4 à 7 inutiles pour le site) |
| `nas/` | option d'hébergement sur le NAS UGREEN : nginx + tunnel Cloudflare facultatif (voir `nas/LISEZMOI.md`) |

Le site tourne en **mode démo** tant que `site/assets/config.js` est vide (données d'exemple,
barre « DÉMO » pour changer de rôle). Pratique pour vérifier l'hébergement avant de brancher Supabase.

## 2. Ordre de déploiement

1. **Hébergement statique** du dossier `site/` (Netlify en glisser-déposer, Cloudflare Pages,
   ou le NAS : `cd nas && cp .env.example .env && docker compose up -d`, le compose monte `../site`).
   Vérifier que le mode démo s'affiche. Les dossiers `supabase/`, `README.md`, `_headers`,
   `_redirects` ne doivent pas être servis (déjà bloqués par `_redirects` sur Netlify et par nginx sur le NAS ;
   sur un autre hébergeur, les exclure).
2. **Supabase** : créer le projet (région Paris ou Frankfurt), exécuter `site/supabase/schema.sql`
   dans le SQL Editor, régler Auth (Site URL + Redirect URLs `https://DOMAINE/**`, e-mail confirmé,
   SMTP perso conseillé). Détails : `site/README.md` étapes 3 à 5.
3. **Stripe** : produit « Pro » avec deux prix récurrents (5,99 €/mois et 49 €/an, ils doivent
   correspondre à `PRICE_MONTH` / `PRICE_YEAR` de `config.js`), portail client activé.
   Edge Functions depuis `site/` :
   ```bash
   supabase login && supabase link --project-ref <ref>
   supabase secrets set STRIPE_SECRET_KEY=sk_... STRIPE_PRICE_MONTH=price_... STRIPE_PRICE_YEAR=price_... SITE_URL=https://DOMAINE
   supabase functions deploy create-checkout
   supabase functions deploy customer-portal
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
   Webhook Stripe vers `https://<ref>.supabase.co/functions/v1/stripe-webhook`, événements
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`,
   puis `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`. Détails : étape 6.
4. **Relier le site** : remplir `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `CONTACT_EMAIL` dans
   `site/assets/config.js`, redéployer. La barre « DÉMO » disparaît.
5. **Compte admin** : créer un compte sur le site, puis
   `update public.profiles set role = 'admin' where email = '...';`
6. **Moteur + cron** (section 3), puis premier `publish-site` (envoie 365 jours d'historique ; ensuite 30).
7. **Test de paiement** en mode test Stripe (carte 4242…), puis bascule en clés live (étape 10).
8. **Légal** avant ouverture : compléter les « À COMPLÉTER » de `site/assets/js/views/legal.js`
   (identité, SIRET, hébergeur, médiateur…), étape 11.

## 3. Le moteur Python et la synchro quotidienne

Prérequis : Python 3.9+, rien à installer (`pip install pillow` seulement pour `cloud-images`,
inutile pour le site). Une machine qui tourne en continu : VPS, NAS (conteneur `python:3.12-slim`),
ou tâche planifiée. Base SQLite sur un **disque persistant** (`PTRADER_DB`), ~130 Mo aujourd'hui.

```bash
cd moteur
cp .env.example .env    # remplir SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
set -a; . ./.env; set +a
python3 -m pokedex_trader init                     # une seule fois
```

Script quotidien (vers 7 h, heure de Paris). **Les commandes qui écrivent dans la base se lancent
strictement l'une après l'autre**, jamais en parallèle (deux écritures simultanées ont déjà corrompu la base) :

```bash
#!/bin/sh
cd /chemin/moteur && set -a && . ./.env && set +a
python3 -m pokedex_trader cotes --budget 4800       # catalogue EN/JP/FR + cotes Cardmarket € (TCGdex), ~30 min, reprend où il s'est arrêté
python3 -m pokedex_trader guide                     # guide de prix officiel Cardmarket (tout ou rien)
python3 -m pokedex_trader controle || python3 -m pokedex_trader cotes --budget 4800   # code 1 = cotes manquantes : 1 relance
# le lundi (ou si data/history_progress.json n'existe pas) :
[ "$(date +%u)" = 1 ] && python3 -m pokedex_trader history map && python3 -m pokedex_trader cartes-fr && python3 -m pokedex_trader images-fr
python3 -m pokedex_trader history load --budget 2400   # prix TCGplayer du jour (USD), 1 fois / 24 h max (demande de tcgcsv.com)
python3 -m pokedex_trader publish-site              # envoi vers Supabase (sans variables : ne fait rien, code 0)
python3 -m pokedex_trader news                      # actualités du bandeau
```

Contrôles utiles : `python3 -m pokedex_trader qualite` (cartes cotées et fraîcheur par langue),
`python3 -m pokedex_trader publish-site --dry-run` (calcule sans envoyer). Chaque envoi est visible
dans le site, menu **Modération > Données**.

Domaines sortants nécessaires : `api.tcgdex.net`, `assets.tcgdex.net`, `downloads.s3.cardmarket.com`,
`tcgcsv.com`, `www.pokepedia.fr`, `www.pokebeach.com`, `news.google.com`, et `<ref>.supabase.co`.
Ne pas retenter les archives quotidiennes de tcgcsv (retirées en octobre 2026, HTTP 403).

## 4. Variables et secrets

| Où | Nom | Secret ? | Rôle |
|---|---|---|---|
| `site/assets/config.js` | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | non (publiques) | connexion du site à Supabase |
| `site/assets/config.js` | `PRICE_MONTH`, `PRICE_YEAR`, `CONTACT_EMAIL`, `FORCE_DEMO` | non | affichage |
| Supabase secrets (Edge Functions) | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTH`, `STRIPE_PRICE_YEAR`, `SITE_URL`, `STRIPE_WEBHOOK_SECRET` | **oui** | paiement (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` sont fournis d'office aux fonctions) |
| moteur `.env` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **oui** (service_role) | `publish-site` |
| moteur `.env` | `PTRADER_*` (voir `moteur/.env.example`) | non | seuils et chemins |
| `nas/.env` | `WEB_PORT`, `CLOUDFLARE_TUNNEL_TOKEN` | **oui** (jeton) | hébergement NAS |

Jamais de `service_role`, `sk_...` ou `whsec_...` dans `site/` ni dans git.

## 5. Règles métier à ne pas casser

- **Aucune conversion de devises, nulle part.** Chaque marché garde sa cote et sa devise :
  Cardmarket en €, TCGplayer en $ (stocké `currency = 'USD'`), jamais d'équivalent converti affiché
  ni de cote € calculée depuis des dollars. C'est une exigence ferme du propriétaire.
- Une carte FR ou JP ne reprend jamais la cote d'une carte EN (sauf `PTRADER_FR_CARDMARKET=1`,
  affichée explicitement « Cardmarket · toutes langues »). Sans cote, le site affiche « cote pas encore disponible ».
- L'analyse publiée est neutre : les transactions personnelles de la base locale ne sont jamais envoyées.

## 6. Ce qui n'est pas dans l'export (volontairement)

- `data/pokemon_trading.db` (~130 Mo) : la base de production, avec l'historique des cotes depuis
  le 22/10/2026 **et les transactions personnelles de Corentin**. Sans elle, `cotes` reconstruit le
  catalogue et la cote du jour en ~30 min, mais l'historique repart de zéro. À demander à Corentin
  si vous voulez reprendre l'historique (transfert privé, pas dans git).
- Sauvegardes, caches `__pycache__`, `preview.html` (aperçu monofichier pour claude.ai), outils de
  génération de l'aperçu, ancienne copie du site dans `nas/` (le compose monte désormais `../site`).

## 7. Points d'attention

- Le site et les fonctions Stripe n'ont **pas encore été testés contre un vrai projet Supabase / Stripe** :
  prévoir un passage complet en mode test (inscription, e-mail, achat Pro, résiliation via le portail).
- Les illustrations des cartes sont chargées depuis des CDN tiers (`images.pokemontcg.io`,
  `assets.tcgdex.net`, `tcgplayer-cdn.tcgplayer.com`, `images.scrydex.com`) : à surveiller (disponibilité, droits).
- Polices Google Fonts (IP des visiteurs transmise à Google) : à auto-héberger si besoin RGPD.
- Risques juridiques connus : redistribution des cotes, images des cartes, nom « Pokédex ».
- Après toute modification de `schema.sql`, le relancer dans le SQL Editor (aucune perte de données).
