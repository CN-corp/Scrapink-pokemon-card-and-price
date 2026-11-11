# Pokédex Trader : le site public

Ce dossier contient tout le site : les pages (HTML, CSS, JavaScript), la base de données
(`supabase/schema.sql`), le paiement (`supabase/functions/`) et un mode démo.
Il n'y a rien à compiler. Le dossier se dépose tel quel chez un hébergeur.

Ce guide est écrit pour quelqu'un qui n'est pas développeur. Suivez les étapes dans l'ordre.
Comptez environ une heure la première fois.

---

## Ce qu'il vous faut

| Compte | À quoi il sert | Prix |
|---|---|---|
| **Netlify** (netlify.com) | héberger les pages du site | gratuit |
| **Supabase** (supabase.com) | comptes membres, base de données, sécurité | gratuit jusqu'à 50 000 membres actifs/mois |
| **Stripe** (stripe.com) | paiement de l'abonnement Pro | commission par paiement |

Il vous faut aussi un ordinateur avec un terminal (Mac : application « Terminal » ;
Windows : « PowerShell »). Il ne sert qu'à l'étape 6.

### Comment le site se protège

- Les membres gratuits ne peuvent pas lire les données Pro (analyses, signaux d'achat et de vente,
  courbe de performance du portefeuille), même en bidouillant leur navigateur. C'est la base de données
  qui refuse (règles « RLS »), pas seulement l'affichage.
- Un visiteur sans compte ne peut rien écrire : alertes, collection et wishlist demandent un compte.
- Les clés secrètes ne vont jamais dans les fichiers du site. Elles restent chez Supabase
  (« secrets »). Cela concerne la clé Stripe `sk_...`, le secret du webhook `whsec_...`
  et la clé Supabase `service_role`.
- Seule la clé Supabase **anon** va dans `assets/config.js`. Elle est publique par nature.

---

## Étape 1. Essayer le site en mode démo (2 minutes)

Ouvrez `preview.html` (dans ce dossier) avec votre navigateur, d'un double-clic.

C'est le site complet avec des données d'exemple. Aucune connexion n'est réelle.

Une barre « DÉMO » en bas de l'écran permet de passer d'un profil à l'autre :

- **Visiteur** : page d'accueil, Collections, catalogue, cotes et historique des cotes ;
- **Gratuit** : en plus, Mon espace, Pokédex (achats et ventes), Master sets, Wishlist, alertes de prix,
  gradation, et 5 cartes Pro offertes ;
- **Pro** : en plus, suivi du portefeuille (prix de revient, plus-values, performance), signaux
  d'achat et de vente, marché, classement, rapports ;
- **Modérateur** : indicateurs, membres, annonces, réglages, journal.

Le bouton ↺ remet la démo à zéro.

> Tant que `assets/config.js` n'est pas rempli, le site en ligne tourne lui aussi en mode démo.

### Ce que voit chacun

| | Visiteur | Compte gratuit | Pro |
|---|---|---|---|
| Collections, catalogue, fiches cartes | oui | oui | oui |
| Cotes et historique des cotes | oui | oui | oui |
| Pokédex : noter ses achats et ses ventes, valeur à la cote | — | oui | oui |
| Master sets, wishlist, alertes de prix, gradation | — | oui | oui |
| Stats Pro d'une carte (Poké Ball) | — | 5 cartes offertes | toutes |
| Prix de revient, plus-values réalisées et latentes, courbe de performance | — | — | oui |
| Signaux d'achat et de vente, zones d'achat et de revente, analyses | — | — | oui |
| Marché, classement, rapports | — | — | oui |

Sur la fiche carte, la Poké Ball reste visible ; sa légende « Stats Pro » n'apparaît qu'au survol ou
au focus clavier. Sur écran tactile, le premier toucher affiche la légende et le second ouvre la Poké Ball.

Ces règles sont aussi appliquées par la base (`supabase/schema.sql`). Si votre base date d'avant cette
répartition, **relancez le script une fois** (étape 4) : il ne perd aucune donnée.

---

## Étape 2. Mettre le site en ligne sur Netlify (5 minutes)

