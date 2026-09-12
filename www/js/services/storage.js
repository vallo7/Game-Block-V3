/*
  services/storage.js
  --------------------------------------------------------------------
  Accès localStorage (best score, settings, tutoriel, rate us, thème
  visuel). Les clés et les valeurs par défaut viennent maintenant de
  config/gameConfig.js.
  --------------------------------------------------------------------
*/
import { STORAGE_KEYS, SETTINGS_DEFAULTS } from "../config/gameConfig.js";

export const Storage = {
  settingsKey: STORAGE_KEYS.settings,
  bestKey: STORAGE_KEYS.best,
  tutorialKey: STORAGE_KEYS.tutorial,
  rateUsKey: STORAGE_KEYS.rateUs,
  visualThemeKey: STORAGE_KEYS.visualTheme,
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
    const defaults = SETTINGS_DEFAULTS;
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
  }
};
