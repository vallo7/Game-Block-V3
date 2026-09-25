/*
  services/achievements.js
  --------------------------------------------------------------------
  Système de trophées (roadmap Phase 5, présenté par ui/trophies.js).
  Basé uniquement sur des mécaniques Classic déjà existantes (aucune
  dépendance à Adventure, qui n'est pas encore construit).

  5e passe (demande explicite) : un trophée n'est plus crédité
  automatiquement — il est "débloqué" (l'exploit est acquis) puis doit
  être RÉCLAMÉ par le joueur (claim()/claimStar()) pour recevoir ses
  Coins, via le bouton dédié de la carte de révélation
  (ui/trophies.js#showRevealQueue). "seen" sert donc désormais aussi de
  marqueur de réclamation : un trophée débloqué-non-réclamé réapparaît
  dans la file de révélation à chaque ouverture du menu tant qu'il n'a
  pas été réclamé.

  Système d'étoiles (5e passe) : certains trophées standalone (qui
  n'appartenaient à aucune famille à paliers existante) se débloquent
  désormais en 3 fois via S() plutôt qu'en une fois via T() — Dedicated,
  Personal Best, Divine Streak. Le seuil de la 1ʳᵉ étoile est le seuil
  "classique" (déjà ×3, cf. plus bas) ; la 2ᵉ étoile est ×5 ce seuil, la
  3ᵉ est ×25 (demande explicite) — récompense en Coins également en
  forte hausse à chaque étoile. Les autres familles à paliers (Score,
  Perfect Clear, Combo, Endurance) restent des trophées séparés
  classiques : elles jouent déjà ce rôle de progression par palier.

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

  unlock()/checkStarTrophy() sont idempotents : les fonctions ci-dessous
  peuvent donc être appelées à chaque événement pertinent sans garde
  supplémentaire côté appelant.
  --------------------------------------------------------------------
*/
import { Storage } from "./storage.js";
import { Economy } from "./economy.js";
import { VisualTheme } from "./visualtheme.js";

const T = (id, name, desc, category, tier, reward, secret = false) => ({
  id, name, desc, category, tier, reward, secret, starred: false
});

// Trophée à étoiles (5e passe, demande explicite) : 3 paliers sur le
// MÊME trophée plutôt que 3 trophées séparés. `descFor(threshold)`
// génère le libellé affiché pour un seuil donné (celui de la prochaine
// étoile à atteindre, ou de la dernière une fois les 3 acquises).
// `thresholds`/`rewards` sont des tableaux de longueur 3 (étoile 1/2/3).
const S = (id, name, descFor, category, thresholds, rewards) => ({
  id, name, descFor, category, tier: "star", thresholds, rewards, starred: true, secret: false
});