1. Créez un compte sur https://app.netlify.com.
2. Ouvrez **Sites** puis **Add new site** > **Deploy manually**.
3. Glissez-déposez **tout le dossier `site`** dans la zone prévue.
4. Netlify vous donne une adresse du type `https://nom-au-hasard.netlify.app`.
   Pour la changer : **Site configuration** > **Change site name**. Exemple : `pokedex-trader.netlify.app`.
   Pour un vrai nom de domaine : **Domain management**.
5. **Notez cette adresse.** Dans la suite, on l'appelle **ADRESSE_DU_SITE**, sans « / » à la fin.

Le site est en ligne, en mode démo pour l'instant.

Le fichier `_redirects` cache aux visiteurs les dossiers techniques (`supabase/`, `tools/`)
et ce README. Le fichier `_headers` ajoute quelques protections de sécurité.

---

## Étape 3. Créer le projet Supabase (5 minutes)

1. Créez un compte sur https://supabase.com, puis **New project**.
2. Remplissez :
   - **Name** : `pokedex-trader` ;
   - **Database Password** : un mot de passe fort, à garder dans votre gestionnaire de mots de passe ;
   - **Region** : **Europe (Paris)**, ou à défaut Frankfurt. Les données restent en Europe (RGPD).
3. Attendez environ 2 minutes que le projet soit prêt.
4. Ouvrez **Project Settings** > **API** et notez :
   - **Project URL**, par exemple `https://abcdefgh.supabase.co`. Les lettres `abcdefgh` sont la
     **référence du projet** ;
   - la clé **anon public** ;
   - la clé **service_role**. Elle est **secrète**, ne la partagez jamais.

---

## Étape 4. Créer la base de données (2 minutes)

1. Dans Supabase, ouvrez **SQL Editor** puis **New query**.
2. Ouvrez le fichier `supabase/schema.sql` avec un éditeur de texte (Bloc-notes, TextEdit…).
   Copiez **tout** son contenu et collez-le dans Supabase.
3. Cliquez sur **Run**. Le message attendu est « Success. No rows returned ».

Ce script peut être relancé sans danger, par exemple après une mise à jour du site.
Il ne supprime aucune donnée.

---

## Étape 5. Réglages de connexion (3 minutes)

Dans Supabase, ouvrez **Authentication** > **URL Configuration** :

- **Site URL** : `ADRESSE_DU_SITE`, par exemple `https://pokedex-trader.netlify.app` ;
- **Redirect URLs** : ajoutez `ADRESSE_DU_SITE/**`.

Ouvrez ensuite **Authentication** > **Sign In / Providers** > **Email** :

- laissez **Enable Email provider** et **Confirm email** activés.

**Conseillé avant l'ouverture au public.** Le service d'e-mails fourni par Supabase est limité à
quelques messages par heure. Pour envoyer les e-mails de confirmation, de lien magique et de mot
de passe oublié à grande échelle, branchez votre propre service d'envoi (Brevo, Resend, Postmark…)
dans **Authentication** > **Emails** > **SMTP Settings**. Dans **Emails** > **Templates**, vous
pouvez aussi traduire les modèles d'e-mails en français.

---

## Étape 6. Paiement Stripe (20 minutes)

Commencez en **mode test** : interrupteur « Test mode » en haut à droite du tableau de bord Stripe.
Rien n'y est réellement payé.

### 6a. Créer l'offre Pro

1. Ouvrez **Catalogue de produits** > **Ajouter un produit**.
2. **Nom** : `Pokédex Trader Pro`.
3. Créez le premier prix :
   - **Récurrent**, **5,99 €**, **Mensuel** ;
   - enregistrez, puis notez son identifiant `price_...` : c'est **PRIX_MOIS**.
4. Sur le même produit, **Ajouter un autre prix** :
   - **Récurrent**, **49 €**, **Annuel** ;
   - notez son identifiant `price_...` : c'est **PRIX_AN**.

Si vous choisissez d'autres montants, reportez-les aussi :

- dans le site, menu **Modération** > **Réglages**, une fois administrateur ;
- dans `assets/config.js`.

### 6b. Activer le portail client

Ouvrez **Paramètres** > **Facturation** > **Portail client**, puis **Activer**.

- Autorisez : annulation, mise à jour du moyen de paiement, historique des factures,
  changement de formule entre vos deux prix.
