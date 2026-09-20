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
// COUNTDOWN_SECONDS est passé de 10 à 12 (Phase 8, "Second Chance") pour
// laisser un temps de lecture confortable aux 3 options de boost au lieu
// du choix binaire précédent (Continuer / Restart). RING_DURATION_MS reste
// verrouillé à COUNTDOWN_SECONDS*1000 (le cercle doit se vider exactement
// au rythme du chiffre affiché).
export const GAME_OVER = {
  FREEZE_DELAY_MS: 2000,        // délai avant le gel des blocs après checkGameOver
  POPUP_DELAY_MS: 3400,         // délai entre le gel et l'apparition du panneau
  FREEZE_FX_DURATION_MS: 3000,  // durée de l'effet visuel de gel
  COUNTDOWN_SECONDS: 12,
  COUNTDOWN_INTERVAL_MS: 1000,
  RING_CIRCUMFERENCE: 264,
  RING_DURATION_MS: 12000
};

// ---------- Publicités (AdMob) ----------
// Phase 7 (révision du système publicitaire) : les probabilités
// d'affichage d'un interstitiel sont revues à la baisse par défaut (les
// anciennes valeurs sont gardées en commentaire pour référence), et un
// cooldown minimal global (MIN_INTERSTITIAL_INTERVAL_MS) est introduit
// pour qu'on ne puisse jamais enchaîner deux interstitiels rapprochés,
// même si plusieurs points d'entrée se déclenchent coup sur coup (ex.
// countdown de défaite qui expire juste après un restart). Appliqué à
// Classic comme à tout futur mode : ce n'est pas une case par mode, c'est
// le service Ads lui-même qui impose le cooldown (services/ads.js).
// Les publicités RÉCOMPENSÉES (rewarded, Second Chance §Phase 8) ne sont
// PAS soumises à ce cooldown : elles sont toujours déclenchées par un
// choix explicite du joueur pour un bénéfice clair, jamais une
// interruption — seuls les interstitiels (non sollicités) sont limités.
export const ADS = {
  // IDs de démonstration officiels Google, à remplacer avant publication
  // (cf. roadmap §6, Phase 6 "Chantiers de publication").
  UNIT_IDS: {
    banner: "ca-app-pub-3940256099942544/6300978111",
    interstitial: "ca-app-pub-3940256099942544/1033173712",
    rewarded: "ca-app-pub-3940256099942544/5224354917"
  },
  CLASSIC_ENTRY_CHANCE: 1 / 4,    // était 2/3 — entrée en partie depuis le menu
  RESTART_CHANCE: 1 / 4,          // était 3/4 — bouton Restart (pause ou popup défaite)
  GAMEOVER_TIMEOUT_CHANCE: 1 / 5, // était 1/2 — countdown de défaite arrivé à 0
  // Durée plancher entre deux interstitiels, tous points d'entrée
  // confondus (ne s'applique jamais aux pubs récompensées).
  MIN_INTERSTITIAL_INTERVAL_MS: 90000
};

// ---------- Praise (Phase 11 — extension 5 → 8 paliers) ----------
// Barème centralisé : chaque palier est vérifié du plus haut au plus bas
// (le premier seuil atteint par `power` = count + combo l'emporte) ; NICE!
// reste le palier plancher, atteint dès que showPraise() est appelée sans
// franchir le seuil de GREAT!. Un Perfect Clear (grille totalement vidée)
// garantit désormais un palier minimum (EMPTIED_MIN_LEVEL) au lieu de
// forcer un palier fixe comme avant l'extension — un perfect clear obtenu
// pendant un très gros combo peut donc dépasser ce plancher.
export const PRAISE = {
  LEVELS: [
    { level: 1, word: "NICE!", threshold: 0 },
    { level: 2, word: "GREAT!", threshold: 5 },
    { level: 3, word: "AWESOME!", threshold: 7 },
    { level: 4, word: "AMAZING!", threshold: 9 },
    { level: 5, word: "UNREAL!", threshold: 12 },
    { level: 6, word: "INCREDIBLE!", threshold: 15 },
    { level: 7, word: "GODLIKE!", threshold: 18 },
    { level: 8, word: "LEGENDARY!", threshold: 22 }
  ],
  EMPTIED_MIN_LEVEL: 6
};

// ---------- Combo (fenêtre de validité partagée par le badge, le
// nouveau combo meter et le Perfect Run) ----------
export const COMBO = {
  WINDOW_MS: 1800
};

// ---------- Perfect Run (Phase 12) ----------
// Jauge de clears consécutifs basée sur `combo` (aucune nouvelle
// mécanique de score : purement un habillage qui célèbre les mêmes
// paliers que ceux déjà atteignables via combo).
export const PERFECT_RUN = {
  MILESTONES: [3, 5, 10, 20]
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
