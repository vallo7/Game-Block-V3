/*
  services/storage.js
  --------------------------------------------------------------------
  Accès localStorage (best score, settings, tutoriel, rate us, thème
  visuel). Les clés et les valeurs par défaut viennent maintenant de
  config/gameConfig.js.
  --------------------------------------------------------------------
*/
import { STORAGE_KEYS, SETTINGS_DEFAULTS, TROPHY_STATS_DEFAULTS } from "../config/gameConfig.js";

export const Storage = {
  settingsKey: STORAGE_KEYS.settings,
  bestKey: STORAGE_KEYS.best,
  tutorialKey: STORAGE_KEYS.tutorial,
  rateUsKey: STORAGE_KEYS.rateUs,
  visualThemeKey: STORAGE_KEYS.visualTheme,
  coinsKey: STORAGE_KEYS.coins,
  trophiesKey: STORAGE_KEYS.trophies,
  trophyStatsKey: STORAGE_KEYS.trophyStats,
  themeUnlocksKey: STORAGE_KEYS.themeUnlocks,
  legacyKeys: STORAGE_KEYS.legacy,

  getTutorialDone() {
    try {
      return (localStorage.getItem(this.tutorialKey) || localStorage.getItem(this.legacyKeys.tutorial)) === "1";
    } catch (error) {
      return true;
    }
  },
  setTutorialDone() {
    try {
      localStorage.setItem(this.tutorialKey, "1");
    } catch (error) {}
  },
  getRateUsShown() {
    try {
      return (localStorage.getItem(this.rateUsKey) || localStorage.getItem(this.legacyKeys.rateUs)) === "1";
    } catch (error) {
      return true;
    }
  },
  setRateUsShown() {
    try {
      localStorage.setItem(this.rateUsKey, "1");
    } catch (error) {}
  },
  getVisualTheme() {
    try {
      return localStorage.getItem(this.visualThemeKey) || localStorage.getItem(this.legacyKeys.visualTheme) || "default";
    } catch (error) {
      return "default";
    }
  },
  setVisualTheme(id) {
    try {
      localStorage.setItem(this.visualThemeKey, id);
    } catch (error) {}
  },
  getSettings() {
    // Copie fraîche à chaque appel : SETTINGS_DEFAULTS est un objet
    // partagé venu de la config, il ne faut jamais le renvoyer tel
    // quel (Settings.data le mute ensuite abondamment — adsBlocked,
    // musicVolume... — ce qui corromprait la config partagée si on
    // renvoyait la même référence à chaque fois, comme le faisait
    // une version intermédiaire de ce fichier).
    const defaults = { ...SETTINGS_DEFAULTS };
    try {
      const raw = localStorage.getItem(this.settingsKey) || localStorage.getItem(this.legacyKeys.settings);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    } catch (error) {
      return defaults;
    }
  },
  saveSettings(settings) {
    localStorage.setItem(this.settingsKey, JSON.stringify(settings));
  },
  getBest() {
    return Number(localStorage.getItem(this.bestKey) || localStorage.getItem(this.legacyKeys.best) || 0);
  },
  saveBest(value) {
    localStorage.setItem(this.bestKey, String(value));
  },

  // ---------- Coins (roadmap Phase 5, services/economy.js) ----------
  getCoins() {
    try {
      return Math.max(0, Math.floor(Number(localStorage.getItem(this.coinsKey) || 0)));
    } catch (error) {
      return 0;
    }
  },
  saveCoins(value) {
    try {
      localStorage.setItem(this.coinsKey, String(Math.max(0, Math.floor(value))));
    } catch (error) {}
  },

  // ---------- Trophées (services/achievements.js) ----------
  // Forme : { [trophyId]: { at: timestamp, seen: bool } }
  getTrophies() {
    try {
      const raw = localStorage.getItem(this.trophiesKey);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  },
  saveTrophies(data) {
    try {
      localStorage.setItem(this.trophiesKey, JSON.stringify(data));
    } catch (error) {}
  },
  getTrophyStats() {
    const defaults = { ...TROPHY_STATS_DEFAULTS, themesPlayed: [] };
    try {
      const raw = localStorage.getItem(this.trophyStatsKey);
      if (!raw) return defaults;
      return { ...defaults, ...JSON.parse(raw) };
    } catch (error) {
      return defaults;
    }
  },
  saveTrophyStats(stats) {
    try {
      localStorage.setItem(this.trophyStatsKey, JSON.stringify(stats));
    } catch (error) {}
  },

  // ---------- Déblocages de thèmes (filières §3.3, services/visualtheme.js) ----------
  // Liste d'ids de thèmes débloqués par achat en Coins ou par condition
  // remplie (Perfect Clear x3...) — distincte du champ statique
  // `locked` de VisualTheme.LIST, qui ne change jamais lui-même.
  getThemeUnlocks() {
    try {
      const raw = localStorage.getItem(this.themeUnlocksKey);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      return [];
    }
  },
  saveThemeUnlocks(list) {
    try {
      localStorage.setItem(this.themeUnlocksKey, JSON.stringify(list));
    } catch (error) {}
  }
};