- Pour l'annulation, choisissez « **à la fin de la période de facturation** ».

### 6c. Noter la clé secrète

Ouvrez **Développeurs** > **Clés API** et notez la **clé secrète** `sk_test_...`.

### 6d. Installer les fonctions de paiement sur Supabase

Les commandes ci-dessous se tapent dans le terminal, **depuis le dossier `site`**.
Exemple : `cd chemin/vers/pokemon-trading/site`.

```bash
# 1. Installer l'outil Supabase (une seule fois)
#    Mac :     brew install supabase/tap/supabase
#    Windows : scoop install supabase   (ou voir https://supabase.com/docs/guides/cli)
supabase login
supabase link --project-ref abcdefgh        # votre référence de projet (étape 3)

# 2. Enregistrer les secrets (remplacez les valeurs)
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
supabase secrets set STRIPE_PRICE_MONTH=price_xxx_mois STRIPE_PRICE_YEAR=price_xxx_an
supabase secrets set SITE_URL=https://pokedex-trader.netlify.app

# 3. Envoyer les trois fonctions
supabase functions deploy create-checkout
supabase functions deploy customer-portal
supabase functions deploy stripe-webhook --no-verify-jwt
```

Les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies automatiquement aux
fonctions par Supabase. Vous n'avez pas à les saisir ici.

### 6e. Brancher le webhook (Stripe prévient le site quand quelqu'un paie ou résilie)

1. Dans Stripe, ouvrez **Développeurs** > **Webhooks** > **Ajouter une destination** (ou un endpoint).
2. **URL** : `https://abcdefgh.supabase.co/functions/v1/stripe-webhook`, avec votre référence de projet.
3. **Événements** : cochez exactement ces trois-là :
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Enregistrez, puis copiez le **secret de signature** `whsec_...`.
5. Dans le terminal :

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
```

---

## Étape 7. Relier le site à Supabase (3 minutes)

1. Ouvrez `assets/config.js` avec un éditeur de texte.
2. Remplissez les deux lignes suivantes, avec les valeurs notées à l'étape 3 :
   ```js
   SUPABASE_URL: 'https://abcdefgh.supabase.co',
   SUPABASE_ANON_KEY: 'eyJhbGciOi...la clé anon public...',
   ```
3. Changez aussi `CONTACT_EMAIL` pour votre adresse de contact.
4. Enregistrez.
5. Dans Netlify, ouvrez votre site > **Deploys**, puis glissez-déposez à nouveau tout le dossier `site`.

La barre « DÉMO » disparaît : le site est désormais réel.

---

## Étape 8. Devenir administrateur (1 minute)

1. Sur le site, **créez votre compte** avec « Créer un compte », puis confirmez l'e-mail reçu.
2. Dans Supabase, ouvrez **SQL Editor** > **New query**.
3. Collez cette ligne en mettant **votre** e-mail, puis cliquez sur **Run** :

```sql
update public.profiles set role = 'admin' where email = 'votre@email.fr';
```

Rechargez le site : le menu **Modération** apparaît. L'administrateur a tous les droits du
modérateur, et lui seul peut nommer ou retirer des modérateurs.

---

## Étape 9. Alimenter le site avec les cotes et analyses

Le catalogue, les cotes, les analyses et les historiques viennent de votre outil Pokédex Trader
habituel, avec la commande `publish-site`. Elle envoie les données vers Supabase.

1. Dans l'environnement où tourne la synchro quotidienne, ajoutez deux **variables d'environnement** :
   - `SUPABASE_URL` = `https://abcdefgh.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = la clé **service_role** de l'étape 3.

   Sur claude.ai, cela se fait dans les réglages de l'environnement cloud, rubrique « secrets »
   ou variables d'environnement.
2. La synchro quotidienne lance ensuite d'elle-même, à l'étape 4 bis de `SYNCHRO_EN_LIGNE.md` :
   ```bash
   python3 -m pokedex_trader publish-site
   ```