// 4e passe (demande explicite "triple la difficulté d'obtention des
// trophées") : tous les seuils de quantité/grind sont ×3. Restent
// inchangés, volontairement : les trophées "première fois" (Spotless,
// seuil=1 — tripler casserait le sens même du mot "first"), les
// déclenchements binaires (Legendary!, Frozen Over, Inferno Bound,
// Theme Collector) et les trophées secrets à capacité plafonnée par les
// règles du jeu elles-mêmes (Steady Hand : 6 cases = le maximum
// possible en un tracé ; Quad Clear / Double Perfect : tripler casserait
// le nom même du trophée). Voir aussi le système d'étoiles (plus bas)
// pour les trophées qui progressent désormais en 3 paliers.
export const TROPHIES = [
  // ---------- Score ----------
  T("warmup", "Warm-Up", "Score 30,000 points in a single run.", "score", "bronze", 15),
  T("rising-star", "Rising Star", "Score 150,000 points in a single run.", "score", "silver", 35),
  T("block-legend", "Block Legend", "Score 600,000 points in a single run.", "score", "gold", 90),
  T("grandmaster", "Grandmaster", "Score 1,500,000 points in a single run.", "score", "platinum", 150),

  // ---------- Perfect Clear ----------
  T("spotless", "Spotless", "Achieve your first Perfect Clear.", "clear", "bronze", 20),
  T("clean-sweep", "Clean Sweep", "Achieve 75 Perfect Clears in total.", "clear", "silver", 60),
  T("immaculate", "Immaculate", "Achieve 300 Perfect Clears in total.", "clear", "gold", 150),
  T("flawless-legend", "Flawless Legend", "Achieve 750 Perfect Clears in total.", "clear", "platinum", 300),

  // ---------- Combo ----------
  T("chain-reaction", "Chain Reaction", "Reach a x15 combo.", "combo", "bronze", 15),
  T("unstoppable", "Unstoppable", "Reach a x36 combo.", "combo", "silver", 40),
  T("perfect-run", "Perfect Run", "Reach a x75 combo.", "combo", "gold", 90),
  T("combo-god", "Combo God", "Reach a x120 combo.", "combo", "platinum", 180),

  // ---------- Praise ----------
  T("legendary", "Legendary!", "Trigger the LEGENDARY! praise.", "praise", "gold", 50),
  S("divine-streak", "Divine Streak", (n) => `Trigger DIVINE! or LEGENDARY! praise ${n} times in total.`, "praise", [30, 150, 750], [100, 280, 650]),

  // ---------- Endurance ----------
  T("marathoner", "Marathoner", "Survive 900 turns in a single run.", "endurance", "silver", 35),
  T("iron-will", "Iron Will", "Survive 2,400 turns in a single run.", "endurance", "gold", 100),
  T("eternal", "Eternal", "Survive 4,500 turns in a single run.", "endurance", "platinum", 200),

  // ---------- Dedication (cumul à vie) ----------
  T("line-cutter", "Line Cutter", "Clear 750 lines in total.", "volume", "bronze", 25),
  T("line-master", "Line Master", "Clear 7,500 lines in total.", "volume", "silver", 90),
  T("line-overlord", "Line Overlord", "Clear 30,000 lines in total.", "volume", "gold", 220),
  S("dedicated", "Dedicated", (n) => `Play ${n} games.`, "volume", [450, 2250, 11250], [35, 100, 250]),

  // ---------- Miscellaneous ----------
  S("personal-best", "Personal Best", (n) => `Beat your best score in ${n} different runs.`, "misc", [30, 150, 750], [30, 90, 220]),
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
  starProgress: {},
  stats: {},
  listeners: [],

  init() {
    this.unlocked = Storage.getTrophies();
    this.starProgress = Storage.getStarTrophies();
    this.stats = Storage.getTrophyStats();
  },

  // callback(trophy, star) — star vaut null pour un trophée classique,
  // ou le numéro (1-3) de l'étoile fraîchement atteinte.
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
    const trophy = byId[id];
    if (trophy && trophy.starred) {
      const p = this.starProgress[id];
      return Boolean(p && p.star > 0);
    }
    return Boolean(this.unlocked[id]);
  },

  // Étoile actuellement atteinte (0 si aucune) — utilisé par l'UI pour
  // les pips et par claim()/claimStar() en interne.
  getStar(id) {
    const p = this.starProgress[id];
    return p ? p.star : 0;
  },

  hasUnseen() {
    const simple = Object.values(this.unlocked).some(entry => !entry.seen);
    const starred = Object.values(this.starProgress).some(p => {
      for (let s = 1; s <= p.star; s++) {
        if (!p.seen[s]) return true;
      }
      return false;
    });
    return simple || starred;
  },

  unseenCount() {
    let count = Object.values(this.unlocked).filter(entry => !entry.seen).length;

    Object.values(this.starProgress).forEach(p => {
      for (let s = 1; s <= p.star; s++) {
        if (!p.seen[s]) count++;
      }
    });

    return count;
  },

  unlock(id) {
    if (this.unlocked[id]) return;

    const trophy = byId[id];
    if (!trophy || trophy.starred) return;

    // Ne verse plus les Coins automatiquement (5e passe) : le trophée est
    // acquis, mais reste "non réclamé" tant que le joueur n'a pas tapé le
    // bouton de collecte de sa carte de révélation (voir claim()
    // ci-dessous et ui/trophies.js#showRevealQueue).
    this.unlocked[id] = { at: Date.now(), seen: false };
    Storage.saveTrophies(this.unlocked);

    this.listeners.forEach(cb => cb(trophy, null));
  },

  // Fait progresser un trophée à étoiles vers le palier correspondant à
  // `value` (la statistique cumulative concernée). Idempotent : ne
  // redescend jamais une étoile déjà acquise, et ne redéclenche rien si
  // aucun nouveau seuil n'est franchi.
  checkStarTrophy(id, value) {
    const trophy = byId[id];
    if (!trophy || !trophy.starred) return;

    const progress = this.starProgress[id] || { star: 0, at: {}, seen: {} };
    let reached = progress.star;

    for (let s = trophy.thresholds.length; s >= 1; s--) {
      if (value >= trophy.thresholds[s - 1]) {
        reached = Math.max(reached, s);
        break;
      }
    }

    if (reached <= progress.star) return;

    for (let s = progress.star + 1; s <= reached; s++) {
      progress.at[s] = Date.now();
      progress.seen[s] = false;
    }
    progress.star = reached;

    this.starProgress[id] = progress;
    Storage.saveStarTrophies(this.starProgress);

    this.listeners.forEach(cb => cb(trophy, reached));
  },

  // Réclame les Coins d'un trophée classique déjà débloqué — appelé par
  // le bouton "Claim" de la carte de révélation. Retourne le montant
  // effectivement versé (0 si rien à réclamer), pour que l'UI sache quoi
  // afficher/animer.
  claim(id) {
    const trophy = byId[id];
    const entry = this.unlocked[id];
    if (!trophy || trophy.starred || !entry || entry.seen) return 0;

    entry.seen = true;
    Storage.saveTrophies(this.unlocked);

    Economy.earn(trophy.reward, `trophy:${id}`);
    return trophy.reward;
  },

  // Réclame les Coins d'une étoile précise d'un trophée à étoiles.
  claimStar(id, star) {
    const trophy = byId[id];
    const progress = this.starProgress[id];
    if (!trophy || !trophy.starred || !progress) return 0;
    if (star < 1 || star > progress.star || progress.seen[star]) return 0;

    progress.seen[star] = true;
    Storage.saveStarTrophies(this.starProgress);

    const amount = trophy.rewards[star - 1];
    Economy.earn(amount, `trophy:${id}:star${star}`);
    return amount;
  },

  saveStats() {
    Storage.saveTrophyStats(this.stats);
  },

  // ---------- Déclenchements "live" ----------
  checkScore(score) {
    if (score >= 30000) this.unlock("warmup");
    if (score >= 150000) this.unlock("rising-star");
    if (score >= 600000) this.unlock("block-legend");
    if (score >= 1500000) this.unlock("grandmaster");
  },

  checkCombo(combo) {
    if (combo >= 15) this.unlock("chain-reaction");
    if (combo >= 36) this.unlock("unstoppable");
    if (combo >= 75) this.unlock("perfect-run");
    if (combo >= 120) this.unlock("combo-god");
  },

  checkPraise(level) {
    if (level >= 8) this.unlock("legendary");
    if (level >= 7) this.addHighPraise();
  },

  checkTurns(turn) {
    if (turn >= 900) this.unlock("marathoner");
    if (turn >= 2400) this.unlock("iron-will");
    if (turn >= 4500) this.unlock("eternal");
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
    if (this.stats.perfectClears >= 75) this.unlock("clean-sweep");
    if (this.stats.perfectClears >= 300) this.unlock("immaculate");
    if (this.stats.perfectClears >= 750) this.unlock("flawless-legend");
  },

  addLinesCleared(count) {
    if (!count) return;

    this.stats.linesCleared += count;
    this.saveStats();

    if (this.stats.linesCleared >= 750) this.unlock("line-cutter");
    if (this.stats.linesCleared >= 7500) this.unlock("line-master");
    if (this.stats.linesCleared >= 30000) this.unlock("line-overlord");
  },

  addGamePlayed() {
    this.stats.gamesPlayed += 1;
    this.saveStats();

    this.checkStarTrophy("dedicated", this.stats.gamesPlayed);
  },

  addBestBeaten() {
    this.stats.bestBeatenCount += 1;
    this.saveStats();

    this.checkStarTrophy("personal-best", this.stats.bestBeatenCount);
  },

  addHighPraise() {
    this.stats.highPraiseCount += 1;
    this.saveStats();

    this.checkStarTrophy("divine-streak", this.stats.highPraiseCount);
  }
};
