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
// Monétisation V2 : plus aucun achat intégré, tout repose sur la
// publicité. Le joueur est INVITÉ à en regarder (boutique d'offres, roue
// de la chance, Second Wind, Fresh Start, quêtes) plutôt que forcé : les
// pubs récompensées ci-dessous ne sont jamais soumises au cooldown des
// interstitiels. SECOND_WIND_ADS / FRESH_START_ADS = nombre de pubs
// récompensées enchaînées pour débloquer chaque carte du panneau de défaite.
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
  MIN_INTERSTITIAL_INTERVAL_MS: 90000,
  SECOND_WIND_ADS: 1,
  FRESH_START_ADS: 2,
  // Pause entre deux pubs d'une même séquence (toast de progression).
  SEQUENCE_PAUSE_MS: 1100
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
  language: "gameblock_language_v1",
  trophyStats: "gameblock_trophy_stats_v1",
  themeUnlocks: "gameblock_theme_unlocks_v1",
  wheel: "gameblock_wheel_v1",
  run: "gameblock_run_v1",
  quality: "gameblock_quality_v1",
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
  vibration: true
};

// ---------- Coins (économie, roadmap Phase 5, révisée en V2) ----------
// Monétisation V2 : plus d'achat intégré, les Coins se gagnent en jouant
// (Perfect Clear, seule source répétable en jeu, volontairement rare),
// via les trophées et quêtes (one-shot / quotidiennes), et surtout en
// REGARDANT DES PUBS de plein gré : offres de la boutique
// (MARKETPLACE.AD_OFFERS) et roue de la chance (WHEEL). FRESH START ne
// coûte plus de Coins mais FRESH_START_ADS publicités (cf. ADS).
export const COINS = {
  PERFECT_CLEAR: 1
};

// ---------- Marketplace ----------
// THEME_PRICES : uniquement les thèmes débloqués par achat direct en
// Coins (filière 3, roadmap §3.3) — Ice se débloque par condition
// (filière 2, combo x8), pas par un prix ici (voir
// services/visualtheme.js#UNLOCKS et core/game-rules.js).
//
// AD_OFFERS (section "Recharge Coins") : 10 offres "regarde N pubs, gagne
// X Coins", plus ou moins généreuses (de 15 à 60 Coins par pub). La
// boutique en propose OFFER_SLOTS à la fois, tirées au hasard
// (services/adoffers.js) — au moins une offre courte (<= SHORT_OFFER_MAX_ADS
// pubs) est toujours proposée pour ne jamais enfermer le joueur dans des
// offres longues. Une fois toutes les offres affichées récupérées, la
// liste se renouvelle seule. FREE_REFRESHES = nombre d'actualisations
// gratuites par session (remis à zéro à chaque démarrage de l'app) ; les
// suivantes coûtent 1 pub.
export const MARKETPLACE = {
  DEFAULT_THEME_PRICE: 2500,
  THEME_PRICES: {
    halloween: 2500,
    hell: 2500
  },
  OFFER_SLOTS: 3,
  FREE_REFRESHES: 1,
  SHORT_OFFER_MAX_ADS: 2,
  // Seuils de "Coins par pub" pour la teinte des cartes d'offre
  // (services/adoffers.js#getTier) : < 20 base, < 30 vert, < 45 or, sinon
  // violet + pastille "meilleure offre".
  TIER_THRESHOLDS: [20, 30, 45],
  AD_OFFERS: [
    { id: "offer-1", ads: 1, coins: 15 },
    { id: "offer-2", ads: 1, coins: 25 },
    { id: "offer-3", ads: 2, coins: 35 },
    { id: "offer-4", ads: 2, coins: 60 },
    { id: "offer-5", ads: 3, coins: 60 },
    { id: "offer-6", ads: 3, coins: 120 },
    { id: "offer-7", ads: 4, coins: 100 },
    { id: "offer-8", ads: 4, coins: 200 },
    { id: "offer-9", ads: 5, coins: 175 },
    { id: "offer-10", ads: 5, coins: 300 }
  ]
};