3. Le premier envoi transmet 365 jours d'historique. Ensuite, 30 jours suffisent.
4. Pour vérifier : `python3 -m pokedex_trader publish-site --dry-run` calcule tout sans rien envoyer.
5. Sans ces variables, la commande affiche un message et ne fait rien.
6. Chaque envoi apparaît dans **Modération** > **Données**, avec son état, son nombre de lignes et
   ses éventuelles erreurs.

---

## Étape 10. Tester un paiement (mode test Stripe)

1. Connectez-vous avec un compte **gratuit** (pas votre compte admin).
2. Allez dans **Mon espace** > **Abonnement**.
3. Cochez la case d'accès immédiat, puis cliquez sur « Choisir le mensuel ».
4. Sur la page Stripe, payez avec la carte de test `4242 4242 4242 4242`, une date future
   quelconque et le code `123`.
5. De retour sur le site, rechargez au bout de quelques secondes : le badge **PRO** apparaît.
6. Ensuite, « Gérer ou résilier » ouvre le portail Stripe, depuis lequel vous pouvez résilier.

**En cas de problème :**

- Dans Stripe, ouvrez **Webhooks** > votre destination > **Événements**. Une réponse 400 signifie
  presque toujours que le secret `whsec_` est faux.
- Dans Supabase, regardez **Edge Functions** > `stripe-webhook` > **Logs**.

### Passer en paiement réel

Quand tout fonctionne, désactivez le mode test dans Stripe, puis refaites :

1. les étapes **6a** à **6c** : produit et prix réels, portail, clé `sk_live_...` ;
2. l'étape **6e** : nouveau webhook réel, nouveau `whsec_...` ;
3. les commandes `supabase secrets set ...` avec les valeurs réelles.

Il n'est pas nécessaire de redéployer les fonctions.

---

## Étape 11. Avant d'ouvrir au public : obligations légales

Les pages **Mentions légales**, **CGV** et **Confidentialité** existent. Les passages surlignés
« **À COMPLÉTER** » sont à remplir, dans `assets/js/views/legal.js`. Il s'agit notamment de :

- votre identité ou celle de votre société, votre SIRET, votre adresse ;
- l'hébergeur ;
- le médiateur de la consommation (obligatoire pour vendre à des particuliers) ;
- la durée de conservation des données.

Faites-les relire par un professionnel.

Autres points :

- Le site charge ses polices depuis **Google Fonts**, ce qui transmet l'adresse IP des visiteurs à
  Google. Pour l'éviter, téléchargez les polices et servez-les depuis le site.
  C'est la ligne `fonts.googleapis.com` dans `index.html`.
- Le site n'utilise ni cookie publicitaire ni outil de mesure d'audience. Il ne stocke que la
  session de connexion et vos préférences (thème, filtres). Aucun bandeau cookies n'est donc requis
  en l'état.
- Le pied de page rappelle que le site n'est ni affilié ni approuvé par Nintendo, The Pokémon
  Company ou Creatures, et que les analyses ne sont pas des conseils en investissement.

---

## Utilisation au quotidien

- **Annonces** : **Modération** > **Annonces**. Elles s'affichent en bandeau sur tout le site,
  avec un niveau (information, attention…) et des dates de début et de fin facultatives.
- **Prix et mode maintenance** : **Modération** > **Réglages**. Toute modification est inscrite au
  **Journal**.
- **Offrir Pro à quelqu'un** : **Modération** > **Utilisateurs** > cliquez sur le membre >
  « Accorder Pro » avec une date de fin. L'accès offert n'est pas retiré si la personne avait aussi
  un abonnement Stripe qui se termine.
- **Suspendre un membre** : même fenêtre, « Suspendre ». Son compte passe en lecture seule et
  perd l'accès Pro.
- **Indicateurs** : **Modération** > **KPI** : membres, abonnés Pro, revenu mensuel estimé,
  conversion, résiliations, et le top 20 des membres par plus-value (pseudos uniquement).

## Communauté, vitrines et actualités

**Base de données** : ces fonctions s'appuient sur la section 15 de `supabase/schema.sql`
(colonnes de partage dans `profiles`, tables `portfolio_snapshots` et `news`, fonctions
`public_leaderboard`, `public_portfolio`, `snapshot_portfolios`) et sur la section 16 (découverte Pro). **Relancez ce script une fois**
(étape 4) après cette mise à jour : il ne perd aucune donnée.

