// Sous-navigation de l'espace utilisateur et de l'espace modérateur (onglets accessibles).
import { ICONS } from '../util.js';
import { hasPro } from '../state.js';

const lockIc = () => ICONS.lock.replace('<svg', '<svg class="nav-lock"');

export function espaceNav(active) {
  const items = [['espace', 'Tableau de bord'], ['portefeuille', 'Portefeuille'], ['pokedex', 'Pokédex'], ['master-sets', 'Master sets'], ['wishlist', 'Wishlist et alertes'],
    ['gradation', 'Gradation', 1], ['rapports', 'Rapports', 1], ['abonnement', 'Mon abonnement'], ['profil', 'Profil']];
  return `<nav class="subnav" role="tablist" aria-label="Mon espace">${items.map(([k, l, pro]) =>
    `<a role="tab" href="#/${k}" aria-selected="${k === active}">${l}${pro && !hasPro() ? lockIc() : ''}</a>`).join('')}</nav>`;
}

export function modNav(active) {
  const items = [['', 'KPI'], ['utilisateurs', 'Utilisateurs'], ['annonces', 'Annonces'], ['actus', 'Actualités'], ['reglages', 'Réglages'], ['donnees', 'Données'], ['journal', 'Journal']];
  return `<nav class="subnav" role="tablist" aria-label="Modération">${items.map(([k, l]) =>
    `<a role="tab" href="#/moderation${k ? '/' + k : ''}" aria-selected="${k === active}">${l}</a>`).join('')}</nav>`;
}
