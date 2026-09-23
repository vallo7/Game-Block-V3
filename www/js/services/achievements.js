/*
  services/achievements.js
  --------------------------------------------------------------------
  Système de trophées (roadmap Phase 5, présenté par ui/trophies.js).
  28 trophées basés uniquement sur des mécaniques Classic déjà
  existantes (aucune dépendance à Adventure, qui n'est pas encore
  construit). Chaque trophée débloqué verse une récompense en Coins
  (services/economy.js) une seule fois, et reste marqué "non consulté"
  jusqu'à ce que son animation de révélation ait été jouée à l'ouverture
  du menu Trophées (cf. ui/trophies.js#showRevealQueue — markSeen()
  n'est appelé qu'à ce moment précis, une fois par trophée).

  2e passe (demande explicite) : seuils relevés sur toute la ligne pour
  augmenter la difficulté d'obtention, et la liste étendue de 18 à 28
  trophées — nouveau palier "platinum" au sommet de chaque catégorie qui
  s'y prête, plus quelques trophées inédits (Divine Streak, Theme
  Collector, Inferno Bound, et 2 nouveaux secrets).

  Trois familles de déclenchement, appelées depuis les modules core/ :
  - "live" (checkScore/checkCombo/checkPraise/checkTurns/checkTrace/
    checkSimultaneousClear/checkPerfectClearStreak) : évalué à l'instant
    précis de l'événement en jeu, sur des valeurs qui ne persistent pas
    au-delà de la partie en cours (sauf highPraiseCount, cumulatif).
  - "stat" (addPerfectClear/addLinesCleared/addGamePlayed/
    addBestBeaten/addHighPraise/checkThemePlayed) : évalué après
    incrément d'une statistique cumulative PERSISTÉE.
  - checkThemeCollection() : évalué après un déblocage de thème
    (appelé depuis les appelants de VisualTheme.unlockThemeByCondition/
    purchaseTheme, jamais depuis visualtheme.js lui-même — évite un
    cycle d'import, cf. l'import de VisualTheme ci-dessous qui va dans
    l'autre sens).

  unlock() est idempotent (un trophée déjà débloqué ne verse jamais
  deux fois sa récompense) : les fonctions ci-dessous peuvent donc être
  appelées à chaque événement pertinent sans garde supplémentaire côté
  appelant.
  --------------------------------------------------------------------
*/
import { Storage } from "./storage.js";
import { Economy } from "./economy.js";
import { VisualTheme } from "./visualtheme.js";

const T = (id, name, desc, category, tier, reward, secret = false) => ({
  id, name, desc, category, tier, reward, secret
});

