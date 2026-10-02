/*
  core/game-persist.js
  --------------------------------------------------------------------
  Conservation de la partie en cours entre deux lancements de l'app
  (V2, demande explicite). Le thème actif est, lui, restauré par
  services/visualtheme.js#init.

  Ce qui est sauvegardé (instantané JSON, Storage.saveRun) : plateau
  (cases + couleurs), score, tour, lignes cumulées, bloc demandé + file
  des 3 suivants, couleur du tour, temps de jeu écoulé (pour que la
  cadence des obstacles reprenne là où elle en était), Coins gagnés dans
  la partie (roue de la chance), stats de run. Le tracé en cours d'un
  geste inachevé est écarté (les cases "1" ne sont jamais sauvegardées) ;
  le combo repart de zéro (il n'a de sens que dans sa fenêtre de 1,8 s).

  Quand :
  - scheduleRunSave() : différée de RUN_SAVE_DELAY_MS après chaque coup,
    apparition d'obstacle, reprise... — hors du chemin critique du geste ;
    les appels rapprochés fusionnent en une seule écriture ;
  - persistRunNow() : immédiate quand l'app passe en arrière-plan
    (App.bindVisibility), quand on quitte l'écran de jeu (Game.stop) ;
    elle EFFACE la sauvegarde si la partie est terminée (rien à reprendre
    d'un plateau bloqué) ;
  - jamais pendant le tutoriel.

  Restauration : Game.start() appelle restoreSavedRun() une seule fois
  par lancement, juste après reset() (qui initialise proprement tout
  l'état d'animation) ; un instantané invalide ou incohérent est ignoré
  et la partie démarre normalement.
  --------------------------------------------------------------------
*/
import { Game } from "./game-state.js";
import { Storage } from "../services/storage.js";
import { Tutorial } from "../ui/tutorial.js";

const SNAPSHOT_VERSION = 1;
const MAX_ELAPSED_MS = 6 * 60 * 60 * 1000;

Object.assign(Game, {
  RUN_SAVE_DELAY_MS: 600,
  _runSaveTimer: null,
  _restoreTried: false,

  scheduleRunSave() {
    if (Tutorial.active || this._runSaveTimer) return;

    this._runSaveTimer = setTimeout(() => {
      this._runSaveTimer = null;
      this.persistRunNow();
    }, this.RUN_SAVE_DELAY_MS);
  },

  persistRunNow() {
    if (this._runSaveTimer) {
      clearTimeout(this._runSaveTimer);
      this._runSaveTimer = null;
    }

    if (Tutorial.active || !this.runActive) return;

    if (this.gameOver) {
      Storage.clearRun();
      return;
    }

    Storage.saveRun(this.buildRunSnapshot());
  },

  buildRunSnapshot() {
    const cells = [];
    const colors = {};

    for (let y = 0; y < this.SIZE; y++) {
      const row = [];

      for (let x = 0; x < this.SIZE; x++) {
        let value = this.cells[y][x];

        // Cases du tracé en cours (valeur 1) : jamais sauvegardées.
        if (value === 1) value = 0;

        row.push(value);

        if (value === 2) {
          const color = this.cellColors[this.cellKey(x, y)];
          if (color) colors[`${x},${y}`] = color;
        }
      }

      cells.push(row);
    }

    return {
      v: SNAPSHOT_VERSION,
      savedAt: Date.now(),
      cells,
      colors,
      score: this.score,
      turn: this.turn,
      totalCleared: this.totalCleared,
      required: this.requiredBlocks,
      queue: this.queue.slice(0, 3),
      turnColor: this.turnColor ? this.turnColor.name : null,
      elapsed: Math.max(0, this.gameNow - this.runStartAt),
      perfectClears: this.perfectClearsThisRun,
      bestAtRunStart: this.bestAtRunStart,
      runCoins: this.runCoinsEarned
    };
  },

  isValidSnapshot(snap) {
    if (!snap || snap.v !== SNAPSHOT_VERSION) return false;
    if (!Array.isArray(snap.cells) || snap.cells.length !== this.SIZE) return false;

    const rowsOk = snap.cells.every(row =>
      Array.isArray(row) &&
      row.length === this.SIZE &&
      row.every(value => value === 0 || value === 2 || value === 3)
    );

    return rowsOk && Number.isFinite(snap.score) && Number.isFinite(snap.turn);
  },

  // À appeler juste après reset() : reprend la partie sauvegardée, une
  // seule fois par lancement. Retourne true si une partie a été reprise.
  restoreSavedRun() {
    if (this._restoreTried) return false;
    this._restoreTried = true;

    if (Tutorial.active) return false;

    const snap = Storage.getRun();

    if (!this.isValidSnapshot(snap)) {
      if (snap) Storage.clearRun();
      return false;
    }

    // Plateau + couleurs
    this.cells = snap.cells.map(row => row.slice());
    this.cellColors = {};

    for (let y = 0; y < this.SIZE; y++) {
      for (let x = 0; x < this.SIZE; x++) {
        if (this.cells[y][x] !== 2) continue;

        const name = snap.colors && snap.colors[`${x},${y}`];
        this.cellColors[this.cellKey(x, y)] = this.COLOR_BANK.some(c => c.name === name) ? name : this.COLOR_BANK[0].name;
      }
    }

    // Progression
    this.score = Math.max(0, Math.floor(snap.score));
    this.displayedScore = this.score;
    this.turn = Math.max(1, Math.floor(snap.turn));
    this.totalCleared = Math.max(0, Math.floor(snap.totalCleared) || 0);
    this.perfectClearsThisRun = Math.max(0, Math.floor(snap.perfectClears) || 0);
    this.runCoinsEarned = Math.max(0, Math.floor(snap.runCoins) || 0);

    if (Number.isFinite(snap.bestAtRunStart)) this.bestAtRunStart = snap.bestAtRunStart;

    // Bloc demandé + file d'attente
    const validLen = n => Number.isInteger(n) && n >= 1 && n <= 6;

    if (validLen(snap.required)) this.requiredBlocks = snap.required;

    if (Array.isArray(snap.queue) && snap.queue.length === 3 && snap.queue.every(validLen)) {
      this.queue = snap.queue.slice();
    }

    const color = this.COLOR_BANK.find(c => c.name === snap.turnColor);
    if (color) this.turnColor = color;

    // Cadence des obstacles : reprend au temps de jeu déjà écoulé.
    const elapsed = Math.min(MAX_ELAPSED_MS, Math.max(0, Number(snap.elapsed) || 0));
    this.runStartAt = this.gameNow - elapsed;
    this.scheduleObstacleSpawn();

    this.combo = 0;
    this.path = [];

    const scoreEl = document.getElementById("currentScore");
    if (scoreEl) scoreEl.textContent = String(this.score);

    // Défensif : un plateau restauré doit toujours offrir un coup jouable.
    this.ensurePlayable();
    this.updateHUD();
    this.checkGameOver();

    return true;
  }
});
