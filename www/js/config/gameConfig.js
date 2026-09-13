/*
  config/gameConfig.js
  --------------------------------------------------------------------
  Configuration centralisée (Phase 1 - Fondations, roadmap §Phase 1).
  Regroupe les constantes "réglables" qui étaient jusqu'ici dispersées
  dans plusieurs fichiers (game.js, ads.js, rateus.js, storage.js,
  settings.js), pour que les prochaines phases (thèmes, Adventure,
  marketplace, révision pub...) aient un seul endroit où lire/ajuster
  ces valeurs.

  Important : aucune valeur n'a été changée par rapport au code
  existant. Ce fichier déplace des constantes, il n'en modifie aucune.
  --------------------------------------------------------------------
*/

// ---------- Grille ----------
export const GRID = {
  SIZE: 8
};

// ---------- Banque de couleurs des blocs ----------
export const COLOR_BANK = [
  { name: "blue", base: "#0477fc", light: "#23a8fd", dark: "#0045f1" },
  { name: "yellow", base: "#fde402", light: "#fcf828", dark: "#fdb701" },
  { name: "green", base: "#46f30d", light: "#6bf90d", dark: "#14c304" },
  { name: "purple", base: "#9a0bf9", light: "#b847f9", dark: "#6505cb" },
  { name: "pink", base: "#f91487", light: "#fb59c5", dark: "#d00245" }
];

export const STONE_COLOR = { name: "stone", base: "#777c8a", light: "#a1a5b4", dark: "#454852" };
export const ICE_COLOR = { name: "ice", base: "#058afd", light: "#75f1fa", dark: "#0071fc" };

// ---------- Plafonds d'effets visuels (particules / débris) ----------
export const EFFECTS_LIMITS = {
  MAX_PARTICLES: 180,
  MAX_DEBRIS: 120
};

// ---------- Obstacles (blocs de pierre / glace) ----------
export const OBSTACLES = {
  WARMUP_SECONDS: 100
};

// ---------- Séquence de défaite / countdown de fin de partie ----------
export const GAME_OVER = {
  FREEZE_DELAY_MS: 2000,        // délai avant le gel des blocs après checkGameOver
  POPUP_DELAY_MS: 3400,         // délai entre le gel et l'apparition du panneau
  FREEZE_FX_DURATION_MS: 3000,  // durée de l'effet visuel de gel
  COUNTDOWN_SECONDS: 10,
  COUNTDOWN_INTERVAL_MS: 1000,
  RING_CIRCUMFERENCE: 264,
  RING_DURATION_MS: 10000
};

// ---------- Publicités (AdMob) ----------
export const ADS = {
  // IDs de démonstration officiels Google, à remplacer avant publication
  // (cf. roadmap §6, Phase 6 "Chantiers de publication").
  UNIT_IDS: {
    banner: "ca-app-pub-3940256099942544/6300978111",
    interstitial: "ca-app-pub-3940256099942544/1033173712",
    rewarded: "ca-app-pub-3940256099942544/5224354917"
  },
  // Probabilités d'affichage d'un interstitiel selon le point d'entrée.
  // Valeurs identiques à l'existant : la Phase 7 (révision pub, hors
  // Phase 1) ajustera ces chiffres depuis cet unique endroit.
  CLASSIC_ENTRY_CHANCE: 2 / 3,   // entrée en partie depuis le menu (Classic)
  RESTART_CHANCE: 3 / 4,         // bouton Restart (pause ou popup défaite)
  GAMEOVER_TIMEOUT_CHANCE: 1 / 2 // countdown de défaite arrivé à 0
};

// ---------- Rate us ----------
export const RATE_US = {
  STORE_URL: "https://play.google.com/store/apps/details?id=com.vallo7.gameblock",
  MIN_PROMPTS_BETWEEN: 6,
  MENU_CHANCE: 1 / 14,
  RESTART_CHANCE: 1 / 20
};

// ---------- Clés de stockage (localStorage) ----------
export const STORAGE_KEYS = {
  settings: "gameblock_settings_v1",
  best: "gameblock_best_v1",
  tutorial: "gameblock_tutorial_v1",
  rateUs: "gameblock_rateus_v1",
  visualTheme: "gameblock_visual_theme_v1",
  legacy: {
    settings: "inkblast_settings_v2",
    best: "inkblast_best_v2",
    tutorial: "inkblast_tutorial_v1",
    rateUs: "inkblast_rateus_v1",
    visualTheme: "inkblast_visual_theme_v1"
  }
};

// ---------- Réglages par défaut (Settings / Storage.getSettings) ----------
export const SETTINGS_DEFAULTS = {
  sound: true,
  music: true,
  musicVolume: 100,
  vibration: true,
  adsBlocked: false
};