export const TROPHIES = [
  // ---------- Score ----------
  T("warmup", "Warm-Up", "Score 10,000 points in a single run.", "score", "bronze", 15),
  T("rising-star", "Rising Star", "Score 50,000 points in a single run.", "score", "silver", 35),
  T("block-legend", "Block Legend", "Score 200,000 points in a single run.", "score", "gold", 90),
  T("grandmaster", "Grandmaster", "Score 500,000 points in a single run.", "score", "platinum", 150),

  // ---------- Perfect Clear ----------
  T("spotless", "Spotless", "Achieve your first Perfect Clear.", "clear", "bronze", 20),
  T("clean-sweep", "Clean Sweep", "Achieve 25 Perfect Clears in total.", "clear", "silver", 60),
  T("immaculate", "Immaculate", "Achieve 100 Perfect Clears in total.", "clear", "gold", 150),
  T("flawless-legend", "Flawless Legend", "Achieve 250 Perfect Clears in total.", "clear", "platinum", 300),

  // ---------- Combo ----------
  T("chain-reaction", "Chain Reaction", "Reach a x5 combo.", "combo", "bronze", 15),
  T("unstoppable", "Unstoppable", "Reach a x12 combo.", "combo", "silver", 40),
  T("perfect-run", "Perfect Run", "Reach a x25 combo.", "combo", "gold", 90),
  T("combo-god", "Combo God", "Reach a x40 combo.", "combo", "platinum", 180),

  // ---------- Praise ----------
  T("legendary", "Legendary!", "Trigger the LEGENDARY! praise.", "praise", "gold", 50),
  T("divine-streak", "Divine Streak", "Trigger DIVINE! or LEGENDARY! praise 10 times in total.", "praise", "platinum", 100),

  // ---------- Endurance ----------
  T("marathoner", "Marathoner", "Survive 300 turns in a single run.", "endurance", "silver", 35),
  T("iron-will", "Iron Will", "Survive 800 turns in a single run.", "endurance", "gold", 100),
  T("eternal", "Eternal", "Survive 1,500 turns in a single run.", "endurance", "platinum", 200),

  // ---------- Dedication (cumul à vie) ----------
  T("line-cutter", "Line Cutter", "Clear 250 lines in total.", "volume", "bronze", 25),
  T("line-master", "Line Master", "Clear 2,500 lines in total.", "volume", "silver", 90),
  T("line-overlord", "Line Overlord", "Clear 10,000 lines in total.", "volume", "gold", 220),
  T("dedicated", "Dedicated", "Play 150 games.", "volume", "bronze", 35),

  // ---------- Miscellaneous ----------
  T("personal-best", "Personal Best", "Beat your best score in 10 different runs.", "misc", "silver", 30),
  T("frozen-over", "Frozen Over", "Play a run with the Frozen theme equipped.", "misc", "bronze", 10),
  T("inferno-bound", "Inferno Bound", "Play a run with the Inferno theme equipped.", "misc", "silver", 20),
  T("theme-collector", "Theme Collector", "Unlock every purchasable theme.", "misc", "gold", 60),

  // ---------- Secret ----------
  T("steady-hand", "Steady Hand", "Complete a full 6-cell trace in a single move.", "misc", "gold", 40, true),
  T("quad-clear", "Quad Clear", "Clear 4 lines at once in a single move.", "misc", "gold", 70, true),
  T("double-perfect", "Double Perfect", "Achieve 2 Perfect Clears in the same run.", "misc", "silver", 50, true)
];

const byId = Object.fromEntries(TROPHIES.map(t => [t.id, t]));

