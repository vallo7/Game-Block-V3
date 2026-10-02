/*
  services/wheel.js
  --------------------------------------------------------------------
  Logique de la roue de la chance (V2) — sans aucun DOM : la mise en
  scène est dans ui/wheel.js. Ce service porte :

  - la file "récompenses en attente" : chaque gain de Coins qui doit
    déclencher la roue (réclamation de trophée/quête) s'y ajoute via
    queueReward() ; ui/wheel.js#presentQueued() les regroupe en UNE seule
    roue au lieu d'une par récompense (ex. plusieurs trophées réclamés
    d'affilée dans le menu Trophées) ;
  - la construction des 8 cases pour une récompense de base donnée
    (buildSegments) et le tirage pondéré (roll) — voir config/gameConfig.js
    #WHEEL pour la répartition (50 % de cases pub, toutes gagnantes) ;
  - l'anti-frustration : après une case pub REFUSÉE, le tirage suivant
    n'en propose aucune (noteOutcome) ;
  - le rythme de la roue de la boutique : 1 tour gratuit toutes les
    WHEEL.SHOP_FREE_COOLDOWN_MS (persisté), les suivants coûtent 1 pub.
  --------------------------------------------------------------------
*/
import { WHEEL } from "../config/gameConfig.js";
import { Storage } from "./storage.js";
import { Economy } from "./economy.js";

export const WheelService = {
  pendingBase: 0,
  declinedLastAd: false,

  // ---------- File de récompenses en attente ----------
  queueReward(amount) {
    const value = Math.floor(Number(amount) || 0);
    if (value > 0) this.pendingBase += value;
  },

  hasPending() {
    return this.pendingBase > 0;
  },

  takePending() {
    const value = this.pendingBase;
    this.pendingBase = 0;
    return value;
  },

  // ---------- Cases ----------
  // Récompense de référence de la roue : plancher MIN_BASE pour que les
  // petits gains (Perfect Clear = 1 Coin) restent intéressants à booster.
  getWheelBase(base) {
    return Math.max(WHEEL.MIN_BASE, Math.floor(Number(base) || 0));
  },

  buildSegments(base) {
    const wheelBase = this.getWheelBase(base);

    return WHEEL.LAYOUT.map((kind, index) => {
      const prize = WHEEL.PRIZES[kind];
      let bonus = Math.ceil(wheelBase * prize.factor);

      if (prize.min) bonus = Math.max(prize.min, bonus);
      bonus = Math.min(WHEEL.MAX_BONUS, bonus);

      return { index, kind, ads: prize.ads || 0, bonus };
    });
  },

  // Tirage uniforme sur les cases (donc pondéré par leur nombre : 4 cases
  // pub sur 8). Après une pub refusée, seules les cases gratuites restent
  // tirables.
  roll(segments) {
    let pool = segments;

    if (WHEEL.PITY_AFTER_DECLINED_AD && this.declinedLastAd) {
      const free = segments.filter(segment => !segment.ads);
      if (free.length > 0) pool = free;
    }

    return pool[Math.floor(Math.random() * pool.length)].index;
  },

  noteOutcome(segment, accepted) {
    this.declinedLastAd = Boolean(segment.ads) && !accepted;
  },

  credit(segment) {
    Economy.earn(segment.bonus, `wheel:${segment.kind}`);
  },

  // ---------- Roue de la boutique ----------
  getLastFreeSpinAt() {
    return Storage.getWheelState().lastFreeAt;
  },

  shopFreeSpinReady(now = Date.now()) {
    return now - this.getLastFreeSpinAt() >= WHEEL.SHOP_FREE_COOLDOWN_MS;
  },

  shopTimeUntilFree(now = Date.now()) {
    return Math.max(0, this.getLastFreeSpinAt() + WHEEL.SHOP_FREE_COOLDOWN_MS - now);
  },

  markShopFreeSpin(now = Date.now()) {
    Storage.saveWheelState({ lastFreeAt: now });
  }
};