- **Portefeuille partagé** : chaque membre l'active dans **Mon espace** > **Profil** > « Partage de mon
  portefeuille ». Désactivé par défaut. Sa vitrine (`#/membre/<lien>`) montre ses cartes et sa
  performance en pourcentage ; les montants en euros seulement s'il coche la seconde case. Un membre
  banni disparaît des vitrines et du classement. Le lien est aléatoire (pas l'e-mail, pas l'identifiant).
- **Communauté** (`#/communaute`) : classement des portefeuilles partagés, par performance
  (plus-values réalisées et latentes / capital investi), à partir de 20 € investis. **Réservé aux
  modérateurs** : le menu ne l'affiche qu'à l'équipe, et la base renvoie une liste vide à tous les autres.
  Les membres partagent leur vitrine eux-mêmes, en envoyant le lien.
- **Découverte Pro** (section 16 du script, table `pro_reveals`, fonctions `reveal_card` et
  `reveal_status`) : pour un compte gratuit, les données Pro d'une fiche carte sont remplacées par une
  Poké Ball au petit cadenas jaune. Un clic l'ouvre et dévoile toutes les stats Pro de la carte. Chaque
  compte gratuit a **5 cartes offertes** (réglage « Cartes Pro offertes » dans Modération > Réglages) ;
  une carte dévoilée le reste. Ensuite, la Poké Ball mène à la page d'abonnement. Un visiteur sans
  compte est envoyé vers l'inscription.
- **Performance de mon compte** (tableau de bord, Pro) : courbe de la performance et de la valeur. Elle se
  construit jour après jour : `publish-site` enregistre chaque matin une photo de chaque portefeuille.
- **Quand acheter, quand vendre** (fiche carte, Pro) : prix sous lequel acheter, objectif de revente et
  montant encaissé après frais, calculés à partir de la fourchette estimée à 30 jours. Même chose pour
  les cartes anglaises, japonaises et françaises.
- **Bandeau d'actualités** : sous l'en-tête, sur tout le site, et page `#/actus`. Il mélange les titres
  des flux RSS (PokéBeach et Google Actualités, relevés chaque matin par
  `python3 -m pokedex_trader news`), les sorties d'extensions des 75 derniers jours, les sorties à venir
  et l'opportunité du jour. **Modération** > **Actualités** pour ajouter une annonce, corriger ou masquer
  un titre. Seuls le titre et le lien sont repris : l'article s'ouvre sur le site de son auteur.
  Domaines à autoriser dans l'environnement de la synchro : `www.pokebeach.com`, `news.google.com`.

## La page Collections

C'est la porte d'entrée des nouveaux venus : menu **Collections**, et premier bouton de la page d'accueil.
Elle est **gratuite et sans compte**.

- **Toutes les collections** (`#/collections`) : une tuile par extension avec son logo (à défaut, l'illustration
  de sa carte la plus chère), son année, sa série, sa langue, son nombre de cartes et sa « carte phare » avec
  sa cote. Regroupées par série, les plus récentes d'abord ; recherche, filtres langue et série, tris.
  Les extensions de « À la une » sont celles du réglage **Modération** > **Réglages** > extensions à la une.
- **Une collection** (`#/collections/<identifiant>`) : en-tête (logo, année, nombre de cartes, valeur totale
  du set), puis toutes les cartes de la plus rare à la plus commune, regroupées par rareté (« Rares
  secrètes — environ 1 booster sur 45 »…). Chaque carte montre son illustration, son numéro, sa rareté, sa
  chance de tirage estimée et sa cote. Boutons : tri par rareté ou par prix, grille ou liste.
- Un clic sur une carte ouvre sa fiche. Pour tout le monde, elle affiche un bloc **Détail du prix** (cote,
  date, source, rareté, chance de tirage, rang de la carte par cote dans son extension) et une invitation
  **Voir cette carte côté Marché**. La cote et son historique sont publics. Pour un visiteur ou un membre
  gratuit, l'onglet Marché affiche l'offre Pro et les signaux restent masqués (la base ne les renvoie pas).

