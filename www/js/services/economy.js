/*
  services/economy.js
  --------------------------------------------------------------------
  Portefeuille de Coins (monnaie du jeu, roadmap Phase 5). Solde en
  mémoire synchronisé avec le stockage local, notifié à des écouteurs
  (compteur de l'accueil, Marketplace) à chaque variation. earn()/
  spend() sont les deux SEULS points d'entrée qui touchent au solde —
  jamais d'écriture directe ailleurs dans le code, pour que le solde
  affiché reste toujours synchronisé avec celui persisté.

  Économie volontairement rare (cf. config/gameConfig.js#COINS) :
  seul un Perfect Clear rapporte des Coins en jeu de façon répétable ;
  le reste vient des trophées et quêtes (récompenses réclamées à la
  main), des offres "regarde N pubs" de la boutique
  (services/adoffers.js) et de la roue de la chance
  (services/wheel.js). Monétisation V2 : aucun achat intégré, les pubs
  regardées de plein gré remplacent la recharge en argent réel.
  --------------------------------------------------------------------
*/
import { Storage } from "./storage.js";
import { I18n } from "./i18n.js";

export const Economy = {
  balance: 0,
  listeners: [],

  init() {
    this.balance = Storage.getCoins();
  },

  // callback(balance, delta, reason)
  onChange(callback) {
    this.listeners.push(callback);
  },

  notify(delta, reason) {
    this.listeners.forEach(cb => cb(this.balance, delta, reason));
  },

  earn(amount, reason) {
    if (!amount || amount <= 0) return;

    this.balance += Math.floor(amount);
    Storage.saveCoins(this.balance);
    this.notify(amount, reason || "earn");
  },

  canAfford(amount) {
    return this.balance >= amount;
  },

  // Retourne true/false selon que la dépense a pu être effectuée —
  // l'appelant est responsable de vérifier canAfford()/le retour avant
  // d'accorder ce que le coût débloquait.
  spend(amount, reason) {
    if (!amount || amount <= 0) return true;
    if (!this.canAfford(amount)) return false;

    this.balance -= Math.floor(amount);
    Storage.saveCoins(this.balance);
    this.notify(-amount, reason || "spend");
    return true;
  },

  // Petit toast flottant, réutilise exactement le style de
  // Ads.showOfflineMessage() (.ad-toast, css/tutorial.css — nom de
  // classe générique malgré son fichier d'origine) : pas besoin de CSS
  // supplémentaire pour ce message.
  showInsufficientToast() {
    const el = document.createElement("div");
    el.className = "ad-toast";
    el.textContent = I18n.t("toast.insufficientCoins");

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));

    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 2200);
  }
};
