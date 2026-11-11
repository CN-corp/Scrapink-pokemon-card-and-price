# Synchro quotidienne de la page en ligne (procédure suivie par Claude)

Page : https://claude.ai/artifact/STnC1qWDfn98X5cJAi1tH1 (base de données de l'artifact)
Code : /mnt/project-files/pokemon-trading (lancer les commandes depuis ce dossier)
Base SQLite persistante : /mnt/project-files/pokemon-trading/data/pokemon_trading.db

1. Télécharger les saisies de la page (ArtifactData `list`, `out_dir` = /tmp/ptrader/in, `query.limit` 1000,
   paginer avec `next_cursor` s'il y en a) pour les collections `transactions`, `targets` et `observed`
   (prix français constatés).
2. `python3 -m pokedex_trader cloud-import /tmp/ptrader/in`
RÈGLE : les étapes qui écrivent dans la base (2, 3, 3 bis, 3 ter) se lancent STRICTEMENT l'une après l'autre,
jamais deux en même temps (deux écritures simultanées ont corrompu la base le 23/10/2026).
3. Cotes du jour et catalogue complet (TCGdex, guide de prix officiel Cardmarket en euros ; domaine api.tcgdex.net) :
   `python3 -m pokedex_trader cotes --budget 4800` lancé en arrière-plan (Bash `run_in_background`,
   `timeout` 5400000), puis attendre sa fin (~25 à 30 min pour ~600 extensions EN, JP et FR). Relancée le même jour
   après un arrêt au budget, elle ne refait que les extensions restantes (data/cotes_progress.json).
   Ensuite `python3 -m pokedex_trader qualite` : noter dans le compte rendu le nombre de cartes cotées par langue et
   combien ont une cote de moins de 3 jours. Si api.tcgdex.net est refusé, le noter et continuer.
   Guide de prix officiel Cardmarket (domaine downloads.s3.cardmarket.com) : `python3 -m pokedex_trader guide`.
   Tout ou rien : un fichier illisible, tronqué ou plus ancien que la base est refusé et rien n'est écrit.
   Si le domaine est refusé, le noter et continuer (les cotes TCGdex de l'étape 3 restent en place).
   Puis `python3 -m pokedex_trader controle` (contrôle de complétude). Code de sortie 1 = des cartes reliées
   à Cardmarket n'ont pas la cote du dernier guide, ou la dernière synchro n'est pas complète : relancer UNE fois
   `cotes --budget 4800` (elle ne refait que les extensions manquantes), puis `controle` de nouveau. Noter dans
   le compte rendu les chiffres « en_retard », « orphelines » et « sans_cote » par langue, et le résultat final.
   L'ancienne synchro pokemontcg.io (`sync`) n'est plus lancée chaque jour : ses prix Cardmarket étaient périmés
   (relevés de 2025 à juillet 2026) ; elle reste disponible à la main.
3 bis. Prix TCGplayer du jour et cartes japonaises (tcgcsv.com, domaine tcgcsv.com requis) :
   - le lundi, ou si `data/history_progress.json` n'existe pas : `python3 -m pokedex_trader history map`
     (relie les cartes aux produits TCGplayer, crée les cartes japonaises ; ~700 requêtes, quelques minutes) ;
   - chaque jour, une fois l'étape 3 terminée : `python3 -m pokedex_trader history load --budget 2400` en arrière-plan (Bash
     `run_in_background`, `timeout` 3000000), puis attendre sa fin. Il relève une fois par jour le
     fichier de prix de chaque extension (~600 requêtes) ; relancé le même jour, il ne refait que les
     extensions manquantes. Ne pas le lancer plusieurs fois pour rien : tcgcsv.com demande de ne pas
     redemander le même fichier dans les 24 h. Les archives quotidiennes de tcgcsv ont été retirées en
     octobre 2026 (HTTP 403) : ne pas essayer de les télécharger.
   Si tcgcsv.com est refusé, le noter et continuer.
3 ter. Cartes françaises : le catalogue FR est complété chaque jour par l'étape 3. Le lundi, lancer
   `python3 -m pokedex_trader cartes-fr` (relie les cartes FR aux cartes EN pour la rareté ; api.tcgdex.net),
   puis `python3 -m pokedex_trader images-fr` : scans Poképédia pour les cartes FR que
   TCGdex n'illustre pas (www.pokepedia.fr ; s'il répond « injoignable », le noter et continuer).
4. `rm -rf /tmp/ptrader/out && python3 -m pokedex_trader cloud-export /tmp/ptrader/out`
4 bis. Site public (site/README.md) : seulement si la variable SUPABASE_URL est définie,
   `python3 -m pokedex_trader publish-site` (sans variables il ne fait rien ; en cas d'erreur, le noter et continuer).
   Puis `python3 -m pokedex_trader news` (actualités du bandeau ; domaines www.pokebeach.com et news.google.com ;
   un flux refusé est sauté, le noter et continuer).
5. ArtifactData `list` de la collection `app` (sans out_dir) pour relever la version de chaque document ;
   écrire {doc_id: version} dans /tmp/ptrader/versions.json.
6. `python3 -m pokedex_trader cloud-batches /tmp/ptrader/out/manifest.json --versions /tmp/ptrader/versions.json`
   puis envoyer chaque lot tel quel avec ArtifactData `batch` (`writes` = le lot).
   Si un lot échoue sur une version, relire la collection `app` et refaire ce lot.
7. Illustrations : ArtifactData `get` du document app/images (s'il existe) -> /tmp/ptrader/images.json
   (le corps du document, ex. {"images": {...}}), puis
   `python3 -m pip install -q pillow` (si absent) et
   `python3 -m pokedex_trader cloud-images <SCRATCHPAD>/img --deja /tmp/ptrader/images.json`
   où <SCRATCHPAD> est le dossier scratchpad de la session (l'envoi d'assets refuse les fichiers hors
   du dossier de travail et du scratchpad, /tmp/ptrader ne convient donc pas pour les images).
   (domaines images.pokemontcg.io, tcgplayer-cdn.tcgplayer.com pour les cartes japonaises et
   assets.tcgdex.net pour les françaises ;
   une image refusée est simplement sautée).
   Pour chaque groupe de <SCRATCHPAD>/img/images_todo.json : Artifact `publish` avec `url` de la page,
   `asset: true`, `file_paths` = les fichiers du groupe. Associer chaque fichier à l'`url` renvoyée (de la forme "/_blob/<id>"),
   puis ArtifactData `update` (ou `set` à la création) du document app/images avec
   {"images": {card_id: url, ...}} (fusion : ne jamais retirer les images déjà présentes).
8. Le 1er du mois : exporter aussi `python3 -m pokedex_trader rapport <mois précédent>` (fichier dans reports/).

Ne jamais modifier les collections `transactions`, `targets`, `observed`, `graded` ni `settings` : ce sont les saisies de l'utilisateur.
