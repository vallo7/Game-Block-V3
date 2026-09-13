/*
  services/ads.js
  --------------------------------------------------------------------
  Intégration AdMob (plugin @capacitor-community/admob), en phase de
  test. Les IDs sont les IDs de démonstration officiels de Google — à
  remplacer avant publication (roadmap §6, Phase 6). Les probabilités
  d'affichage viennent de config/gameConfig.js.

  Dépendance circulaire assumée avec core/game-state.js (Ads a besoin
  de Game.pause()/resume(), Game a besoin de Ads pour ses boutons) :
  sans risque ici car aucun des deux ne lit l'autre au chargement du
  module, seulement à l'intérieur de gestionnaires appelés plus tard.
  --------------------------------------------------------------------
*/
import { ADS } from "../config/gameConfig.js";
import { Game } from "../core/game-state.js";
import { GameAudio } from "./audio.js";
import { Settings } from "./settings.js";

export const Ads = {
  ready: false,
  bannerVisible: false,

  interstitialReady: false,
  rewardedReady: false,
  preloadingInterstitial: false,
  preloadingRewarded: false,

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

  showOfflineMessage() {
    const el = document.createElement("div");
    el.className = "ad-toast";
    el.textContent = "No internet connection";

    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));

    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 2200);
  },

  isBlocked() {
    return Boolean(Settings.data && Settings.data.adsBlocked);
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
    if (this.isBlocked() || !this.hasPlugin() || !this.ready) return;

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
    if (this.isBlocked() || !this.hasPlugin() || !this.ready) return;

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

  async maybeShowInterstitial(chance) {
    if (this.isBlocked() || !this.isOnline() || !this.hasPlugin() || !this.ready) return;
    if (Math.random() > chance) return;

    Game.pause();
    GameAudio.pause();

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
    } catch (error) {
      // Publicité indisponible : on n'interrompt jamais le joueur pour ça.
    }

    Game.resume();
    GameAudio.resume();

    this.preloadInterstitial();
  },

  async showRewarded(onComplete) {
    const grant = () => {
      if (onComplete) onComplete();
    };

    if (this.isBlocked() || !this.hasPlugin() || !this.ready) {
      grant();
      return;
    }

    Game.pause();
    GameAudio.pause();

    try {
      const AdMob = Capacitor.Plugins.AdMob;

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

    Game.resume();
    GameAudio.resume();

    grant();

    this.preloadRewarded();
  },

  async showBanner() {
    if (this.isBlocked() || !this.hasPlugin() || this.bannerVisible) return;

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
