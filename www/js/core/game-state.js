/*
  core/game-state.js
  --------------------------------------------------------------------
  État partagé du jeu + cycle de vie (init, resize, bindEvents, reset).
  Ce module est le socle sur lequel les 6 autres core/game-*.js
  viennent greffer leurs méthodes via Object.assign(Game, {...}) :
  Game reste UN SEUL objet partagé, seule son implémentation est
  répartie dans plusieurs fichiers à responsabilité unique.

  Précharge un asset de grille par environnement (roadmap §3.2) dans
  `gridImages`, consommé par core/game-render.js#drawBoard(), qui
  cadre chaque grille via GRID_OUTER_CROP (cadre extérieur visible,
  round "dézoom") et décale la zone de jeu via GRID_CELL_RECT (voir
  game-render.js) pour un alignement pixel-perfect avec les blocs.
  --------------------------------------------------------------------
*/
import { GRID, COLOR_BANK, STONE_COLOR, ICE_COLOR, EFFECTS_LIMITS, ADS } from "../config/gameConfig.js";
import { Storage } from "../services/storage.js";
import { Theme } from "../services/theme.js";
import { VisualTheme } from "../services/visualtheme.js";
import { GameAudio } from "../services/audio.js";
import { Ads } from "../services/ads.js";
import { Environments } from "../services/environment.js";

