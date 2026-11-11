# Pokédex Trader sur le NAS UGREEN (UGOS Pro)

Projet Docker autonome : le site public (dossier `site/`), servi par nginx, et en option
un tunnel Cloudflare pour le publier en HTTPS sans ouvrir de port sur la box.
Testé le 2026-10-19 : site affiché, fichiers techniques bloqués (404), conteneur « healthy ».

## Contenu
| Élément | Rôle |
|---|---|
| `docker-compose.yml` | les deux services : `web` (nginx) et `tunnel` (Cloudflare, optionnel) |
| `nginx/` | réglages du serveur web (en-têtes de sécurité, cache, fichiers bloqués) |
| `../site/` | les pages du site, montées en lecture seule (nginx bloque `supabase/`, `README.md`, `_headers`, `_redirects`) |
| `.env.example` | modèle de réglages : à copier en `.env` |

## Installation (à côté du Jardin des Promesses)
1. Copier tout le dossier de l'export sur le NAS (au moins `nas/` et `site/` côte à côte), par exemple dans `docker/pokedex-trader`.
2. Copier `.env.example` en `.env`. Changer `WEB_PORT` si 8088 est déjà pris.
3. UGOS Pro > **Docker** > **Projet** > **Créer** : nom `pokedex-trader`, chemin = le sous-dossier `nas/`,
   il reprend `docker-compose.yml`. Démarrer.
4. Vérifier en local : `http://IP-DU-NAS:8088`.
5. Mise en ligne, au choix :
   - même méthode que Le Jardin des Promesses (reverse proxy du NAS ou tunnel existant) vers le port `WEB_PORT` ;
   - ou tunnel dédié : créer un tunnel dans Cloudflare Zero Trust, coller son jeton dans `.env`
     (`CLOUDFLARE_TUNNEL_TOKEN`), y faire pointer le domaine vers `http://web:80`, puis lancer
     `docker compose --profile tunnel up -d`.

## Mettre à jour le site
Remplacer le contenu de `../site/` par la nouvelle version. Pas besoin de redémarrer : nginx sert les fichiers directement.
Après la création de Supabase, `site/assets/config.js` doit contenir l'URL et la clé « anon ».
