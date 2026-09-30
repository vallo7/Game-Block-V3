/*
  services/adoffers.js
  --------------------------------------------------------------------
  Offres "regarde N pubs, gagne X Coins" de la section Recharge Coins de
  la boutique (V2 — remplace les packs d'achat intégré). Logique pure,
  état volontairement EN MÉMOIRE : tout se remet à zéro à chaque
  démarrage de l'app (nouveau tirage, actualisation gratuite de nouveau
  disponible), et une simple réouverture de la boutique ne permet jamais
  de retirer de nouvelles offres pour rien.

  - 10 offres possibles (config/gameConfig.js#MARKETPLACE.AD_OFFERS),
    MARKETPLACE.OFFER_SLOTS affichées à la fois (3), tirées au hasard ;
    l'une d'elles est toujours une offre courte (<= SHORT_OFFER_MAX_ADS
    pubs) pour ne jamais proposer que des offres longues ;
  - actualiser : la première fois est gratuite, les suivantes coûtent 1
    pub (l'appelant regarde la pub puis appelle refresh()) ;
  - quand toutes les offres affichées ont été récupérées, la liste se
    renouvelle d'elle-même (allClaimed() -> refresh({ auto: true })).
  Le crédit de Coins passe par Economy.earn, comme partout ailleurs.
  --------------------------------------------------------------------
*/
import { MARKETPLACE } from "../config/gameConfig.js";
import { Economy } from "./economy.js";

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export const AdOffers = {
  ids: [],
  claimed: new Set(),
  freeRefreshesUsed: 0,

  init() {
    this.freeRefreshesUsed = 0;
    this.roll();
  },

  byId(id) {
    return MARKETPLACE.AD_OFFERS.find(offer => offer.id === id) || null;
  },

  current() {
    return this.ids.map(id => this.byId(id)).filter(Boolean);
  },

  isClaimed(id) {
    return this.claimed.has(id);
  },

  allClaimed() {
    return this.ids.length > 0 && this.ids.every(id => this.claimed.has(id));
  },

  // Tire OFFER_SLOTS offres distinctes, en évitant celles déjà affichées
  // tant qu'il reste assez d'offres pour le faire.
  roll() {
    const all = MARKETPLACE.AD_OFFERS;
    const previous = new Set(this.ids);

    let pool = all.filter(offer => !previous.has(offer.id));
    if (pool.length < MARKETPLACE.OFFER_SLOTS) pool = all.slice();

    const picked = [];

    const shortPool = pool.filter(offer => offer.ads <= MARKETPLACE.SHORT_OFFER_MAX_ADS);
    if (shortPool.length > 0) picked.push(pickRandom(shortPool));

    while (picked.length < Math.min(MARKETPLACE.OFFER_SLOTS, all.length)) {
      const rest = pool.filter(offer => !picked.includes(offer));
      if (rest.length === 0) break;
      picked.push(pickRandom(rest));
    }

    // Ordre d'affichage : du moins au plus exigeant en pubs, pour une
    // lecture claire de haut en bas.
    picked.sort((a, b) => a.ads - b.ads || a.coins - b.coins);

    this.ids = picked.map(offer => offer.id);
    this.claimed = new Set();
  },

  freeRefreshAvailable() {
    return this.freeRefreshesUsed < MARKETPLACE.FREE_REFRESHES;
  },

  // `free` : true = consomme l'actualisation gratuite de la session ;
  // false = actualisation payée en pub (déjà regardée par l'appelant) ;
  // `auto` : renouvellement automatique après avoir tout récupéré (ne
  // consomme ni ne coûte rien).
  refresh({ free = false, auto = false } = {}) {
    if (free && !auto) this.freeRefreshesUsed += 1;
    this.roll();
  },

  // Retourne le montant de Coins crédité (0 si l'offre est inconnue ou
  // déjà récupérée). L'appelant a déjà fait regarder les pubs.
  claim(id) {
    const offer = this.byId(id);
    if (!offer || !this.ids.includes(id) || this.claimed.has(id)) return 0;

    this.claimed.add(id);
    Economy.earn(offer.coins, `ad-offer:${id}`);
    return offer.coins;
  },

  // Teinte de la carte selon le nombre de Coins par pub.
  getTier(offer) {
    const perAd = offer.coins / offer.ads;
    const [low, mid, high] = MARKETPLACE.TIER_THRESHOLDS;

    if (perAd < low) return "base";
    if (perAd < mid) return "pouch";
    if (perAd < high) return "chest";
    return "vault";
  },

  isBestDeal(offer) {
    return this.getTier(offer) === "vault";
  }
};