export const Game = {
  SIZE: GRID.SIZE,

  canvas: null,
  ctx: null,

  active: false,
  runActive: false,
  gameOver: false,
  drawing: false,
  strokeStarted: false,
  sequenceRunning: false,

  // Phase 8 (Second Chance) : verrou partagé entre les 3 boutons du
  // panneau de fin de partie (SECOND WIND / FRESH START / NEW GAME) et
  // le timeout du countdown. Empêche qu'un double-tap ou qu'un tap
  // pendant le court aller-retour asynchrone de showRewarded() ne
  // déclenche deux actions de reprise en même temps. Levé par reset()
  // (chemin NEW GAME) et explicitement en fin de revive()/freshBoard().
  gameOverActionLock: false,

  cells: [],
  path: [],

  score: 0,
  displayedScore: 0,
  best: 0,
  displayedBest: 0,
  turn: 1,
  totalCleared: 0,

  requiredBlocks: 3,
  queue: [],

  combo: 0,
  comboUntil: 0,
  praiseUntil: 0,

  timeScale: 1,
  lastFrame: null,
  gameNow: 0,

  pointer: { x: 0, y: 0, active: false },

  countdown: 0,
  countdownTimer: null,
  freezeTimeout: null,
  popupTimeout: null,

  nextObstacleAt: null,
  pendingObstacles: [],
  runStartAt: 0,

  colorFx: null,
  freezeFx: null,
  freezeDelays: {},
  lightWave: null,
  blockShake: null,
  afterGlow: null,
  lineBeams: [],

  cellAnims: {},
  cancelAnims: {},
  destroyAnims: [],
  cellFlashes: [],
  floatingTexts: [],
  particles: [],
  debris: [],
  shockwaves: [],
  lineFlashes: [],

  frameGradients: {},
  glowCache: {},

  MAX_PARTICLES: EFFECTS_LIMITS.MAX_PARTICLES,
  MAX_DEBRIS: EFFECTS_LIMITS.MAX_DEBRIS,

  lastInvalidKey: null,
  lastInvalidTime: 0,

  COLOR_BANK,
  STONE_COLOR,
  ICE_COLOR,

  init() {
    this.canvas = document.getElementById("gameCanvas");
    // Le plateau recouvre toujours tout le canvas avec une couleur opaque.
    // Déclarer ce fait au navigateur évite une composition alpha inutile sur
    // les WebViews Android sans modifier le rendu visible.
    this.ctx = this.canvas.getContext("2d", { alpha: false });

    this.blockImages = {};
    ["blue", "yellow", "green", "purple", "pink", "stone", "ice"].forEach(name => {
      const img = new Image();
      img.src = `img/blocks/block-${name}.png`;
      this.blockImages[name] = img;
    });

    // Grille : un asset par environnement (roadmap §3.2). La liste se
    // déduit du registre Environments, donc un futur environnement
    // ajouté là-bas est automatiquement précargé ici sans toucher à ce
    // fichier.
    this.gridImages = {};
    Object.values(Environments).forEach(env => {
      const img = new Image();
      img.src = env.assets.grid;
      this.gridImages[env.id] = img;
    });

    this.best = Storage.getBest();
    this.displayedBest = this.best;

    const bestEl = document.getElementById("bestScoreValue");
    if (bestEl) {
      bestEl.textContent = this.best;
      this.fitBestScoreText(bestEl, this.best);
    }

    if (!document.getElementById("praiseBadge")) {
      const el = document.createElement("div");
      el.id = "praiseBadge";
      el.className = "praise-badge hidden";
      const zone =
        document.getElementById("feedbackZone") ||
        document.querySelector(".board-shell");
      if (zone) zone.appendChild(el);
    }

    // Références DOM mises en cache une bonne fois pour toutes : évite de
    // refaire ces lookups à chaque frame dans update() (optimisation pure,
    // aucun changement de rendu ni de mécanique).
    this.scoreEl = document.getElementById("currentScore");
    this.bestEl = document.getElementById("bestScoreValue");
    this.comboBadgeEl = document.getElementById("comboBadge");
    this.praiseBadgeEl = document.getElementById("praiseBadge");

    this.bindEvents();
    this.resize();

    // Round performance : la resynchronisation de la taille du canvas
    // ne se fait plus par sondage à CHAQUE frame (ensureCanvasSize()
    // lisait canvas.clientWidth 60 fois/seconde, une lecture qui force
    // un recalcul de layout synchrone si le style a changé depuis —
    // un classique "layout thrashing", ici combiné aux nombreux
    // redémarrages d'animation CSS du jeu qui forcent eux-mêmes un
    // reflow via `void el.offsetWidth`). ResizeObserver ne réagit
    // qu'aux changements réels de taille, sans coût quand rien ne
    // bouge — resize()/orientationchange couvrent déjà les rotations
    // d'écran ; ResizeObserver couvre tout le reste (ex. --board-size
    // qui change de valeur via une media query).
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this.resize());
      this._resizeObserver.observe(this.canvas);
    }

    const tick = (now) => {
      if (this.paused) {
        this.lastFrame = now;
        requestAnimationFrame(tick);
        return;
      }

      const realDelta = Math.min(50, now - (this.lastFrame ?? now));
      this.lastFrame = now;

      this.timeScale += (1 - this.timeScale) * Math.min(1, realDelta / 260);
      this.gameNow += realDelta * this.timeScale;

      if (this.active) {
        try {
          this.update(realDelta);
          this.draw();
        } catch (error) {
          // garde-fou : le loop ne meurt jamais
        }
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  },

  pause() {
    this.paused = true;
  },

  resume() {
    this.paused = false;
  },

  on(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", handler);
    return el;
  },

  start() {
    this.active = true;
    this.lastFrame = null;

    if (!this.runActive) {
      this.reset();
    }
  },

  stop() {
    this.active = false;
    this.stopCountdown();
    this.clearDefeatTimeouts();
    this.clearObstacleTimer();
    this.unlockUI();
    this.cancelPath(false);
  },

  clearDefeatTimeouts() {
    if (this.freezeTimeout) {
      clearTimeout(this.freezeTimeout);
      this.freezeTimeout = null;
    }
    if (this.popupTimeout) {
      clearTimeout(this.popupTimeout);
      this.popupTimeout = null;
    }
  },

  lockUI() {
    document.body.classList.add("locked");
  },

  unlockUI() {
    document.body.classList.remove("locked");
  },

  reset() {
    this.cells = Array.from({ length: this.SIZE }, () => Array(this.SIZE).fill(0));
    this.cellColors = {};
    this.turnColor = null;
    this.stoneSeeds = {};

    // Couleur de grille par défaut du thème visuel actif, à chaque
    // nouvelle partie (démarrage ou restart) : reset() est le point
    // commun aux deux cas, contrairement à App.showGame() qui ne tourne
    // qu'au tout premier démarrage. Cette teinte ne change plus jamais
    // en cours de partie (le système de changement de couleur de
    // grille a été retiré) : elle reste celle-ci du début à la fin de
    // la partie.
    if (typeof VisualTheme !== "undefined" && VisualTheme.current && VisualTheme.current.startColor) {
      Theme.setGridOverride(VisualTheme.current.startColor);
    } else if (typeof Theme !== "undefined") {
      Theme.clearGridOverride();
    }

    this.path = [];
    this.score = 0;
    this.displayedScore = 0;
    this.turn = 1;
    this.totalCleared = 0;

    this.combo = 0;
    this.comboUntil = 0;
    this.praiseUntil = 0;
    this.timeScale = 1;
    this.sequenceRunning = false;

    this.gameOver = false;
    this.drawing = false;
    this.strokeStarted = false;
    this.runActive = true;
    this.gameOverActionLock = false;

    // Phase 12/13 — remise à zéro des habillages liés au combo à chaque
    // nouvelle partie (redémarrage complet uniquement : revive() et
    // freshBoard() ne passent jamais par reset(), donc ne touchent pas
    // à une run de Perfect Run en cours, cohérent avec "garde ton score").
    this.stopComboMeter();
    this.resetPerfectRunGauge();

    this.stopCountdown();
    this.clearDefeatTimeouts();
    this.unlockUI();

    this.colorFx = null;
    this.freezeFx = null;
    this.freezeDelays = {};
    this.lightWave = null;
    this.blockShake = null;
    this.afterGlow = null;
    this.lineBeams = [];
    this.cellAnims = {};
    this.cancelAnims = [];
    this.destroyAnims = [];
    this.cellFlashes = [];
    this.floatingTexts = [];
    this.particles = [];
    this.debris = [];
    this.shockwaves = [];
    this.lineFlashes = [];

    this.runStartAt = this.gameNow;
    this.pendingObstacles = [];
    this.nextObstacleAt = null;

    this.queue = [];
    for (let i = 0; i < 3; i++) {
      this.queue.push(this.generateRequiredBlocks());
    }

    this.setupNextBlock();

    const over = document.getElementById("gameOverOverlay");
    if (over) over.classList.add("hidden");

    const badge = document.getElementById("comboBadge");
    if (badge) badge.classList.add("hidden");

    const praise = document.getElementById("praiseBadge");
    if (praise) praise.classList.add("hidden");

    const screen = document.getElementById("gameScreen");
    if (screen) screen.classList.remove("quake");

    const scoreEl = document.getElementById("currentScore");
    if (scoreEl) scoreEl.textContent = "0";

    this.updateHUD();
    this.scheduleObstacleSpawn();
  },

  bindEvents() {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (!this.active || this.gameOver) return;

      event.preventDefault();

      GameAudio.unlock();

      this.canvas.setPointerCapture(event.pointerId);

      this.sanitizeStroke();

      const cell = this.getCellFromEvent(event);
      this.updatePointer(event, true);

      if (!cell) return;

      this.drawing = true;
      this.strokeStarted = this.tryStart(cell);
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.active) return;

      this.updatePointer(event, this.drawing);

      if (!this.drawing || !this.strokeStarted || this.gameOver) return;

      event.preventDefault();

      const cell = this.getCellFromEvent(event);
      if (!cell) return;

      this.tryContinue(cell);
    });

    this.canvas.addEventListener("pointerup", (event) => {
      if (!this.active || !this.drawing) return;

      event.preventDefault();

      this.drawing = false;
      this.strokeStarted = false;
      this.pointer.active = false;

      if (this.gameOver) return;

      if (this.path.length === this.requiredBlocks) {
        this.validate();
      } else {
        this.cancelIncomplete();
      }
    });

    this.canvas.addEventListener("pointercancel", () => {
      if (!this.active) return;

      this.pointer.active = false;
      this.cancelPath(false);
    });

    // Phase 8 (Second Chance) : 3 boutons de boost, protégés par le même
    // verrou (gameOverActionLock) pour qu'un double-tap ne puisse jamais
    // faire partir deux actions de reprise à la fois.

    // SECOND WIND (pub récompensée) : comportement de revive() inchangé
    // (ne nettoie que les blocs de pierre/glace, garde le score).
    this.on("secondWindBtn", () => {
      if (this.gameOverActionLock) return;

      GameAudio.playClick();

      if (!Ads.isOnline()) {
        Ads.showOfflineMessage();
        return;
      }

      this.gameOverActionLock = true;
      this.stopCountdown();

      Ads.showRewarded(() => {
        this.revive();
      });
    });

    // FRESH START (pub récompensée) : Game.freshBoard() — vide tout le
    // plateau (contrairement à revive() qui ne touche qu'aux blocs
    // spéciaux) mais garde, elle aussi, le score et le combo en cours.
    this.on("freshBoardBtn", () => {
      if (this.gameOverActionLock) return;

      GameAudio.playClick();

      if (!Ads.isOnline()) {
        Ads.showOfflineMessage();
        return;
      }

      this.gameOverActionLock = true;
      this.stopCountdown();

      Ads.showRewarded(() => {
        this.freshBoard();
      });
    });

    // NEW GAME : séquence de redémarrage animée inchangée (+ pub selon
    // ADS.RESTART_CHANCE, désormais réduite — Phase 7). On attend la fin
    // du cycle pub (s'il y en a un) avant de relancer la séquence, pour
    // ne jamais faire tourner le redémarrage pendant qu'une pub est
    // encore en train de mettre le jeu/son en pause.
    this.on("newGameBtn", async () => {
      if (this.gameOverActionLock) return;
      this.gameOverActionLock = true;

      GameAudio.playClick();

      await Ads.maybeShowInterstitial(ADS.RESTART_CHANCE);

      this.startNewGameSequence();
    });

    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => {
      setTimeout(() => this.resize(), 120);
    });
  },

  updatePointer(event, active) {
    const rect = this.canvas.getBoundingClientRect();

    this.pointer.x = ((event.clientX - rect.left) / rect.width) * this.canvas.width;
    this.pointer.y = ((event.clientY - rect.top) / rect.height) * this.canvas.height;
    this.pointer.active = active;
  },

  sanitizeStroke() {
    for (let y = 0; y < this.SIZE; y++) {
      for (let x = 0; x < this.SIZE; x++) {
        if (this.cells[y][x] === 1) {
          this.cells[y][x] = 0;
        }
      }
    }

    this.path = [];
  },

  getDpr() {
    return Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
  },

  resize() {
    if (!this.canvas) return;

    const dpr = this.getDpr();
    const rect = this.canvas.getBoundingClientRect();

    const size = Math.floor(rect.width * dpr);

    if (size > 0) {
      this.canvas.width = size;
      this.canvas.height = size;
    }
  },

  update(realDelta) {
    if (this.displayedScore !== this.score) {
      const diff = this.score - this.displayedScore;
      const step = Math.max(1, Math.ceil(Math.abs(diff) * 0.16));

      this.displayedScore += diff > 0 ? step : -step;

      if (this.scoreEl) this.scoreEl.textContent = this.displayedScore;
    }

    if (this.displayedBest !== this.best) {
      const diff = this.best - this.displayedBest;
      const step = Math.max(1, Math.ceil(Math.abs(diff) * 0.16));

      this.displayedBest += diff > 0 ? step : -step;

      if (this.bestEl) {
        this.bestEl.textContent = this.displayedBest;
        this.fitBestScoreText(this.bestEl, this.displayedBest);
      }
    }

    if (this.comboBadgeEl && !this.comboBadgeEl.classList.contains("hidden") && this.gameNow > this.comboUntil) {
      this.comboBadgeEl.classList.add("hidden");
    }

    if (this.praiseBadgeEl && !this.praiseBadgeEl.classList.contains("hidden") && this.gameNow > this.praiseUntil) {
      this.praiseBadgeEl.classList.add("hidden");
    }

    this.updateObstacleSpawner();
  },

  pickTurnColor() {
    const bank = this.COLOR_BANK;
    const current = Math.floor(Math.random() * bank.length);

    if (this.turnColor) {
      const currentIndex = bank.findIndex(c => c.name === this.turnColor.name);
      if (currentIndex === current) {
        return bank[(current + 1) % bank.length];
      }
    }

    return bank[current];
  },

  getFillRatio() {
    let filled = 0;

    for (let y = 0; y < this.SIZE; y++) {
      for (let x = 0; x < this.SIZE; x++) {
        if (this.cells[y][x] !== 0) filled++;
      }
    }

    return filled / (this.SIZE * this.SIZE);
  },

  shuffleArray(array) {
    const copy = [...array];

    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
  },

  // Bouton "meilleur score" (nouveaux assets border-image, roadmap
  // design round) : c'est le TEXTE qui rétrécit pour ne jamais déborder
  // du bouton, le bouton lui-même reste en largeur intrinsèque (padding
  // CSS) et suit donc naturellement la taille du texte. Palier par
  // nombre de chiffres plutôt qu'une mesure DOM (pas de reflow forcé,
  // appelé à chaque frame où le score affiché change).
  BEST_SCORE_FONT_STEPS: [
    { max: 4, size: 20 },
    { max: 5, size: 18 },
    { max: 6, size: 16 },
    { max: 7, size: 14 },
    { max: Infinity, size: 12 }
  ],

  fitBestScoreText(el, value) {
    if (!el) return;

    const digits = String(value).length;
    const step = this.BEST_SCORE_FONT_STEPS.find(s => digits <= s.max) || this.BEST_SCORE_FONT_STEPS[this.BEST_SCORE_FONT_STEPS.length - 1];

    el.style.fontSize = step.size + "px";
  }
};
