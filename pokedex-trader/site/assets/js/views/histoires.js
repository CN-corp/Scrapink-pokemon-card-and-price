// Histoires : petits articles sur l'histoire de Pokémon et de ses cartes. Bloc d'accueil (storiesBlock),
// page d'un article avec navigation précédent / suivant (renderStory). Pour ajouter un article : une entrée dans ARTICLES.
import { $, esc, eur } from '../util.js';
import { S } from '../state.js';
import { frame, langTag } from '../ui.js';

const EXT_IC = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
const extLink = (href, txt) => `<a href="${esc(href)}" target="_blank" rel="noopener">${txt} ${EXT_IC}</a>`;

// Petits blocs visuels réutilisables dans les articles : cartes du catalogue, chiffres clés, frise
const fig = (ids, caption) => `<figure class="st-fig" data-ids="${ids.join(',')}"><div class="st-fig-row"></div>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
const facts = list => `<div class="st-facts">${list.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
const timeline = list => `<ol class="st-time">${list.map(([y, t]) => `<li><b>${y}</b><span>${t}</span></li>`).join('')}</ol>`;

export const ARTICLES = [{
  id: 'pikachu-illustrator',
  kicker: 'Cartes légendaires',
  title: 'Pikachu Illustrateur, la carte la plus chère du monde',
  date: '2026-10-22',
  read: 4,
  hue: 'gold',
  excerpt: 'Une carte qu\'on ne pouvait pas acheter : il fallait la gagner en dessinant. Comment un lot de concours de 1998 est devenu la carte vendue 16,49 millions de dollars.',
  cover: ['base1-58', 'cel25c-24_A', 'fr-base1-58'],
  body: () => `
    <p class="st-lead">En février 2026, une carte Pikachu s'est vendue 16 492 000 $ aux enchères. C'est le prix le plus élevé jamais payé pour une carte à collectionner, toutes catégories confondues. Pourtant, en 1998, cette carte ne coûtait rien : elle se gagnait avec un crayon.</p>
    ${facts([['1998', 'concours de dessin du magazine CoroCoro'], ['39', 'exemplaires le plus souvent cités'], ['16 492 000 $', 'vente record, février 2026']])}
    <h2>Une carte réservée aux artistes</h2>
    <p>Au Japon, en 1998, le magazine CoroCoro Comic organise des concours d'illustration pour les cartes Pokémon. Les gagnants reçoivent une carte unique en son genre : un Pikachu tenant des pinceaux, dessiné par Atsuko Nishida, la créatrice de Pikachu. À la place du mot « Dresseur », la carte porte la mention « Illustrateur » et un petit symbole de plume. Elle n'a jamais été vendue en booster.</p>
    <p>Le nombre d'exemplaires distribués n'est pas connu avec certitude : on cite le plus souvent 39 cartes, parfois 41.</p>
    ${fig(['base1-58', 'fr-base1-58', 'cel25c-24_A'], 'Le Pikachu Illustrateur n\'est pas dans notre catalogue. Ci-dessus, d\'autres Pikachu historiques : celui du Set de Base (1999), en anglais et en français, et la réédition « Classic Collection » des 25 ans.')}
    <h2>De 5 à 16 millions de dollars</h2>
    ${timeline([['1998', 'Les cartes sont remises aux gagnants des concours CoroCoro.'], ['2021', 'Le youtubeur Logan Paul achète l\'exemplaire noté PSA 10 pour 5 275 000 $, en échangeant un exemplaire PSA 9 et 4 millions de dollars.'], ['2022', 'Il entre sur le ring de WrestleMania avec la carte autour du cou.'], ['Févr. 2026', 'Il la revend chez Goldin Auctions : 16 492 000 $, record du monde enregistré par le Guinness.'], ['Sept. 2026', 'Un autre exemplaire, noté PSA 9, part à 5 000 000 $ chez Heritage Auctions.']])}
    <h2>Pourquoi elle vaut autant</h2>
    <p>Elle réunit tout ce qui fait la valeur d'une carte : une rareté extrême, une histoire (on ne pouvait que la gagner), l'œuvre de la créatrice du Pokémon le plus célèbre et, pour l'exemplaire de Logan Paul, la note parfaite de PSA. Les prix ci-dessus sont ceux des ventes, en dollars, la devise dans laquelle elles ont eu lieu.</p>
    <p class="st-src">Sources : ${extLink('https://www.guinnessworldrecords.com/world-records/452634-most-expensive-pokemon-trading-card-sold-at-auction', 'Guinness World Records')}, ${extLink('https://hypebeast.com/2026/2/logan-paul-pokemon-pikachu-illustrator-card-guinness-world-record-goldin-auctions-16-million-usd-sale', 'Hypebeast')}, ${extLink('https://tcgindex.org/en/guides/pikachu-illustrator-auction-records', 'TCGIndex')}, ${extLink('https://www.cardsnpacks.com/en/blog/pikachu-illustrator-record-16-millions/', 'Cards & Packs')}, ${extLink('https://en.wikipedia.org/wiki/Atsuko_Nishida', 'Wikipédia, Atsuko Nishida')}.</p>`,
}, {
  id: 'dracaufeu-set-de-base',
  kicker: 'Cartes légendaires',
  title: 'Le Dracaufeu du Set de Base, symbole de toute une génération',
  date: '2026-10-22',
  read: 4,
  hue: 'fire',
  excerpt: 'Carte n° 4 sur 102, holographique, dessinée par Mitsuhiro Arita : le Dracaufeu de 1999 est devenu la carte que tout le monde voulait dans la cour de récré, puis aux enchères.',
  cover: ['base1-4', 'fr-base1-4', 'base1-2'],
  body: () => `
    <p class="st-lead">Pour beaucoup de collectionneurs, tout commence avec lui. Le Dracaufeu holographique du Set de Base, sorti en anglais en janvier 1999 puis en français fin 1999, est la carte la plus emblématique de Pokémon.</p>
    ${fig(['base1-4', 'fr-base1-4'], 'Dracaufeu, Set de Base, n° 4/102, en anglais et en français. Illustration de Mitsuhiro Arita.')}
    <h2>La carte que tout le monde voulait</h2>
    <p>Dans le Set de Base, seules 16 cartes sont holographiques. Dracaufeu est la plus puissante : 120 PV et une attaque à 100 dégâts, énorme pour l'époque. Dans les cours de récréation, l'avoir dans son classeur faisait de vous une légende.</p>
    ${fig(['base1-2', 'base1-15', 'base1-14'], 'Ses voisins holographiques les plus recherchés : Tortank, Florizarre et Raichu.')}
    <h2>1ʳᵉ édition, « shadowless », illimitée : comment les reconnaître</h2>
    <ul class="st-works">
      <li><b>1ʳᵉ édition</b> : un petit tampon noir « Edition 1 » à gauche, sous l'illustration. Ce sont les tout premiers tirages.</li>
      <li><b>Shadowless</b> (« sans ombre ») : le cadre de l'illustration n'a pas d'ombre portée sur la droite. Ce sont des tirages anglais anciens, plus rares que la version courante.</li>
      <li><b>Illimitée</b> : la version la plus imprimée, avec ombre et sans tampon.</li>
    </ul>
    <h2>Des records en millions</h2>
    <p>Un Dracaufeu 1ʳᵉ édition noté PSA 10 s'est vendu 550 000 $ chez Heritage Auctions en décembre 2025, puis plusieurs exemplaires ont dépassé le million de dollars en 2026. PSA n'a donné la note parfaite qu'à une petite partie des Dracaufeu 1ʳᵉ édition qu'il a examinés, d'où ces prix.</p>
    <p>Bonne nouvelle pour les passionnés : la version illimitée, brute, reste accessible. Sa cote Cardmarket du jour s'affiche sous la carte anglaise ci-dessus. La cote de la version française n'est pas encore disponible : c'est un autre marché, avec ses propres prix.</p>
    <p class="st-src">Sources : ${extLink('https://www.thegamer.com/psa-10-first-edition-charizard-pokemon-card-record/', 'TheGamer')}, ${extLink('https://www.si.com/collectibles/world-record-charizard-headlines-top-pokemon-card-sales-of-march-2026', 'Sports Illustrated')}, ${extLink('https://vaultedcollection.com/blogs/vaulted-blog/charizard-pokemon-card', 'Vaulted Collection')}, ${extLink('https://api.pokemontcg.io/v2/cards/base1-4', 'pokemontcg.io')}.</p>`,
}, {
  id: 'mew-151',
  kicker: 'Histoire',
  title: 'Mew, le Pokémon n° 151 que personne ne devait trouver',
  date: '2026-10-22',
  read: 3,
  hue: 'psy',
  excerpt: '300 octets de mémoire libre, deux semaines avant la fin du développement : comment Mew s\'est glissé en secret dans les premiers jeux, puis dans les cartes.',
  cover: ['cel25-25', 'sv3pt5-205', 'fr-basep-8'],
  body: () => `
    <p class="st-lead">En 1996, les jeux Pokémon Rouge et Vert annoncent 150 Pokémon. Il y en a pourtant un 151ᵉ, caché dans la cartouche : Mew.</p>
    <h2>Ajouté en cachette</h2>
    <p>Le programmeur Shigeki Morimoto a ajouté Mew deux semaines avant la fin du développement, dans les quelque 300 octets de mémoire restés libres après le débogage. Même Nintendo n'était pas au courant au départ. Mew ne devait pas pouvoir être attrapé normalement.</p>
    ${facts([['151ᵉ', 'Pokémon des jeux Rouge et Vert'], ['≈ 300', 'octets libres pour l\'ajouter'], ['20', 'Mew offerts par CoroCoro en 1996']])}
    <h2>Le concours qui a lancé la folie</h2>
    <p>En avril 1996, le magazine CoroCoro dévoile Mew et propose à 20 lecteurs d'envoyer leur cartouche pour qu'on y ajoute le Pokémon secret. Plus de 78 000 joueurs se portent candidats. Les rumeurs de cour de récré font le reste : Mew caché sous le camion près de l'Océane, des astuces plus folles les unes que les autres.</p>
    <h2>Mew dans les cartes</h2>
    <p>Mew devient vite une star des cartes promo, puis des grandes extensions. En 2023, l'extension 151, consacrée aux Pokémon des premiers jeux, se termine logiquement par Mew-ex.</p>
    ${fig(['fr-basep-8', 'fr-basep-9', 'cel25-25', 'sv3pt5-151', 'sv3pt5-193', 'sv3pt5-205'], 'Mew à travers les époques : promos Wizards, Célébrations (25 ans), puis Mew-ex de 151 en Double rare, Ultra rare et Hyper rare.')}
    <p>Et l'histoire continue : trente ans après, Mew est encore le Pokémon secret des 30 ans, avec les trois cartes Mew RGB. Lisez notre article <a href="#/histoires/mew-rgb">Mew RGB</a>.</p>
    <p class="st-src">Sources : ${extLink('https://bulbapedia.bulbagarden.net/wiki/New_Pok%C3%A9mon', 'Bulbapedia')}, ${extLink('https://projectpokemon.org/home/profile/126278-julius_blaze/', 'Project Pokémon')}, ${extLink('https://bulbapedia.bulbagarden.net/wiki/Mew_(Pok%C3%A9mon)', 'Bulbapedia, Mew')}.</p>`,
}, {
  id: 'mitsuhiro-arita',
  kicker: 'Artistes',
  title: 'Mitsuhiro Arita, le peintre des premières cartes',
  date: '2026-10-22',
  read: 3,
  hue: 'paint',
  excerpt: 'Autodidacte, présent depuis les prototypes de 1996 et auteur de plus de 700 cartes : c\'est à lui qu\'on doit le Dracaufeu, le Florizarre et le Pikachu du Set de Base.',
  cover: ['base1-15', 'base1-4', 'base1-6'],
  body: () => `
    <p class="st-lead">Si vous avez ouvert des boosters en 1999, vous avez forcément tenu une carte de Mitsuhiro Arita entre vos mains.</p>
    <div class="st-artist"><div class="st-av" aria-hidden="true">有</div><div><b>Mitsuhiro Arita</b><span class="meta">Illustrateur indépendant · né le 12 janvier 1970, préfecture de Fukuoka</span></div></div>
    <h2>Là depuis le tout début</h2>
    <p>Arita dessine pour le jeu de cartes Pokémon depuis ses prototypes, avant même la sortie de Pokémon Rouge et Vert au Japon en 1996. Il n'a jamais été salarié de Creatures, le studio qui conçoit le jeu : il travaille en indépendant, depuis son atelier, et il a appris seul. Ses premières illustrations mêlent aquarelle ou pastel et contours marqués ; ses œuvres récentes jouent davantage sur la lumière et les couleurs vives.</p>
    ${facts([['1996', 'premières illustrations, dès les prototypes'], ['700+', 'cartes signées Arita (pokemontcg.io)'], ['4', 'cartes du Set de Base parmi les plus connues']])}
    <h2>Ses cartes du Set de Base</h2>
    <p>Dans le Set de Base, quatre de ses illustrations sont devenues cultes : Dracaufeu, Florizarre, Léviator et Pikachu.</p>
    ${fig(['base1-4', 'base1-15', 'base1-6', 'base1-58'], 'Dracaufeu, Florizarre, Léviator et Pikachu, Set de Base (anglais), illustrations de Mitsuhiro Arita.')}
    ${fig(['fr-base1-4', 'fr-base1-15', 'fr-base1-6', 'fr-base1-58'], 'Les mêmes cartes en français.')}
    <h2>Au-delà de Pokémon</h2>
    <p>Arita a aussi illustré des cartes pour Shin Megami Tensei, Monster Hunter ou Super Sentai, et des contenus pour Final Fantasy XI. Mais c'est son Dracaufeu de 1999 qui reste sa carte la plus célèbre, et l'une des plus recherchées de toute l'histoire du jeu.</p>
    <p class="st-src">Sources : ${extLink('https://www.pokemon.com/uk/pokemon-news/pokemon-creator-profile-mitsuhiro-arita', 'Pokémon (profil officiel)')}, ${extLink('https://www.hobbydb.com/marketplaces/hobbydb/subjects/mitsuhiro-arita-artist', 'hobbyDB')}, ${extLink('https://api.pokemontcg.io/v2/cards?q=artist:%22Mitsuhiro%20Arita%22', 'pokemontcg.io')}.</p>`,
}, {
  id: 'cartes-erreur',
  kicker: 'Curiosités',
  title: 'Les cartes « erreur » : quand une faute d\'impression vaut une fortune',
  date: '2026-10-22',
  read: 4,
  hue: 'glitch',
  excerpt: 'Un tampon au mauvais endroit, des dégâts oubliés, un dos de Magic : certaines erreurs d\'impression sont devenues des trésors. Petit guide pour les reconnaître, et se méfier des fausses.',
  cover: ['base1-14', 'base1-2', 'base1-12'],
  body: () => `
    <p class="st-lead">Des millions de cartes sortent des imprimeries sans un défaut. Celles qui en ont un sont parfois devenues parmi les plus recherchées du monde.</p>
    <h2>Le Raichu « Prerelease »</h2>
    <p>Lors de l'impression des cartes Mélodelfe « Prerelease » (avant-première), quelques Raichu du Set de Base ont reçu le même tampon par erreur. On estime qu'il en existe entre 8 et 11. Le seul exemplaire noté par PSA s'est vendu 550 000 $ chez Heritage Auctions fin 2025.</p>
    ${fig(['base1-14', 'fr-base1-14'], 'Raichu, Set de Base, version normale, en anglais et en français.')}
    <h2>Le Tortank au dos de Magic</h2>
    <p>Avant la sortie anglaise, Wizards of the Coast, l'éditeur de Magic: The Gathering, a imprimé des tests : un Tortank avec un dos de carte Magic. Cette pièce historique s'est vendue 216 000 $ en 2021.</p>
    ${fig(['base1-2', 'fr-base1-2'], 'Tortank, Set de Base, version normale.')}
    <h2>Les cartes « sans dégâts » et « sans stade »</h2>
    <p>Sur certains tirages, un chiffre a disparu : un Feunard sans les dégâts de son attaque (environ 4 900 $ d'après Cardlines), un Tortank sans la mention de son stade d'évolution (de 5 000 $ à plus de 20 000 $ selon l'état, d'après Misprint.com).</p>
    ${fig(['base1-12', 'fr-base1-12'], 'Feunard, Set de Base, version normale.')}
    <h2>Attention aux fausses erreurs</h2>
    <ul class="st-works">
      <li><b>Une faute d'orthographe</b> sur une carte est souvent le signe d'une contrefaçon, pas d'une erreur rare.</li>
      <li><b>Les cartes « shadowless »</b> ne sont pas des erreurs : ce sont les premiers tirages anglais, sans ombre à droite de l'illustration.</li>
      <li><b>Une erreur se prouve</b> : seule une carte authentifiée et notée par un organisme reconnu (PSA, PCA, CCC…) atteint ces prix.</li>
    </ul>
    <p>Les montants cités sont ceux des ventes publiées, en dollars américains, la devise dans laquelle elles ont eu lieu.</p>
    <p class="st-src">Sources : ${extLink('https://www.cardsnpacks.com/en/blog/cartes-pokemon-erreur-misprint/', 'Cards & Packs')}, ${extLink('https://cardlines.com/pokemon-error-cards/', 'Cardlines')}, ${extLink('https://www.misprint.com/posts/most-valuable-misprint-pokemon-cards', 'Misprint.com')}, ${extLink('https://www.thegamer.com/pokemon-tcg-error-cards/', 'TheGamer')}.</p>`,
}, {
  id: 'mimiqui',
  kicker: 'Lore',
  title: 'Mimiqui : le Pokémon qui voulait être aimé',
  date: '2026-10-22',
  read: 4,
  hue: 'ghost',
  excerpt: 'Un déguisement de Pikachu cousu à la main, une silhouette que personne ne doit voir et des entrées de Pokédex parmi les plus sombres de la série. Plongée dans le lore de Mimiqui.',
  cover: ['fr-sm8-226', 'fr-swsh9tg-TG17', 'fr-me02.5-238'],
  body: () => `
    <p class="st-lead">Apparu en 2016 dans Pokémon Soleil et Lune, Mimiqui est devenu en quelques années l'un des Pokémon les plus aimés des fans. Sous son air de peluche se cache pourtant l'une des histoires les plus étranges de l'univers Pokémon.</p>

    <h2>Un costume pour être aimé</h2>
    <p>Mimiqui est un Pokémon de type Spectre et Fée qui vit caché sous un vieux chiffon. Ce chiffon, il l'a lui-même façonné pour ressembler à Pikachu : les oreilles, les joues dessinées, la queue en zigzag. Selon le Pokédex, Mimiqui souffre de la solitude et sait que les humains adorent Pikachu. En se déguisant, il espère qu'on l'approche enfin avec la même tendresse.</p>
    <p>Le dessin du visage, tracé à la main et un peu de travers, fait partie du charme : c'est le costume d'un enfant qui imite ce qu'il admire.</p>

    <h2>Ce qu'il ne faut jamais voir</h2>
    <p>C'est là que le lore bascule. Personne ne sait à quoi ressemble Mimiqui sous son chiffon, et les entrées du Pokédex laissent entendre qu'il vaut mieux ne jamais le découvrir. Un chercheur qui a regardé sous le tissu serait mort de terreur. Un Dresseur qui a aperçu sa vraie forme à cause d'un coup de vent serait rentré chez lui et mort dans la nuit. Sur Galar, un scientifique qui a jeté un œil dessous aurait succombé à une mystérieuse maladie.</p>
    <p>Dans les jeux, seule une petite ombre et deux yeux brillants dépassent du bas du costume. Même ses attaques sortent de sous le tissu, sous la forme d'une griffe d'ombre.</p>

    <h2>Un costume qu'il répare toute la nuit</h2>
    <p>Son talent, Fantômasque, lui permet d'encaisser une première attaque sans dégât : c'est le costume qui prend le coup, et sa tête de Pikachu retombe sur le côté. Le Pokédex raconte ensuite que si son chiffon est abîmé ou que son cou se brise, Mimiqui passe la nuit entière à le recoudre devant un miroir, comme si sa vie en dépendait. Puis il cherche à se venger de celui qui l'a abîmé, de peur que sa véritable identité ait été révélée.</p>

    <h2>Une rivalité avec Pikachu</h2>
    <p>Dans le dessin animé Soleil et Lune, le Mimiqui de Jessie, de la Team Rocket, déteste Pikachu au point de l'attaquer dès qu'il le croise. Ce n'est pas la règle partout : d'autres histoires officielles montrent des Mimiqui tout à fait amicaux avec Pikachu. Une chose ne change pas : Mimiqui veut ressembler à Pikachu, pas le remplacer.</p>
    <p>Sa capacité Z exclusive, « Let's Snuggle Forever » dans la version anglaise, résume tout le personnage : un câlin affectueux… qui se termine en volée de coups dans un nuage de poussière.</p>

    <h2>Un des Pokémon préférés des fans</h2>
    <p>En 2020, lors du grand vote « Pokémon de l'année » organisé avec Google, Mimiqui a terminé troisième parmi tous les Pokémon, derrière Amphinobi et Lucario, et premier de la région d'Alola. Ce succès se voit aussi dans les cartes : de la Rare Arc-en-ciel de Tonnerre Perdu à la Galerie de Dresseurs de Stars Étincelantes, en passant par Mimiqui de la Team Rocket dans Héros Transcendants, chaque nouvelle version est attendue.</p>
    <p>La carte Mimiqui-GX de Tonnerre Perdu porte d'ailleurs bien son nom : son attaque GX s'appelle « Let's Snuggle & Fall » en anglais, un câlin qui fait tomber l'adversaire.</p>

    <h2>Ses cartes dans notre catalogue</h2>
    <div class="st-cards" id="st-cards"><div class="sub">Chargement des cartes…</div></div>
    <p><a href="#/catalogue?q=mimiqui">Voir toutes les cartes Mimiqui du catalogue</a></p>
    <p class="st-src">Sources : ${extLink('https://bulbapedia.bulbagarden.net/wiki/Mimikyu_(Pok%C3%A9mon)', 'Bulbapedia')}, ${extLink('https://en.wikipedia.org/wiki/Mimikyu', 'Wikipédia')}, ${extLink('https://pokemondb.net/pokedex/mimikyu', 'Pokémon Database')}, ${extLink('https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_of_the_Year', 'Pokémon de l\'année')}, ${extLink('https://bulbapedia.bulbagarden.net/wiki/Mimikyu-GX_(Lost_Thunder_226)', 'Mimiqui-GX')}.</p>`,
  cards: ['fr-sm8-226', 'fr-sm8-206', 'fr-sm8-149', 'fr-swsh9tg-TG17', 'fr-swsh9tg-TG16', 'fr-me02.5-238', 'fr-sm12-245', 'fr-sv04.5-160', 'fr-sv09-069', 'fr-swsh5-148'],
}, {
  id: 'mew-rgb',
  kicker: 'Cartes secrètes',
  title: 'Mew RGB : les trois cartes secrètes des 30 ans',
  date: '2026-10-22',
  read: 4,
  hue: 'rgb',
  excerpt: 'Un Mew rouge, un vert, un bleu, cachés dans 30th Celebration sans aucune annonce. L\'histoire de ces trois cartes et de YOSHIROTTEN, l\'artiste qui les a dessinées.',
  cover: ['me55-158', 'me55-157', 'fr-30th-158'],
  body: () => `
    <p class="st-lead">Pour les 30 ans de Pokémon, l'extension <a href="#/collections/me55">30th Celebration</a>, sortie le 16 septembre 2026, cachait trois cartes que personne n'avait annoncées : trois Mew, un rouge, un vert et un bleu, numérotés <b>R/RGB</b>, <b>G/RGB</b> et <b>B/RGB</b>.</p>
    <div class="rgb-trio" aria-label="Les trois versions de Mew RGB">
      <div class="rgb-c r"><b>R/RGB</b><span>Rouge</span></div><div class="rgb-c g"><b>G/RGB</b><span>Vert</span></div><div class="rgb-c b"><b>B/RGB</b><span>Bleu</span></div>
    </div>
    <p class="st-note">Nous n'avons pas encore d'image de ces trois cartes dans notre catalogue : les photos publiées par les collectionneurs sont visibles chez ${extLink('https://www.pokebeach.com/2026/09/mew-rgb-secret-rares-pulled-from-30th-celebration', 'PokeBeach')}.</p>

    <h2>Un clin d'œil à Rouge, Vert et Bleu</h2>
    <p>RGB, c'est Red, Green, Blue : les tout premiers jeux Pokémon sur Game Boy, Rouge et Vert au Japon en février 1996, puis Bleu. Le choix de Mew n'a rien d'un hasard. Dans ces jeux, Mew était déjà un secret : le programmeur Shigeki Morimoto l'avait glissé dans la cartouche au dernier moment, sans qu'il soit prévu qu'on puisse l'attraper. Trente ans plus tard, Mew redevient le Pokémon caché, cette fois dans les boosters.</p>

    <h2>Des cartes sorties avant d'exister officiellement</h2>
    <p>Le premier Mew bleu est apparu le 25 juillet 2026, ouvert en direct sur Whatnot dans un produit arrivé en avance. Beaucoup de collectionneurs ont crié au faux : pas de tampon des 30 ans, et aucune trace dans la liste des cartes qui avait fuité. Le 28 août, deux autres Mew bleus sont sortis chez deux vendeurs différents, et le doute a commencé à tomber.</p>
    <p>Mi-septembre, les trois cartes sont apparues dans une mise à jour interne de Pokémon TCG Live. Leur statut officiel reste flou : certains sites les disent confirmées, d'autres notent qu'elles ne figurent toujours pas dans la base officielle des cartes. The Pokémon Company ne les a pas présentées publiquement.</p>

    <h2>Quelle chance d'en tirer une ?</h2>
    <p>Personne ne le sait vraiment. Le chiffre d'une carte pour 20 000 boosters circule beaucoup, mais il vient d'une source anonyme et n'a jamais été vérifié ; The Pokémon Company ne publie pas ses taux de tirage. Au Japon, le jour de la sortie, des vendeurs en demandaient entre 580 000 ¥ et 868 000 ¥ sur SNKRDUNK : ce sont des prix demandés, pas des ventes conclues.</p>

    <h2>YOSHIROTTEN, l'artiste derrière Mew RGB</h2>
    <div class="st-artist">
      <div class="st-av" aria-hidden="true">Y</div>
      <div><b>YOSHIROTTEN</b> (Yoshi Nishi)<span class="meta">Artiste graphique et directeur artistique · Tokyo · né en 1983</span></div>
    </div>
    <p>Avant Pokémon, YOSHIROTTEN est connu dans l'art contemporain, la mode et la musique. Il dirige le studio de création YAR et a exposé à Tokyo, Londres et Berlin. Son univers mêle la culture urbaine et la nature, le numérique et la matière.</p>
    <ul class="st-works">
      <li><b>FUTURE NATURE</b> (2018) : sa grande exposition au TOLOT heuristic SHINONOME, à Tokyo, reprise en 2024 au musée d'art en plein air de Kirishima, dans sa région natale de Kagoshima.</li>
      <li><b>SUN</b> (depuis 2021) : 365 images numériques d'un soleil argenté, déclinées en tirages sur aluminium tous uniques, en disques, en livres et en installations, dont un monolithe de 2,8 m au festival Summer Sonic 2023.</li>
      <li><b>RGB</b> : le thème de sa prochaine exposition à Tokyo Node, « Communication with the Other Side / Beyond Earth », du 30 octobre 2026 au 11 janvier 2027, avec FUTURE NATURE et SUN.</li>
    </ul>
    <p>Ses premières cartes Pokémon sont les Rares futuristes de 30th Celebration : Mew ex et Mewtwo ex, des Énergies de base au même style (au Japon), puis deux promos Pikachu ex. On retrouve dans ces cartes son goût pour les reflets métalliques et les couleurs qui vibrent, comme dans SUN.</p>
    <div class="st-cards" id="st-cards"><div class="sub">Chargement des cartes…</div></div>

    <h2>Découvrir son travail</h2>
    <div class="st-links">
      <a class="st-link sun" href="https://yoshirotten.com/" target="_blank" rel="noopener"><span class="t">Site officiel</span><span class="d">yoshirotten.com : ses œuvres, SUN, FUTURE NATURE</span>${EXT_IC}</a>
      <a class="st-link expo" href="https://www.tokyoartbeat.com/en/events/-/Yoshirotten-Exhibition-Communication-with-the-Other-Side-Beyond-Earth/tokyo-node/2026-10-30" target="_blank" rel="noopener"><span class="t">Exposition à Tokyo</span><span class="d">Tokyo Node, du 30 octobre 2026 au 11 janvier 2027</span>${EXT_IC}</a>
      <a class="st-link nat" href="https://open-air-museum.org/en/?p=42630" target="_blank" rel="noopener"><span class="t">FUTURE NATURE II</span><span class="d">Musée d'art en plein air de Kirishima, 2024</span>${EXT_IC}</a>
      <a class="st-link cards" href="https://bulbapedia.bulbagarden.net/wiki/YOSHIROTTEN" target="_blank" rel="noopener"><span class="t">Toutes ses cartes</span><span class="d">La liste complète sur Bulbapedia</span>${EXT_IC}</a>
    </div>
    <p class="st-src">Sources : ${extLink('https://www.pokebeach.com/2026/09/mew-rgb-secret-rares-pulled-from-30th-celebration', 'PokeBeach')}, ${extLink('https://www.dexerto.com/pokemon/pokemons-mystery-rgb-mew-card-all-but-confirmed-after-three-whatnot-pulls-3403727/', 'Dexerto')}, ${extLink('https://samuraiswordtokyo.com/blogs/news/rgb-mew-cards-explained-r-rgb-g-rgb-b-rgb-30th-celebration', 'Samurai Sword Tokyo')}, ${extLink('https://bulbapedia.bulbagarden.net/wiki/YOSHIROTTEN', 'Bulbapedia')}, ${extLink('https://www.shashasha.co/en/artist/yoshirotten', 'shashasha')}.</p>`,
  cards: ['me55-158', 'me55-157', 'fr-30th-158', 'fr-30th-157', 'jp-716932', 'jp-716931', 'jp-716952', 'jp-716944', 'jp-716953', 'jp-716948'],
}];

const fdateLong = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const coverHTML = async a => {
  const cs = await S.api.cardsByIds(a.cover).catch(() => []);
  return `<div class="st-cover ${a.hue}" aria-hidden="true">${cs.map((c, i) => `<div class="stc n${i}">${frame(c)}</div>`).join('')}</div>`;
};
const storyTile = (a, cover, big) => `<a class="st-tile ${a.hue}${big ? ' big' : ''}" href="#/histoires/${a.id}">${cover}
  <div class="st-txt"><span class="st-kicker">${esc(a.kicker)}</span><h3>${esc(a.title)}</h3><p>${esc(a.excerpt)}</p>
  <span class="meta">${fdateLong(a.date)} · ${a.read} min de lecture</span><span class="st-more">Lire l'histoire →</span></div></a>`;

/** Bloc d'accueil : le dernier article en grand, les autres en liste */
export async function storiesBlock(box) {
  if (!box || !ARTICLES.length) return;
  const [first, ...rest] = ARTICLES;
  box.innerHTML = `<div class="head"><div><h2 id="st-title" class="fancy">Histoires de cartes</h2><div class="sub">L'histoire de Pokémon et de ses cartes, un article à la fois.</div></div>
    ${ARTICLES.length > 1 ? '<a class="btn" href="#/histoires">Tous les articles</a>' : ''}</div>
    ${storyTile(first, await coverHTML(first), true)}
    ${rest.length ? `<div class="st-list">${(await Promise.all(rest.slice(0, 4).map(async a => storyTile(a, await coverHTML(a))))).join('')}</div>` : ''}`;
}

/** #/histoires (liste) et #/histoires/<id> (article) */
export async function renderStory(el, p, id) {
  const i = ARTICLES.findIndex(a => a.id === id);
  if (!id || i < 0) {
    el.innerHTML = `<div class="section-title"><h1 class="fancy">Histoires de cartes</h1><p>L'histoire de Pokémon et de ses cartes, un article à la fois.</p></div><div class="st-all" id="st-all"></div>`;
    $('#st-all').innerHTML = (await Promise.all(ARTICLES.map(async a => storyTile(a, await coverHTML(a))))).join('');
    return;
  }
  const a = ARTICLES[i], prev = ARTICLES[i + 1], next = ARTICLES[i - 1]; // la liste va du plus récent au plus ancien
  document.title = a.title + ' · Pokédex Trader';
  el.innerHTML = `<article class="story">
    <nav class="st-crumbs"><a href="#/">Accueil</a> › <a href="#/histoires">Histoires de cartes</a></nav>
    <header class="st-hero ${a.hue}">${await coverHTML(a)}<div><span class="st-kicker">${esc(a.kicker)}</span><h1>${esc(a.title)}</h1><span class="meta">${fdateLong(a.date)} · ${a.read} min de lecture</span></div></header>
    <div class="st-body">${a.body()}</div>
    <nav class="st-nav" aria-label="Autres articles">
      ${prev ? `<a class="prev" href="#/histoires/${prev.id}"><span class="meta">← Article précédent</span><b>${esc(prev.title)}</b></a>` : '<span></span>'}
      <a class="all" href="#/histoires">Tous les articles</a>
      ${next ? `<a class="next" href="#/histoires/${next.id}"><span class="meta">Article suivant →</span><b>${esc(next.title)}</b></a>` : '<span></span>'}
    </nav></article>`;
  // figures : cartes du catalogue citées dans le texte, avec la cote du jour quand la carte en a une
  for (const f of el.querySelectorAll('.st-fig[data-ids]')) {
    const cs = await S.api.cardsByIds(f.dataset.ids.split(',')).catch(() => []);
    f.querySelector('.st-fig-row').innerHTML = cs.map(c => `<button class="st-fc" type="button" data-card="${esc(c.id)}">${frame(c)}<span class="st-nm">${esc(c.name)}${langTag(c.lang)}</span>${c.price != null ? `<span class="meta">cote ${eur(c.price)}</span>` : ''}</button>`).join('');
  }
  const box = $('#st-cards');
  if (box && a.cards) {
    const cs = await S.api.cardsByIds(a.cards).catch(() => []);
    box.innerHTML = cs.length ? cs.map(c => `<button class="star" type="button" data-card="${esc(c.id)}">${frame(c)}<span class="st-nm">${esc(c.name)}${langTag(c.lang)}</span><span class="meta">${esc(c.set_name || '')}</span></button>`).join('') : '';
  }
}
