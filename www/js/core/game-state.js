/*
  core/game-state.js
  --------------------------------------------------------------------
  État partagé du jeu + cycle de vie (init, resize, bindEvents, reset).
  Ce module est le socle sur lequel les 6 autres core/game-*.js
  viennent greffer leurs méthodes via Object.assign(Game, {...}) :
  Game reste UN SEUL objet partagé, seule son implémentation est
  répartie dans plusieurs fichiers à responsabilité unique
  (roadmap §5). Aucun changement de comportement par rapport à
  l'ancien js/game.js : uniquement une réorganisation.
  --------------------------------------------------------------------
*/
import { GRID, COLOR_BANK, STONE_COLOR, ICE_COLOR, EFFECTS_LIMITS, ADS } from "../config/gameConfig.js";
import { Storage } from "../services/storage.js";
import { Theme } from "../services/theme.js";
import { VisualTheme } from "../services/visualtheme.js";
import { GameAudio } from "../services/audio.js";
import { Ads } from "../services/ads.js";

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
  boardCache: null,
  boardCacheKey: "",

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

    this.best = Storage.getBest();
    this.displayedBest = this.best;

    const bestEl = document.getElementById("bestScoreValue");
    if (bestEl) bestEl.textContent = this.best;

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
    // qu'au tout premier démarrage.
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

    // Bouton CONTINUER (pub) : plus gros / mis en avant dans le pop-up
    this.on("adsBtn", () => {
      GameAudio.playClick();

      if (!Ads.isOnline()) {
        Ads.showOfflineMessage();
        return;
      }

      this.stopCountdown();

      Ads.showRewarded(() => {
        this.revive();
      });
    });

    // Bouton RESTART : séquence de redémarrage animée (+ pub selon
    // ADS.RESTART_CHANCE). On attend la fin du cycle pub (s'il y en a
    // un) avant de relancer la séquence, pour ne jamais faire tourner
    // le redémarrage pendant qu'une pub est encore en train de mettre
    // le jeu/son en pause.
    this.on("restartBtn", async () => {
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

  ensureCanvasSize() {
    const dpr = this.getDpr();
    const target = Math.floor(this.canvas.clientWidth * dpr);

    if (target > 0 && this.canvas.width !== target) {
      this.canvas.width = target;
      this.canvas.height = target;
    }
  },

  update(realDelta) {
    this.ensureCanvasSize();

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

      if (this.bestEl) this.bestEl.textContent = this.displayedBest;
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
  }
};
