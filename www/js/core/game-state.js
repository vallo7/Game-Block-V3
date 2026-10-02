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
import { GRID, COLOR_BANK, STONE_COLOR, ICE_COLOR, EFFECTS_LIMITS, ADS, PERFORMANCE } from "../config/gameConfig.js";
import { Storage } from "../services/storage.js";
import { Theme } from "../services/theme.js";
import { VisualTheme } from "../services/visualtheme.js";
import { GameAudio } from "../services/audio.js";
import { Ads } from "../services/ads.js";
import { Environments } from "../services/environment.js";
import { Achievements } from "../services/achievements.js";
import { Quests } from "../services/quests.js";

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

  // Coins gagnés pendant la partie en cours (Perfect Clear) : consommés
  // par core/game-flow.js#startGameOver pour proposer la roue de la
  // chance AVANT le panneau de défaite (V2). Sauvegardé avec la partie.
  runCoinsEarned: 0,

  // Gouverneur de qualité adaptatif (config/gameConfig.js#PERFORMANCE) :
  // 0 = rendu complet, 1 = sans lumières ambiantes/respiration des
  // blocs, 2 = en plus résolution du canvas plafonnée. Persisté pour
  // qu'un appareil modeste démarre directement au bon niveau.
  quality: 0,
  _perfSum: 0,
  _perfFrames: 0,
  _perfWindowStart: 0,
  _perfIgnoreUntil: 0,

  // Rectangle du canvas mis en cache (voir core/game-input.js#getCanvasRect).
  canvasRect: null,
  _rectAt: 0,

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
    // fichier. Tous les environnements partagent désormais la même
    // grille (services/environment.js#SHARED_GRID_ASSET) : les Image
    // sont donc dédupliquées par URL — une seule requête, un seul
    // bitmap décodé en mémoire, réutilisé par chaque id d'environnement
    // (core/game-render.js#drawBoard lit gridImages[env.id] tel quel).
    this.gridImages = {};
    const gridImagesBySrc = {};
    Object.values(Environments).forEach(env => {
      const src = env.assets.grid;

      if (!gridImagesBySrc[src]) {
        const img = new Image();
        img.src = src;
        gridImagesBySrc[src] = img;
      }

      this.gridImages[env.id] = gridImagesBySrc[src];
    });

    // Table des clés "x,y" construite une fois pour toutes : drawCells()
    // & co. tournent à CHAQUE frame et fabriquaient auparavant des
    // dizaines de chaînes par image (template literals) — du travail
    // inutile pour le ramasse-miettes, source de micro-saccades.
    this.cellKeys = [];
    for (let y = 0; y < this.SIZE; y++) {
      for (let x = 0; x < this.SIZE; x++) {
        this.cellKeys.push(`${x},${y}`);
      }
    }

    this.quality = Math.min(PERFORMANCE.MAX_LEVEL, Storage.getQuality());

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

    // Round performance : ces éléments étaient jusqu'ici re-cherchés via
    // getElementById/querySelectorAll à CHAQUE coup validé (validate()
    // tourne sur chaque tracé posé, pas seulement sur les gros coups) —
    // un coût qui se répète des centaines de fois sur une longue partie
    // pour rien, puisque ces nœuds sont statiques dans le markup et ne
    // sont jamais recréés. Mis en cache ici comme le reste ci-dessus.
    this.comboBadgeLabelEl = this.comboBadgeEl ? this.comboBadgeEl.querySelector(".combo-badge-label") : null;
    this.comboMeterFillEl = document.getElementById("comboMeterFill");
    this.perfectRunGaugeEl = document.getElementById("perfectRunGauge");
    this.perfectRunPips = this.perfectRunGaugeEl ? this.perfectRunGaugeEl.querySelectorAll(".prg-pip") : [];

    // Mouvement individuel des éléments de l'écran de jeu
    // (core/game-motion.js).
    this.initMotion();

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

      const rawDelta = now - (this.lastFrame ?? now);
      const clampedDelta = Math.min(50, rawDelta);
      this.lastFrame = now;

      // Pas de temps lissé (round fluidité) : les horodatages de
      // requestAnimationFrame d'un WebView Android oscillent de quelques
      // millisecondes d'une image à l'autre, ce qui se voit comme un léger
      // "tremblement" de tout ce qui avance au temps de jeu. Lisser le pas
      // (moyenne mobile exponentielle, non biaisée : le temps total est
      // conservé) donne un défilement régulier sans modifier la durée des
      // animations.
      const realDelta = this.smoothFrameDelta(clampedDelta);

      this.timeScale += (1 - this.timeScale) * Math.min(1, realDelta / 260);
      this.gameNow += realDelta * this.timeScale;

      if (this.active) {
        try {
          this.update(realDelta);
          this.draw();
          this.sampleFramePerf(rawDelta, now);
        } catch (error) {
          // garde-fou : le loop ne meurt jamais — l'erreur est
          // maintenant tracée (round diagnostic performance) plutôt
          // qu'avalée en silence, pour qu'un problème intermittent
          // laisse une trace exploitable au lieu de disparaître sans
          // explication.
          console.error("Game loop error:", error);
        }
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  },

  _dtSmooth: 0,

  smoothFrameDelta(dt) {
    if (dt <= 0) return 0;

    // Première image, reprise après une longue pause ou gros à-coup : on
    // repart de la mesure brute plutôt que de la lisser.
    if (!this._dtSmooth || dt > 40 || this._dtSmooth > 40) {
      this._dtSmooth = dt;
      return dt;
    }

    this._dtSmooth += (dt - this._dtSmooth) * 0.4;
    return this._dtSmooth;
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
    this._dtSmooth = 0;

    // Appareil lent (qualité 2) : le fond vidéo éventuel reste sur son
    // image fixe pendant la partie (services/visualtheme.js).
    VisualTheme.setVideoPaused("quality", this.quality >= 2);

    // Les premières secondes (chargement des textures, transition
    // d'écran) ne comptent pas dans la mesure de performance.
    this._perfIgnoreUntil = performance.now() + 3000;

    if (!this.runActive) {
      this.reset();

      // Reprise de la partie sauvegardée au lancement de l'app
      // (core/game-persist.js) : sans effet après la 1ʳᵉ fois, pendant le
      // tutoriel, ou s'il n'y a rien à reprendre.
      this.restoreSavedRun();
    }
  },

  // Gouverneur de qualité : mesure le temps de frame réel PENDANT le jeu ;
  // si la moyenne d'une fenêtre dépasse SLOW_FRAME_MS, baisse d'un cran la
  // qualité (jamais l'inverse dans la session, pour éviter l'effet
  // yo-yo). Les images anormalement longues (pause, onglet masqué,
  // publicité) sont ignorées.
  sampleFramePerf(delta, now) {
    if (delta <= 0 || delta > 250) return;
    if (now < this._perfIgnoreUntil) return;

    if (this._perfFrames === 0) this._perfWindowStart = now;

    this._perfSum += delta;
    this._perfFrames += 1;

    if (now - this._perfWindowStart < PERFORMANCE.WINDOW_MS) return;

    const average = this._perfSum / this._perfFrames;

    this._perfSum = 0;
    this._perfFrames = 0;

    if (average > PERFORMANCE.SLOW_FRAME_MS && this.quality < PERFORMANCE.MAX_LEVEL) {
      this.setQuality(this.quality + 1, now);
    }
  },

  setQuality(level, now) {
    this.quality = Math.max(0, Math.min(PERFORMANCE.MAX_LEVEL, level));
    Storage.saveQuality(this.quality);
    VisualTheme.setVideoPaused("quality", this.quality >= 2);

    // Laisse la nouvelle configuration se stabiliser avant de re-mesurer.
    this._perfIgnoreUntil = (now || performance.now()) + PERFORMANCE.SETTLE_MS;

    this.resize();
  },

  stop() {
    this.active = false;
    VisualTheme.setVideoPaused("quality", false);
    this.persistRunNow();
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

    // Cf. services/achievements.js : bestAtRunStart capture le record
    // AVANT cette partie, pour détecter un "nouveau record" une seule
    // fois par run (addBestBeaten) plutôt qu'à chaque coup qui dépasse
    // l'ancien best en cours de route ; perfectClearsThisRun alimente la
    // filière de déblocage d'Halloween (Perfect Clear x3 dans la même
    // partie, cf. core/game-rules.js).
    this.bestAtRunStart = this.best;
    this.perfectClearsThisRun = 0;

    // Quêtes (8e passe) : marque le début de cette partie pour que les
    // quêtes score/combo n'acceptent que des parties démarrées après la
    // participation du joueur (services/quests.js#markRunStart).
    Quests.markRunStart();

    if (typeof VisualTheme !== "undefined" && VisualTheme.current) {
      Achievements.checkThemePlayed(VisualTheme.current.id);
    }

    this.combo = 0;
    this.comboUntil = 0;
    this.praiseUntil = 0;
    this.timeScale = 1;
    this.sequenceRunning = false;
    this.runCoinsEarned = 0;

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
    this.motionReset();

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
    this.scheduleRunSave();
  },

  bindEvents() {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (!this.active || this.gameOver) return;

      event.preventDefault();

      GameAudio.unlock();

      this.canvas.setPointerCapture(event.pointerId);

      this.sanitizeStroke();

      // Une seule mesure "fraîche" du canvas par geste ; les mouvements
      // suivants réutilisent le rectangle en cache (cf. getCanvasRect).
      this.refreshCanvasRect();

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
    //
    // V2 (monétisation 100 % pub) : les deux boosts qui gardent le score
    // s'obtiennent en regardant des pubs récompensées — SECOND WIND = 1
    // pub (ADS.SECOND_WIND_ADS), FRESH START = 2 pubs enchaînées
    // (ADS.FRESH_START_ADS, plus aucun coût en Coins). Le suivi des
    // quêtes "regarder des pubs" est fait par Ads.showRewarded lui-même.

    // SECOND WIND : comportement de revive() inchangé (ne nettoie que les
    // blocs de pierre/glace, garde le score).
    this.on("secondWindBtn", () => this.startAdBoost(ADS.SECOND_WIND_ADS, () => this.revive()));

    // FRESH START : Game.freshBoard() — vide tout le plateau (contrairement
    // à revive() qui ne touche qu'aux blocs spéciaux) mais garde, elle
    // aussi, le score et le combo en cours.
    this.on("freshBoardBtn", () => this.startAdBoost(ADS.FRESH_START_ADS, () => this.freshBoard()));

    // NEW GAME : séquence de redémarrage animée inchangée (+ pub selon
    // ADS.NEW_GAME_CHANCE, quasi systématique — c'est le point de rupture
    // le plus naturel pour un interstitiel, distinct du Restart occasionnel
    // de la pause qui garde ADS.RESTART_CHANCE). On attend la fin du cycle
    // pub (s'il y en a un) avant de relancer la séquence, pour ne jamais
    // faire tourner le redémarrage pendant qu'une pub est encore en train
    // de mettre le jeu/son en pause.
    this.on("newGameBtn", async () => {
      if (this.gameOverActionLock) return;
      this.gameOverActionLock = true;

      GameAudio.playClick();

      await Ads.maybeShowInterstitial(ADS.NEW_GAME_CHANCE);

      this.startNewGameSequence();
    });

    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => {
      setTimeout(() => this.resize(), 120);
    });
  },

  // Lance un boost du panneau de défaite après `adCount` pubs
  // récompensées. Hors-ligne : simple message, rien n'est verrouillé.
  startAdBoost(adCount, onGranted) {
    if (this.gameOverActionLock) return;

    GameAudio.playClick();

    if (!Ads.isOnline()) {
      Ads.showOfflineMessage();
      return;
    }

    this.gameOverActionLock = true;
    this.stopCountdown();

    Ads.showRewarded(onGranted, { count: adCount }).then((started) => {
      // Une autre séquence de pubs était déjà en cours : on rouvre le
      // panneau tel quel (nouveau décompte) au lieu de le laisser figé.
      if (!started) {
        this.gameOverActionLock = false;
        this.openGameOverPanel();
      }
    });
  },

  updatePointer(event, active) {
    const rect = this.getCanvasRect();

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
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);

    // Qualité 2 du gouverneur : résolution du canvas plafonnée.
    return this.quality >= 2 ? Math.min(dpr, PERFORMANCE.LOW_DPR) : dpr;
  },

  resize() {
    if (!this.canvas) return;

    const dpr = this.getDpr();
    const rect = this.canvas.getBoundingClientRect();

    const size = Math.floor(rect.width * dpr);

    // Ne touche à la taille du canvas que si elle change réellement :
    // réassigner width/height (même à l'identique) réalloue le tampon et
    // efface tout — inutile à chaque callback de ResizeObserver.
    if (size > 0 && (this.canvas.width !== size || this.canvas.height !== size)) {
      this.canvas.width = size;
      this.canvas.height = size;
      this.invalidateRenderCaches();
    }

    this.canvasRect = rect;
    this._rectAt = performance.now();
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
    this.updateMotion(realDelta);
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