**Base de données** : la page lit la vue `set_overview` (nombre de cartes, valeur totale et carte la plus chère
de chaque extension). Elle est créée par `supabase/schema.sql` : **relancez ce script une fois** (étape 4)
après cette mise à jour. La vue ne lit que les tables publiques `sets` et `cards` (lisibles sans compte) ;
elle est en lecture seule et ne touche à aucune donnée Pro. Tant qu'elle n'existe pas, la page fonctionne
quand même, sans la carte phare.

### Les chances de tirage sont des estimations

The Pokémon Company ne publie pas ses taux de tirage. Le fichier `assets/js/pullrates.js` contient des
**moyennes arrondies des estimations de la communauté** (ouvertures de milliers de boosters), pour chaque
rareté et chaque époque : Écarlate et Violet, Méga-Évolution (provisoire), Épée et Bouclier (avec
Célébrations, Classic Collection, Galerie des dresseurs et la Galarian Gallery de Zénith Suprême),
Soleil et Lune, XY, Noir et Blanc, époques plus anciennes, et boosters japonais.

- Chance d'une carte précise = chance de tirer une carte de sa rareté dans un booster, divisée par le nombre
  de cartes de cette rareté dans l'extension. Exemple : une ultra rare sort environ 1 booster sur 15 ;
  s'il y en a 16 dans l'extension, une ultra rare précise sort environ 1 booster sur 240.
- Affichage : « 1 booster sur N », ou un pourcentage pour les communes et peu communes.
- Promos, decks, coffrets, kits, Énergies : « Hors booster ». Rareté absente des données : « Taux inconnu ».
- Le site les présente toujours comme des estimations, avec une bulle « ? » qui explique la méthode.
- Pour corriger un taux, modifiez le tableau de l'époque concernée en haut de `pullrates.js`
  (`1 / 45` = une carte de cette rareté tous les 45 boosters), puis reconstruisez `preview.html`.

## Mettre à jour le site

1. Modifiez les fichiers.
2. Glissez-déposez à nouveau le dossier `site` dans Netlify (**Deploys**).
3. Si `supabase/schema.sql` a changé, relancez-le dans **SQL Editor** (étape 4).
   Il ne perd aucune donnée.
4. Si une fonction a changé, relancez la commande `supabase functions deploy` correspondante.

## Pour les curieux : contenu du dossier

| Fichier | Rôle |
|---|---|
| `index.html` | la page du site (animation Poké Ball d'ouverture comprise) |
| `assets/styles.css` | l'apparence (thèmes clair et sombre, mobile) |
| `assets/config.js` | **les seuls réglages à remplir** (étape 7) |
| `assets/app.js`, `assets/js/` | le fonctionnement des pages |
| `assets/demo-data.json` | les données d'exemple du mode démo |
| `preview.html` | le site complet en un seul fichier, mode démo forcé (étape 1) |
| `supabase/schema.sql` | la base de données et ses règles de sécurité |
| `supabase/functions/` | paiement : Checkout, portail client, webhook |
| `supabase/config.toml` | réglage des fonctions (le webhook n'exige pas de connexion) |
| `tools/make_demo_data.py` | régénère `assets/demo-data.json` depuis votre base locale |
| `tools/build_preview.py` | reconstruit `preview.html` (voir ci-dessous) |
| `assets/js/views/collections.js` | la page **Collections** (extensions, cartes de la plus rare à la plus commune) |
| `assets/js/pullrates.js` | les **chances de tirage estimées** par époque et par rareté |

**Régénérer les données de démo** avec des cotes récentes, depuis le dossier `pokemon-trading` :

```bash
python3 site/tools/make_demo_data.py
```

**Reconstruire `preview.html`** après une modification du site, depuis le dossier `pokemon-trading` :

```bash
python3 site/tools/build_preview.py
```

Le script (Python seul, rien à installer) assemble `index.html`, le CSS, tous les modules JavaScript et les
données de démo en un seul fichier, en mode démo forcé. Il refuse de construire si deux fichiers JavaScript
déclarent le même nom (dans `preview.html`, tout le code partage une seule portée).

**Bibliothèques externes** : les versions sont figées et chargées depuis cdn.jsdelivr.net :

- `@supabase/supabase-js@2.45.4`, uniquement hors mode démo ;
- `chart.js@4.4.4`, pour les graphiques.