export const Achievements = {
  unlocked: {},
  stats: {},
  listeners: [],

  init() {
    this.unlocked = Storage.getTrophies();
    this.stats = Storage.getTrophyStats();
  },

  // callback(trophy)
  onUnlock(callback) {
    this.listeners.push(callback);
  },

  all() {
    return TROPHIES;
  },

  get(id) {
    return byId[id] || null;
  },

  isUnlocked(id) {
    return Boolean(this.unlocked[id]);
  },

  hasUnseen() {
    return Object.values(this.unlocked).some(entry => !entry.seen);
  },

  unseenCount() {
    return Object.values(this.unlocked).filter(entry => !entry.seen).length;
  },

  // Marque un seul trophée comme consulté — appelé une fois par
  // trophée au moment précis où son animation de révélation est jouée
  // (ui/trophies.js#showRevealQueue), jamais en bloc.
  markSeen(id) {
    const entry = this.unlocked[id];
    if (!entry || entry.seen) return;

    entry.seen = true;
    Storage.saveTrophies(this.unlocked);
  },

  // Filet de sécurité (ex. si la file de révélation est interrompue) —
  // plus utilisé sur le chemin normal, qui passe par markSeen().
  markAllSeen() {
    let changed = false;

    Object.values(this.unlocked).forEach(entry => {
      if (!entry.seen) {
        entry.seen = true;
        changed = true;
      }
    });

    if (changed) Storage.saveTrophies(this.unlocked);
  },

  unlock(id) {
    if (this.unlocked[id]) return;

    const trophy = byId[id];
    if (!trophy) return;

    this.unlocked[id] = { at: Date.now(), seen: false };
    Storage.saveTrophies(this.unlocked);

    Economy.earn(trophy.reward, `trophy:${id}`);

    this.listeners.forEach(cb => cb(trophy));
  },

  saveStats() {
    Storage.saveTrophyStats(this.stats);
  },

  // ---------- Déclenchements "live" ----------
  checkScore(score) {
    if (score >= 10000) this.unlock("warmup");
    if (score >= 50000) this.unlock("rising-star");
    if (score >= 200000) this.unlock("block-legend");
    if (score >= 500000) this.unlock("grandmaster");
  },

  checkCombo(combo) {
    if (combo >= 5) this.unlock("chain-reaction");
    if (combo >= 12) this.unlock("unstoppable");
    if (combo >= 25) this.unlock("perfect-run");
    if (combo >= 40) this.unlock("combo-god");
  },

  checkPraise(level) {
    if (level >= 8) this.unlock("legendary");
    if (level >= 7) this.addHighPraise();
  },

  checkTurns(turn) {
    if (turn >= 300) this.unlock("marathoner");
    if (turn >= 800) this.unlock("iron-will");
    if (turn >= 1500) this.unlock("eternal");
  },

  checkTrace(length) {
    if (length >= 6 && !this.stats.secretTraceDone) {
      this.stats.secretTraceDone = true;
      this.saveStats();
      this.unlock("steady-hand");
    }
  },

  // Trophée secret "Quad Clear" : 4 lignes/colonnes effacées d'un seul
  // coup (core/game-rules.js#processClears, sur `count`).
  checkSimultaneousClear(count) {
    if (count >= 4) this.unlock("quad-clear");
  },

  // Trophée secret "Double Perfect" : 2 Perfect Clears dans la même
  // partie (Game.perfectClearsThisRun, core/game-rules.js).
  checkPerfectClearStreak(countThisRun) {
    if (countThisRun >= 2) this.unlock("double-perfect");
  },

  checkThemePlayed(themeId) {
    if (!this.stats.themesPlayed.includes(themeId)) {
      this.stats.themesPlayed.push(themeId);
      this.saveStats();
    }

    if (themeId === "ice") this.unlock("frozen-over");
    if (themeId === "hell") this.unlock("inferno-bound");
  },

  // Appelé par les appelants de VisualTheme (core/game-rules.js après
  // unlockThemeByCondition, ui/marketplace.js après purchaseTheme) —
  // jamais depuis visualtheme.js lui-même, pour ne pas créer de cycle
  // d'import (achievements.js → visualtheme.js va déjà dans un sens).
  checkThemeCollection() {
    const purchased = VisualTheme.getPurchasedThemes();
    const allCoinAndConditionThemes = Object.keys(VisualTheme.UNLOCKS);
    const allOwned = allCoinAndConditionThemes.every(id => purchased.has(id));

    if (allOwned) this.unlock("theme-collector");
  },

  // ---------- Déclenchements "stat" (statistiques cumulatives) ----------
  addPerfectClear() {
    this.stats.perfectClears += 1;
    this.saveStats();

    if (this.stats.perfectClears >= 1) this.unlock("spotless");
    if (this.stats.perfectClears >= 25) this.unlock("clean-sweep");
    if (this.stats.perfectClears >= 100) this.unlock("immaculate");
    if (this.stats.perfectClears >= 250) this.unlock("flawless-legend");
  },

  addLinesCleared(count) {
    if (!count) return;

    this.stats.linesCleared += count;
    this.saveStats();

    if (this.stats.linesCleared >= 250) this.unlock("line-cutter");
    if (this.stats.linesCleared >= 2500) this.unlock("line-master");
    if (this.stats.linesCleared >= 10000) this.unlock("line-overlord");
  },

  addGamePlayed() {
    this.stats.gamesPlayed += 1;
    this.saveStats();

    if (this.stats.gamesPlayed >= 150) this.unlock("dedicated");
  },

  addBestBeaten() {
    this.stats.bestBeatenCount += 1;
    this.saveStats();

    if (this.stats.bestBeatenCount >= 10) this.unlock("personal-best");
  },

  addHighPraise() {
    this.stats.highPraiseCount += 1;
    this.saveStats();

    if (this.stats.highPraiseCount >= 10) this.unlock("divine-streak");
  }
};
