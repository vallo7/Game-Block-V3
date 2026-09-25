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
// Phase 7 (révision du système publicitaire) : cooldown minimal global
// (MIN_INTERSTITIAL_INTERVAL_MS) pour qu'on ne puisse jamais enchaîner
// deux interstitiels rapprochés, même si plusieurs points d'entrée se
// déclenchent coup sur coup. Appliqué à Classic comme à tout futur mode :
// ce n'est pas une case par mode, c'est le service Ads lui-même qui
// impose le cooldown (services/ads.js).
// Fréquences doublées sur demande explicite (round de suivi) par rapport
// au premier passage de la Phase 7 (anciennes valeurs 1/4, 1/4, 1/5 —
// elles-mêmes une réduction des valeurs d'origine 2/3, 3/4, 1/2).
// NEW GAME (panneau Second Chance) a son propre déclenchement quasi
// systématique (NEW_GAME_CHANCE), distinct du Restart occasionnel de la
// pause — c'est le point de rupture le plus naturel pour un interstitiel.
// Les publicités RÉCOMPENSÉES (rewarded, Second Chance) ne sont PAS
// soumises au cooldown : toujours déclenchées par un choix explicite du
// joueur pour un bénéfice clair, jamais une interruption.
export const ADS = {
  // IDs de démonstration officiels Google, à remplacer avant publication
  // (cf. roadmap §6, Phase 6 "Chantiers de publication").
  UNIT_IDS: {
    banner: "ca-app-pub-3940256099942544/6300978111",
    interstitial: "ca-app-pub-3940256099942544/1033173712",
    rewarded: "ca-app-pub-3940256099942544/5224354917"
  },
  CLASSIC_ENTRY_CHANCE: 1 / 2,    // entrée en partie depuis le menu (doublé, était 1/4)
  RESTART_CHANCE: 1 / 2,          // bouton Restart de la pause (doublé, était 1/4)
  GAMEOVER_TIMEOUT_CHANCE: 2 / 5, // countdown de défaite arrivé à 0 (doublé, était 1/5)
  NEW_GAME_CHANCE: 1,             // bouton NEW GAME du panneau Second Chance : quasi systématique
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
    { level: 6, word: "INSANE!", threshold: 15 },
    { level: 7, word: "DIVINE!", threshold: 18 },
    { level: 8, word: "LEGENDARY!", threshold: 22 }
  ],
  EMPTIED_MIN_LEVEL: 6,
  // Barème dynamique (demande explicite) : chaque ligne/colonne EN PLUS
  // de la première, effacée en simultané dans le même coup, ajoute ce
  // nombre de points de "power" — nettement plus qu'un point de combo
  // (streak) classique. Sépare les deux axes de progression du praise
  // (core/game-rules.js#validate) au lieu de les additionner à parts
  // égales : un clear à 3-4 lignes d'un coup grimpe fort dans le barème
  // même sans aucun combo, et un long streak de simples grimpe fort même
  // sans aucun clear multi-lignes.
  SIMULTANEOUS_LINE_BONUS: 4,
  // Tailles "idéales" par palier (game-rules.js#fitPraiseText les réduit
  // si besoin pour tenir à l'écran quel que soit l'appareil — cf. round
  // de suivi : les mots longs des paliers hauts débordaient sur mobile
  // avec une taille fixe). INSANE!/DIVINE! ont volontairement la même
  // longueur qu'UNREAL! (7 lettres + "!") pour rester dans le même palier
  // de réduction sur petit écran plutôt que de s'inverser entre eux.
  FONT_SIZES: { 1: 32, 2: 42, 3: 52, 4: 64, 5: 76, 6: 84, 7: 92, 8: 100 }
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
  coins: "gameblock_coins_v1",
  trophies: "gameblock_trophies_v1",
  starTrophies: "gameblock_star_trophies_v1",
  quests: "gameblock_quests_v1",
  trophyStats: "gameblock_trophy_stats_v1",
  themeUnlocks: "gameblock_theme_unlocks_v1",
  adRewards: "gameblock_ad_rewards_v1",
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

// ---------- Coins (économie, roadmap Phase 5) ----------
// Économie durcie sur demande explicite (2e passe) : Perfect Clear reste
// la SEULE source répétable en jeu, mais rapporte très peu — l'essentiel
// de la progression "gratuite" vient désormais des trophées (one-shot,
// cf. services/achievements.js, seuils eux-mêmes relevés) et de la
// nouvelle section "Watch Ads for Coins" de la Marketplace (limitée par
// jour, cf. AD_REWARD/AD_DAILY_LIMIT ci-dessous — sans quoi elle
// annulerait complètement la rareté voulue). Objectif inchangé : que la
// recharge en argent réel garde un vrai intérêt plutôt que d'être
// redondante avec un farming facile.
// Économie resserrée (4e passe, demande explicite "triple la rareté
// d'obtention des coins, sauf watch ads") : Perfect Clear reste la seule
// source répétable en jeu (cf. note plus haut) — son gain est divisé par 3.
// AD_REWARD (Watch Ads) reste volontairement inchangé, explicitement
// exclu de cette passe.
export const COINS = {
  PERFECT_CLEAR: 1,
  FRESH_START_COST: 25,
  AD_REWARD: 15,
  AD_DAILY_LIMIT: 5
};

