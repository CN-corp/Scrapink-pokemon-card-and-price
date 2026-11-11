// Pages légales : modèles à compléter par l'éditeur du site (repères « À COMPLÉTER »).
import { CONFIG } from '../../config.js';

const T = s => `<span class="todo">À COMPLÉTER : ${s}</span>`;
const banner = `<div class="notice l-warning" role="note"><div><b>Page à compléter avant l'ouverture au public</b><p>Ce texte est un modèle. Remplacez chaque repère <span class="todo">À COMPLÉTER</span> par vos informations, et faites-le relire si besoin (avocat, service juridique, ou modèles officiels de la CNIL et de la DGCCRF).</p></div></div>`;

const PAGES = {
  'mentions-legales': ['Mentions légales', `
    <h2>Éditeur du site</h2>
    <p>Pokédex Trader est édité par ${T('nom et prénom, ou raison sociale')}, ${T('statut : micro-entreprise, SAS…')}, ${T('adresse postale')}, ${T('numéro SIRET / RCS')}, ${T('numéro de TVA intracommunautaire, le cas échéant')}.</p>
    <p>Contact : <a href="mailto:${CONFIG.CONTACT_EMAIL}">${CONFIG.CONTACT_EMAIL}</a>. Directeur de la publication : ${T('nom')}.</p>
    <h2>Hébergement</h2>
    <p>Site : ${T('hébergeur choisi, ex. Netlify, Inc., 512 2nd Street, Suite 200, San Francisco, CA 94107, États-Unis')}.<br>
    Base de données et comptes : Supabase, Inc. (région ${T('région du projet, ex. Europe / Francfort')}).<br>Paiements : Stripe Payments Europe, Ltd., Dublin, Irlande.</p>
    <h2>Propriété intellectuelle</h2>
    <p>Pokémon et les noms, images et illustrations des cartes sont des marques et créations de Nintendo, Creatures Inc., GAME FREAK inc. et The Pokémon Company. Pokédex Trader n'est ni affilié, ni soutenu, ni sponsorisé par ces sociétés, ni par Cardmarket ou TCGplayer. Les illustrations sont affichées à titre d'identification des cartes. Données de cartes et de prix : pokemontcg.io, Cardmarket, TCGplayer, TCGdex.</p>
    <h2>Avertissement</h2>
    <p>Les cotes, scores, signaux et estimations sont des indicateurs statistiques fournis à titre informatif. Ils ne constituent ni un conseil en investissement, ni une recommandation personnalisée, ni une garantie de prix futur.</p>`],
  cgv: ['Conditions générales de vente et d\'utilisation', `
    <h2>1. Objet</h2><p>Les présentes conditions régissent l'utilisation du site Pokédex Trader et la souscription à l'offre Pro, entre ${T('éditeur')} et toute personne créant un compte (« l'utilisateur »).</p>
    <h2>2. Offres</h2><p><b>Sans compte</b> : collections, catalogue, cotes et historique des prix. <b>Compte gratuit</b> : en plus, Pokédex (achats et ventes), master sets, wishlist, alertes de prix et vitrine partagée. <b>Pro</b> : en plus, suivi du portefeuille (prix de revient, plus-values, performance, rapports mensuels, conseils personnalisés), calcul de la gradation, photo de profil et indicateurs d'achat et de vente (signaux, scores, estimations, prix conseillés, marché et classement). Le contenu des offres peut évoluer ; les abonnés en sont informés.</p>
    <h2>3. Prix et paiement</h2><p>Les prix sont indiqués en euros toutes taxes comprises sur la page Tarifs (${T('mention TVA : « TVA non applicable, art. 293 B du CGI » si micro-entreprise, ou taux applicable')}). Le paiement est réalisé par carte bancaire via Stripe ; Pokédex Trader n'a jamais accès à vos données bancaires.</p>
    <h2>4. Durée, renouvellement, résiliation</h2><p>L'abonnement Pro est mensuel ou annuel, renouvelé automatiquement à échéance. Vous pouvez le résilier à tout moment depuis « Mon abonnement » ; l'accès Pro reste actif jusqu'à la fin de la période payée, sans remboursement au prorata ${T('ou votre politique de remboursement')}.</p>
    <h2>5. Droit de rétractation</h2><p>Conformément à l'article L221-28 13° du Code de la consommation, en demandant l'accès immédiat au contenu numérique Pro lors de la souscription, l'utilisateur reconnaît renoncer à son droit de rétractation de 14 jours. ${T('vérifier que la case d\'acceptation correspondante est bien présente au paiement')}</p>
    <h2>6. Utilisation du service</h2><p>Le compte est personnel. Sont interdits : la revente ou l'extraction automatisée des données, le contournement des protections, les contenus illicites. En cas de manquement, le compte peut être suspendu.</p>
    <h2>7. Responsabilité</h2><p>Les données proviennent de sources tierces et peuvent comporter des erreurs ou des retards. Les signaux et estimations sont statistiques et ne sont pas des conseils financiers : l'utilisateur reste seul responsable de ses achats et ventes. La responsabilité de l'éditeur est limitée au montant payé au cours des 12 derniers mois.</p>
    <h2>8. Médiation et droit applicable</h2><p>Droit français. En cas de litige, l'utilisateur consommateur peut recourir gratuitement au médiateur de la consommation : ${T('nom et site du médiateur')}, ainsi qu'à la plateforme européenne de règlement en ligne des litiges.</p>
    <p class="sub">Version du ${T('date')}.</p>`],
  confidentialite: ['Politique de confidentialité', `
    <h2>Responsable du traitement</h2><p>${T('éditeur et adresse')}, joignable à <a href="mailto:${CONFIG.CONTACT_EMAIL}">${CONFIG.CONTACT_EMAIL}</a>.</p>
    <h2>Données traitées</h2><ul><li>Compte : adresse e-mail, pseudo, mot de passe (chiffré par Supabase, jamais visible), dates d'inscription et de dernière visite.</li>
      <li>Contenu que vous saisissez : transactions du Pokédex, master sets, wishlist, alertes de prix.</li>
      <li>Performance quotidienne de votre portefeuille (valeur, capital investi, résultat), calculée à partir de vos transactions.</li>
      <li>Cartes Pro découvertes avec votre compte gratuit (la liste des cartes et la date), pour compter vos découvertes offertes.</li>
      <li>Portefeuille partagé, <b>seulement si vous l'activez</b> (Profil) : votre pseudo, vos cartes détenues et votre performance en pourcentage deviennent visibles de tous sur votre vitrine et dans le classement de la Communauté ; les montants en euros seulement si vous le choisissez. Vous pouvez couper le partage à tout moment.</li>
      <li>Abonnement : identifiant client Stripe, offre, date d'échéance (aucune donnée bancaire n'est stockée sur nos serveurs).</li></ul>
    <h2>Finalités et bases légales</h2><p>Fournir le service et votre espace (exécution du contrat), publier votre vitrine si vous l'avez demandé (consentement, retirable à tout moment), gérer l'abonnement et la facturation (contrat, obligation légale), sécuriser le site et prévenir les abus (intérêt légitime). Pas de publicité, pas de revente de données.</p>
    <h2>Destinataires et sous-traitants</h2><p>Supabase (hébergement de la base et des comptes), Stripe (paiement), ${T('hébergeur du site')}, Google Fonts (polices d'affichage). Certains sont établis hors de l'Union européenne et encadrés par des clauses contractuelles types. ${T('vérifier la liste et la région Supabase')}</p>
    <h2>Durée de conservation</h2><p>Tant que le compte est actif ; les données sont supprimées lorsque vous supprimez votre compte (Profil > Supprimer mon compte). Les pièces comptables sont conservées 10 ans par Stripe et l'éditeur.</p>
    <h2>Stockage local</h2><p>Le site n'utilise pas de cookie publicitaire ni de mesure d'audience. Il enregistre dans votre navigateur uniquement ce qui est nécessaire : la session de connexion, le thème choisi, le fait d'avoir vu l'animation d'ouverture et le masquage du bandeau d'actualités.</p>
    <h2>Vos droits</h2><p>Accès, rectification, effacement, portabilité (Profil > Exporter mes données), opposition et limitation : écrivez à <a href="mailto:${CONFIG.CONTACT_EMAIL}">${CONFIG.CONTACT_EMAIL}</a>. Vous pouvez aussi saisir la CNIL (cnil.fr).</p>
    <p class="sub">Version du ${T('date')}.</p>`],
};

export function renderLegal(el, page) {
  const [title, body] = PAGES[page] || PAGES['mentions-legales'];
  el.innerHTML = `<article class="panel" style="max-width:860px;width:100%;margin:0 auto"><h1 style="font-size:28px">${title}</h1>${banner}<div class="legal" style="display:grid;gap:10px;line-height:1.65">${body}</div></article>`;
}
