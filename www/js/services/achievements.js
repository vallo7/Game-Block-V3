/*
  services/achievements.js
  --------------------------------------------------------------------
  Système de trophées (roadmap Phase 5, présenté par ui/trophies.js).
  18 trophées basés uniquement sur des mécaniques Classic déjà
  existantes (aucune dépendance à Adventure, qui n'est pas encore
  construit). Chaque trophée débloqué verse une récompense en Coins
  (services/economy.js) une seule fois, et reste marqué "non consulté"
  jusqu'à l'ouverture du menu Trophées (hasUnseen() pilote le glow doré
  du bouton, cf. ui/trophies.js).

  Deux familles de déclenchement, appelées depuis les modules core/ :
  - "live" (checkScore/checkCombo/checkPraise/checkTurns/checkTrace) :
    évalué à l'instant précis de l'événement en jeu, sur des valeurs
    qui ne persistent pas au-delà de la partie en cours.
  - "stat" (addPerfectClear/addLinesCleared/addGamePlayed/
    addBestBeaten/checkThemePlayed) : évalué après incrément d'une
    statistique cumulative PERSISTÉE (parties jouées, lignes effacées
    à vie, Perfect Clears à vie, records battus, thèmes essayés).

  unlock() est idempotent (un trophée déjà débloqué ne verse jamais
  deux fois sa récompense) : les fonctions ci-dessous peuvent donc être
  appelées à chaque événement pertinent sans garde supplémentaire côté
  appelant.
  --------------------------------------------------------------------
*/
import { Storage } from "./storage.js";
import { Economy } from "./economy.js";

const T = (id, name, desc, category, tier, reward, secret = false) => ({
  id, name, desc, category, tier, reward, secret
});

export const TROPHIES = [
  T("warmup", "Warm-Up", "Score 5,000 points in a single run.", "score", "bronze", 10),
  T("rising-star", "Rising Star", "Score 25,000 points in a single run.", "score", "silver", 25),
  T("block-legend", "Block Legend", "Score 100,000 points in a single run.", "score", "gold", 75),

  T("spotless", "Spotless", "Achieve your first Perfect Clear.", "clear", "bronze", 20),
  T("clean-sweep", "Clean Sweep", "Achieve 10 Perfect Clears in total.", "clear", "silver", 50),
  T("immaculate", "Immaculate", "Achieve 50 Perfect Clears in total.", "clear", "gold", 120),

  T("chain-reaction", "Chain Reaction", "Reach a x5 combo.", "combo", "bronze", 15),
  T("unstoppable", "Unstoppable", "Reach a x10 combo.", "combo", "silver", 35),
  T("perfect-run", "Perfect Run", "Reach a x20 combo.", "combo", "gold", 80),

  T("legendary", "Legendary!", "Trigger the LEGENDARY! praise.", "praise", "gold", 50),

  T("marathoner", "Marathoner", "Survive 200 turns in a single run.", "endurance", "silver", 30),
  T("iron-will", "Iron Will", "Survive 500 turns in a single run.", "endurance", "gold", 90),

  T("line-cutter", "Line Cutter", "Clear 100 lines in total.", "volume", "bronze", 20),
  T("line-master", "Line Master", "Clear 1,000 lines in total.", "volume", "silver", 70),
  T("dedicated", "Dedicated", "Play 50 games.", "volume", "bronze", 30),

  T("personal-best", "Personal Best", "Beat your best score in 5 different runs.", "misc", "silver", 25),
  T("frozen-over", "Frozen Over", "Play a run with the Frozen theme equipped.", "misc", "bronze", 10),
  T("steady-hand", "Steady Hand", "Complete a full 6-cell trace in a single move.", "misc", "gold", 40, true)
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
    if (score >= 5000) this.unlock("warmup");
    if (score >= 25000) this.unlock("rising-star");
    if (score >= 100000) this.unlock("block-legend");
  },

  checkCombo(combo) {
    if (combo >= 5) this.unlock("chain-reaction");
    if (combo >= 10) this.unlock("unstoppable");
    if (combo >= 20) this.unlock("perfect-run");
  },

  checkPraise(level) {
    if (level >= 8) this.unlock("legendary");
  },

  checkTurns(turn) {
    if (turn >= 200) this.unlock("marathoner");
    if (turn >= 500) this.unlock("iron-will");
  },

  checkTrace(length) {
    if (length >= 6 && !this.stats.secretTraceDone) {
      this.stats.secretTraceDone = true;
      this.saveStats();
      this.unlock("steady-hand");
    }
  },

  checkThemePlayed(themeId) {
    if (!this.stats.themesPlayed.includes(themeId)) {
      this.stats.themesPlayed.push(themeId);
      this.saveStats();
    }

    if (themeId === "ice") this.unlock("frozen-over");
  },

  // ---------- Déclenchements "stat" (statistiques cumulatives) ----------
  addPerfectClear() {
    this.stats.perfectClears += 1;
    this.saveStats();

    if (this.stats.perfectClears >= 1) this.unlock("spotless");
    if (this.stats.perfectClears >= 10) this.unlock("clean-sweep");
    if (this.stats.perfectClears >= 50) this.unlock("immaculate");
  },

  addLinesCleared(count) {
    if (!count) return;

    this.stats.linesCleared += count;
    this.saveStats();

    if (this.stats.linesCleared >= 100) this.unlock("line-cutter");
    if (this.stats.linesCleared >= 1000) this.unlock("line-master");
  },

  addGamePlayed() {
    this.stats.gamesPlayed += 1;
    this.saveStats();

    if (this.stats.gamesPlayed >= 50) this.unlock("dedicated");
  },

  addBestBeaten() {
    this.stats.bestBeatenCount += 1;
    this.saveStats();

    if (this.stats.bestBeatenCount >= 5) this.unlock("personal-best");
  }
};