// ---------- Marketplace ----------
// FRESH_START_COST vit dans COINS (consommé côté jeu, pas Marketplace).
// THEME_PRICES : uniquement les thèmes débloqués par achat direct en
// Coins (filière 3, roadmap §3.3) — Ice se débloque désormais par
// condition (filière 2, combo x8), pas par un prix ici (voir
// services/visualtheme.js#UNLOCKS et core/game-rules.js). Prix
// d'Inferno relevé (2e passe, demande explicite "thèmes plus chers") —
// cohérent avec une économie de Coins désormais beaucoup plus rare.
// COIN_PACKS : pas de vraie transaction IAP branchée pour l'instant
// (voir la note détaillée plus haut dans la version précédente de ce
// fichier) — inchangé par cette passe, qui ne touche qu'à ce qui est
// gratuit/gagnable en jeu.
export const MARKETPLACE = {
  // Prix quintuplés (4e passe, demande explicite). Halloween rejoint
  // Inferno comme thème payant en Coins — il n'était pas dans
  // THEME_PRICES avant (débloqué par condition) ; son prix ici est neuf,
  // positionné sous celui d'Inferno. Ice prend sa place comme thème à
  // condition (voir services/visualtheme.js#UNLOCKS et
  // core/game-rules.js).
  THEME_PRICES: {
    halloween: 1800,
    hell: 2500
  },
  // "Remove Ads" (nouveau) : point de prix standard pour ce type d'achat
  // unique dans les jeux mobiles casual à succès.
  REMOVE_ADS_PRICE: "$3.99",
  COIN_PACKS: [
    { id: "pack-handful", coins: 100, bonus: 0, priceLabel: "$0.99" },
    { id: "pack-pouch", coins: 550, bonus: 10, priceLabel: "$4.99", badge: null },
    { id: "pack-chest", coins: 1200, bonus: 20, priceLabel: "$9.99", badge: "BEST VALUE" },
    { id: "pack-vault", coins: 3000, bonus: 35, priceLabel: "$19.99", badge: "MOST COINS" }
  ]
};

// ---------- Quêtes quotidiennes (roadmap Phase 9, demande explicite) ----------
// 5 quêtes tirées au sort à chaque cycle de QUESTS.RESET_INTERVAL_MS (12h),
// dont AD_SKIPPABLE_COUNT peuvent être complétées instantanément via une
// pub récompensée en plus de la voie normale (jouer). Chaque modèle porte
// 3 variantes de difficulté/récompense (targets[i] <-> reward[i]),
// tirées au hasard à la génération du cycle pour un peu de variété d'un
// jour à l'autre. "watchAds" est volontairement exclue des quêtes
// ad-skippable : elle est déjà 100% pub, lui donner un raccourci pub
// n'aurait aucun sens.
export const QUESTS = {
  RESET_INTERVAL_MS: 12 * 60 * 60 * 1000,
  SLOT_COUNT: 5,
  AD_SKIPPABLE_COUNT: 3,
  REMINDER_COOLDOWN_MS: 30 * 60 * 1000,
  TEMPLATES: [
    {
      id: "score",
      track: "score",
      targets: [5000, 10000, 20000],
      reward: [10, 16, 24],
      label: (n) => `Score ${n.toLocaleString()} points in a single run`
    },
    {
      id: "lines",
      track: "lines",
      targets: [40, 80, 150],
      reward: [10, 16, 24],
      label: (n) => `Clear ${n} lines`
    },
    {
      id: "perfectClear",
      track: "perfectClear",
      targets: [1, 2, 3],
      reward: [12, 18, 26],
      label: (n) => `Achieve ${n} Perfect Clear${n > 1 ? "s" : ""}`
    },
    {
      id: "combo",
      track: "combo",
      targets: [6, 10, 15],
      reward: [10, 16, 24],
      label: (n) => `Reach a x${n} combo`
    },
    {
      id: "games",
      track: "games",
      targets: [2, 3, 5],
      reward: [8, 14, 20],
      label: (n) => `Play ${n} games`
    },
    {
      id: "watchAds",
      track: "watchAd",
      targets: [1, 2, 3],
      reward: [8, 12, 18],
      label: (n) => `Watch ${n} ad${n > 1 ? "s" : ""}`
    }
  ]
};

// ---------- Trophées : valeurs par défaut des statistiques à vie
// persistées (services/achievements.js) ----------
export const TROPHY_STATS_DEFAULTS = {
  perfectClears: 0,
  linesCleared: 0,
  gamesPlayed: 0,
  bestBeatenCount: 0,
  highPraiseCount: 0,
  themesPlayed: [],
  secretTraceDone: false
};