// ---------- Roue de la chance (V2) ----------
// Affichée quand le joueur gagne des Coins (réclamation de trophée ou de
// quête, Perfect Clear en partie — avant le panneau de défaite) et en
// permanence sous les offres de la boutique. Les Coins de base sont déjà
// crédités : la roue offre un BONUS par-dessus. Chaque case est gagnante
// (aucun "perdu"), les cases pub sont simplement plus généreuses et
// refusables sans conséquence.
//
// LAYOUT : 8 cases de 45°, une case = 1/8 de chances. Les cases pub sont
// dupliquées (2 x ad1, 2 x ad2) => 50 % de chances de tomber sur une pub,
// les 4 cases gratuites (x2, x3, coinsSmall, coinsBig) se partagent le
// reste. L'ordre alterne pub/gratuit pour l'équilibre visuel.
//
// Bonus d'une case = max(min, ceil(base x factor)), plafonné à MAX_BONUS,
// où base = max(récompense gagnée, MIN_BASE) — le plancher évite qu'un
// Perfect Clear à 1 Coin donne des multiplicateurs ridicules.
//   x2 -> +1 x base (total x2)    x3 -> +2 x base (total x3)
//   ad1 (1 pub) -> 3 x base       ad2 (2 pubs) -> 5 x base
// PITY : si le joueur vient de refuser une case pub, le tirage suivant
// n'en propose aucune (jamais deux "pubs refusées" d'affilée).
export const WHEEL = {
  LAYOUT: ["ad1", "coinsSmall", "ad2", "x2", "ad1", "coinsBig", "ad2", "x3"],
  MIN_BASE: 10,
  MAX_BONUS: 2500,
  PRIZES: {
    coinsSmall: { factor: 0.5, min: 10 },
    coinsBig: { factor: 1.5, min: 25 },
    x2: { factor: 1 },
    x3: { factor: 2 },
    ad1: { factor: 3, min: 40, ads: 1 },
    ad2: { factor: 5, min: 90, ads: 2 }
  },
  PITY_AFTER_DECLINED_AD: true,
  WINDUP_MS: 260,
  SPIN_DURATION_MS: 5200,
  // Roue de la boutique : récompense de référence fixe, 1 tour gratuit
  // toutes les SHOP_FREE_COOLDOWN_MS, les suivants coûtent 1 pub.
  SHOP_BASE: 20,
  SHOP_FREE_COOLDOWN_MS: 4 * 60 * 60 * 1000
};

// ---------- Performance (gouverneur de qualité adaptatif) ----------
// core/game-state.js mesure le temps de frame réel en jeu ; si la
// moyenne dépasse SLOW_FRAME_MS sur une fenêtre de WINDOW_MS, le niveau
// de qualité descend d'un cran (max MAX_LEVEL) : niveau 1 = plus de
// lumières ambiantes/pointeur ni de "respiration" des blocs ; niveau 2 =
// en plus, résolution du canvas plafonnée à LOW_DPR. Ne remonte jamais
// tout seul dans une session (évite l'effet yo-yo). Un appareil puissant
// reste donc toujours au niveau 0 (rendu complet, aucune dégradation).
export const PERFORMANCE = {
  SLOW_FRAME_MS: 24,
  WINDOW_MS: 2000,
  SETTLE_MS: 4000,
  MAX_LEVEL: 2,
  LOW_DPR: 1.25
};

// ---------- Quêtes quotidiennes (roadmap Phase 9, demande explicite) ----------
// 5 quêtes tirées au sort ; dès que RESET_TRIGGER_COUNT (3) d'entre elles
// sont complétées, un compte à rebours de RESET_INTERVAL_MS (12h) démarre
// et la liste entière est renouvelée à son échéance. AD_SKIPPABLE_COUNT
// d'entre elles peuvent être complétées instantanément via une pub
// récompensée en plus de la voie normale (jouer). Chaque modèle porte
// 3 variantes de difficulté/récompense (targets[i] <-> reward[i]),
// tirées au hasard à la génération du cycle. "watchAds" est exclue des
// quêtes ad-skippable (déjà 100% pub) mais possède son propre bouton
// "Watch Ad" dans ui/quests.js. Les libellés affichés (EN/FR) vivent
// dans services/i18n.js (clés "quest.<id>").
export const QUESTS = {
  RESET_INTERVAL_MS: 12 * 60 * 60 * 1000,
  RESET_TRIGGER_COUNT: 3,
  SLOT_COUNT: 5,
  AD_SKIPPABLE_COUNT: 3,
  REMINDER_COOLDOWN_MS: 30 * 60 * 1000,
  TEMPLATES: [
    { id: "score", track: "score", targets: [5000, 10000, 20000], reward: [10, 16, 24] },
    { id: "lines", track: "lines", targets: [40, 80, 150], reward: [10, 16, 24] },
    { id: "perfectClear", track: "perfectClear", targets: [1, 2, 3], reward: [12, 18, 26] },
    { id: "combo", track: "combo", targets: [6, 10, 15], reward: [10, 16, 24] },
    { id: "games", track: "games", targets: [2, 3, 5], reward: [8, 14, 20] },
    { id: "watchAds", track: "watchAd", targets: [1, 2, 3], reward: [8, 12, 18] }
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

