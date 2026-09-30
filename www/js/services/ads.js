/*
  services/ads.js
  --------------------------------------------------------------------
  Intégration AdMob (plugin @capacitor-community/admob), en phase de
  test. Les IDs sont les IDs de démonstration officiels de Google — à
  remplacer avant publication (roadmap §6, Phase 6). Les probabilités
  d'affichage viennent de config/gameConfig.js.

  Monétisation V2 : plus aucun achat intégré (le blocage des pubs
  "Remove Ads" n'existe plus), la publicité est le moteur économique du
  jeu. Le principe reste d'INVITER le joueur (offres de la boutique,
  roue de la chance, Second Wind, Fresh Start, quêtes) plutôt que de
  l'interrompre : les pubs récompensées sont toujours déclenchées par un
  choix explicite, seuls les interstitiels sont limités par un cooldown.

  showRewarded(onComplete, { count }) enchaîne `count` pubs récompensées
  (Fresh Start = 2, offres de la boutique = 1 à 5...) avec un petit
  toast de progression entre deux pubs. Chaque pub regardée alimente
  aussi les quêtes "regarder des pubs" (Quests.trackEvent) : c'est ici,
  et nulle part ailleurs, que ce suivi est fait — aucun appelant n'a à
  s'en soucier.

  Dépendance circulaire assumée avec core/game-state.js (Ads a besoin
  de Game.pause()/resume(), Game a besoin de Ads pour ses boutons) :
  sans risque ici car aucun des deux ne lit l'autre au chargement du
  module, seulement à l'intérieur de gestionnaires appelés plus tard.
  --------------------------------------------------------------------
*/
import { ADS } from "../config/gameConfig.js";
import { Game } from "../core/game-state.js";
import { GameAudio } from "./audio.js";
import { I18n } from "./i18n.js";
import { Quests } from "./quests.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const Ads = {
  ready: false,
  bannerVisible: false,

  interstitialReady: false,
  rewardedReady: false,
  preloadingInterstitial: false,
  preloadingRewarded: false,

  // Garde-fou anti double-tap : une seule séquence de pubs récompensées
  // à la fois, quel que soit l'écran qui la demande.
  rewardedBusy: false,

  // Phase 7 (révision pub) : horodatage du dernier interstitiel montré,
  // tous points d'entrée confondus (entrée en partie, restart, timeout de
  // défaite...). Ne concerne jamais les pubs récompensées (showRewarded),
  // toujours déclenchées volontairement par le joueur pour un bénéfice
  // explicite — seule l'interruption non sollicitée est limitée ici.
  lastInterstitialAt: 0,

  UNIT_IDS: ADS.UNIT_IDS,

  hasPlugin() {
    return Boolean(
      window.Capacitor &&
      Capacitor.Plugins &&
      Capacitor.Plugins.AdMob
    );
  },

  isOnline() {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  },

  showToast(text, duration = 2200) {
    const el = document.createElement("div");
    el.className = "ad-toast";
    el.textContent = text;

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));

    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, duration);
  },

  showOfflineMessage() {
    this.showToast(I18n.t("toast.offline"));
  },

  async init() {
    if (!this.hasPlugin()) return;

    try {
      await Capacitor.Plugins.AdMob.initialize({
        initializeForTesting: true
      });
      this.ready = true;
    } catch (error) {
      return;
    }

    this.preloadInterstitial();
    this.preloadRewarded();
  },

  async preloadInterstitial() {
    if (this.preloadingInterstitial || this.interstitialReady) return;
    if (!this.hasPlugin() || !this.ready) return;

    this.preloadingInterstitial = true;

    try {
      await Capacitor.Plugins.AdMob.prepareInterstitial({
        adId: this.UNIT_IDS.interstitial,
        isTesting: true
      });
      this.interstitialReady = true;
    } catch (error) {
      this.interstitialReady = false;
    }

    this.preloadingInterstitial = false;
  },

  async preloadRewarded() {
    if (this.preloadingRewarded || this.rewardedReady) return;
    if (!this.hasPlugin() || !this.ready) return;

    this.preloadingRewarded = true;

    try {
      await Capacitor.Plugins.AdMob.prepareRewardVideoAd({
        adId: this.UNIT_IDS.rewarded,
        isTesting: true
      });
      this.rewardedReady = true;
    } catch (error) {
      this.rewardedReady = false;
    }

    this.preloadingRewarded = false;
  },

  // Phase 7 : vrai tant que le dernier interstitiel affiché est plus
  // récent que ADS.MIN_INTERSTITIAL_INTERVAL_MS — bloque tout nouvel
  // interstitiel indépendamment du tirage au sort, pour qu'aucune
  // séquence d'actions rapprochées (ex. restart juste après un premier
  // interstitiel) ne puisse jamais en montrer deux coup sur coup.
  isInterstitialCoolingDown() {
    if (!this.lastInterstitialAt) return false;
    return Date.now() - this.lastInterstitialAt < ADS.MIN_INTERSTITIAL_INTERVAL_MS;
  },

  // Fige le jeu et l'audio le temps d'une pub, puis ne relance QUE ce
  // que cet appel a lui-même figé : si le jeu était déjà en pause (ex.
  // boutique ouverte par-dessus la partie, App.openSettings), la fin de
  // la pub ne le relance plus par erreur.
  async withGamePaused(task) {
    const gameWasPaused = Boolean(Game.paused);
    const audioWasPaused = Boolean(GameAudio.paused);

    Game.pause();
    GameAudio.pause();

    try {
      await task();
    } finally {
      if (!gameWasPaused) Game.resume();
      if (!audioWasPaused) GameAudio.resume();
    }
  },

  async maybeShowInterstitial(chance) {
    if (!this.isOnline() || !this.hasPlugin() || !this.ready) return;
    if (this.isInterstitialCoolingDown()) return;
    if (Math.random() > chance) return;

    await this.withGamePaused(async () => {
      try {
        const AdMob = Capacitor.Plugins.AdMob;

        if (!this.interstitialReady) {
          await AdMob.prepareInterstitial({
            adId: this.UNIT_IDS.interstitial,
            isTesting: true
          });
        }

        this.interstitialReady = false;
        await AdMob.showInterstitial();
        this.lastInterstitialAt = Date.now();
      } catch (error) {
        // Publicité indisponible : on n'interrompt jamais le joueur pour ça
        // (et on ne pose pas le cooldown puisqu'aucun interstitiel n'a
        // réellement été montré).
      }
    });

    this.preloadInterstitial();
  },

  // Attend qu'un préchargement éventuellement en cours se termine (utile
  // entre deux pubs d'une séquence : le préchargement de la suivante est
  // lancé dès la fin de la première).
  async waitForRewardedPreload(maxMs = 8000) {
    const start = Date.now();

    while (this.preloadingRewarded && Date.now() - start < maxMs) {
      await wait(100);
    }
  },

  // Joue UNE pub récompensée. Sans plugin (navigateur de dev) ou en cas
  // d'échec, ne bloque rien : la récompense reste accordée, comme avant.
  async playRewardedOnce() {
    if (!this.hasPlugin() || !this.ready) return;

    await this.withGamePaused(async () => {
      try {
        const AdMob = Capacitor.Plugins.AdMob;

        await this.waitForRewardedPreload();

        if (!this.rewardedReady) {
          await AdMob.prepareRewardVideoAd({
            adId: this.UNIT_IDS.rewarded,
            isTesting: true
          });
        }

        this.rewardedReady = false;
        await AdMob.showRewardVideoAd();
      } catch (error) {
        // Pub indisponible : on accorde quand même la récompense.
      }
    });

    this.preloadRewarded();
  },

  // Enchaîne `count` pubs récompensées puis appelle onComplete() une seule
  // fois. Retourne true si la séquence a eu lieu, false si une autre
  // séquence était déjà en cours (onComplete n'est alors pas appelé).
  async showRewarded(onComplete, options = {}) {
    if (this.rewardedBusy) return false;

    const total = Math.max(1, Math.floor(options.count || 1));
    this.rewardedBusy = true;

    try {
      for (let i = 0; i < total; i++) {
        await this.playRewardedOnce();

        // Chaque pub vue compte pour les quêtes "regarder des pubs".
        Quests.trackEvent("watchAd", 1, { cumulative: true });

        // Pause + toast de progression seulement avec un vrai plugin : sans
        // lui (navigateur de dev) les pubs sont instantanées, inutile
        // d'attendre entre deux.
        if (i < total - 1 && this.hasPlugin() && this.ready) {
          this.showToast(
            I18n.t("toast.adProgress", { done: i + 1, total }),
            ADS.SEQUENCE_PAUSE_MS + 300
          );
          this.preloadRewarded();
          await wait(ADS.SEQUENCE_PAUSE_MS);
        }
      }
    } finally {
      this.rewardedBusy = false;
    }

    if (onComplete) onComplete();
    return true;
  },

  async showBanner() {
    if (!this.hasPlugin() || this.bannerVisible) return;

    try {
      await Capacitor.Plugins.AdMob.showBanner({
        adId: this.UNIT_IDS.banner,
        adSize: "ADAPTIVE_BANNER",
        position: "BOTTOM_CENTER",
        margin: 0,
        isTesting: true
      });
      this.bannerVisible = true;
    } catch (error) {
      // Pas de bannière disponible.
    }
  },

  async hideBanner() {
    if (!this.hasPlugin() || !this.bannerVisible) return;

    try {
      await Capacitor.Plugins.AdMob.hideBanner();
    } catch (error) {
      // Rien à faire.
    }

    this.bannerVisible = false;
  }
};
