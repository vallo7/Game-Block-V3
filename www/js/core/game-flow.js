/*
  core/game-flow.js
  --------------------------------------------------------------------
  Séquence de fin de partie : détection (checkGameOver), gel des blocs
  (startFreeze), panneau + countdown (startGameOver), revive via pub
  récompensée, et redémarrage animé (startNewGameSequence). Point
  d'extension naturel pour le futur "Second Chance" et le retry
  Adventure (roadmap §6 Phase 8, §2.5).
  --------------------------------------------------------------------
*/
import { Game } from "./game-state.js";
import { GAME_OVER, ADS } from "../config/gameConfig.js";
import { GameAudio } from "../services/audio.js";
import { Theme } from "../services/theme.js";
import { Storage } from "../services/storage.js";
import { Ads } from "../services/ads.js";
import { RateUs } from "../services/rateus.js";
import { Haptics } from "../services/haptics.js";
import { Achievements } from "../services/achievements.js";
import { Quests } from "../services/quests.js";

Object.assign(Game, {
  checkGameOver() {
    if (this.gameOver) return;
    if (this.hasPossibleMove()) return;

    this.gameOver = true;
    this.clearObstacleTimer();

    // Statistiques à vie (services/achievements.js) : une seule fois par
    // partie réellement terminée (checkGameOver ne dépasse jamais cette
    // ligne deux fois pour la même run, cf. le early-return tout en
    // haut). bestAtRunStart (capturé dans Game.reset()) isole "un
    // nouveau record dans CETTE run" d'un simple dépassement de score en
    // cours de route.
    Achievements.addGamePlayed();
    Quests.trackEvent("games", 1, { cumulative: true });
    if (this.score > this.bestAtRunStart) {
      Achievements.addBestBeaten();
    }

    if (this.score > this.best) {
      this.best = this.score;
      Storage.saveBest(this.best);
    }

    this.lockUI();
    this.clearDefeatTimeouts();

    this.freezeTimeout = setTimeout(() => {
      this.freezeTimeout = null;

      this.startFreeze();

      this.popupTimeout = setTimeout(() => {
        this.popupTimeout = null;
        this.startGameOver();
      }, GAME_OVER.POPUP_DELAY_MS);
    }, GAME_OVER.FREEZE_DELAY_MS);
  },

  startFreeze() {
    // Son de défaite : démarre ici, au tout début de l'animation de gel
    // des blocs.
    GameAudio.playGameOver();

    const order = this.shuffleArray(
      Array.from({ length: this.SIZE * this.SIZE }, (_, i) => i)
    );

    this.freezeDelays = {};

    order.forEach((cellIndex, position) => {
      const x = cellIndex % this.SIZE;
      const y = Math.floor(cellIndex / this.SIZE);
      const delay = position * (2800 / (this.SIZE * this.SIZE));

      this.freezeDelays[`${x},${y}`] = delay;

      setTimeout(() => {
        if (this.getDefeatOverlayStyleName() === "stone") {
          GameAudio.playBlockSpawn(position % 12);
        } else {
          GameAudio.playFreezeTick(position % 12);
        }
      }, delay);
    });

    this.freezeFx = {
      start: this.gameNow,
      duration: GAME_OVER.FREEZE_FX_DURATION_MS
    };
  },

  // Reconstruit entièrement la barre circulaire de décompte : même taille,
  // même animation et même position que l'ancienne, mais toujours un noeud
  // SVG tout neuf, pour ne jamais hériter d'un état d'un affichage
  // précédent du panneau pendant la même partie.
  buildCountdownRing() {
    const wrap = document.querySelector(".countdown-wrap");
    if (!wrap) return document.getElementById("ringFg");

    const old = wrap.querySelector(".countdown-ring");
    if (old) old.remove();

    const SVG_NS = "http://www.w3.org/2000/svg";

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "countdown-ring");
    svg.setAttribute("viewBox", "0 0 100 100");

    const bg = document.createElementNS(SVG_NS, "circle");
    bg.setAttribute("class", "ring-bg");
    bg.setAttribute("cx", "50");
    bg.setAttribute("cy", "50");
    bg.setAttribute("r", "42");

    const fg = document.createElementNS(SVG_NS, "circle");
    fg.setAttribute("id", "ringFg");
    fg.setAttribute("class", "ring-fg");
    fg.setAttribute("cx", "50");
    fg.setAttribute("cy", "50");
    fg.setAttribute("r", "42");

    svg.appendChild(bg);
    svg.appendChild(fg);

    wrap.insertBefore(svg, wrap.firstChild);

    return fg;
  },

  startGameOver() {
    const overlay = document.getElementById("gameOverOverlay");
    const countdownEl = document.getElementById("countdownValue");

    if (!overlay || !countdownEl) return;

    this.unlockUI();

    // Phase 8 : réarme le verrou des 3 boutons de boost à chaque
    // (ré)ouverture du panneau — défensif, au cas où une exécution
    // précédente n'aurait pas pu le relâcher proprement.
    this.gameOverActionLock = false;

    // Coupe d'abord tout minuteur/animation d'un éventuel affichage
    // précédent du panneau pendant cette même partie, avant de reconstruire
    // une barre toute neuve.
    this.stopCountdown();

    const ring = this.buildCountdownRing();

    overlay.classList.remove("hidden");

    this.startRingDrain(ring);
    this.playBoostCardsEntrance();

    this.countdown = GAME_OVER.COUNTDOWN_SECONDS;
    countdownEl.textContent = this.countdown;

    this.countdownTimer = setInterval(() => {
      this.countdown -= 1;

      if (this.countdown <= 0) {
        this.countdown = 0;
        countdownEl.textContent = "0";
        this.stopCountdown();

        setTimeout(async () => {
          if (!this.gameOver) return;
          await Ads.maybeShowInterstitial(ADS.GAMEOVER_TIMEOUT_CHANCE);
          this.startNewGameSequence();
        }, 450);

        return;
      }

      countdownEl.textContent = this.countdown;
      countdownEl.classList.remove("tick");
      void countdownEl.offsetWidth;
      countdownEl.classList.add("tick");

      GameAudio.playCountdown();
    }, GAME_OVER.COUNTDOWN_INTERVAL_MS);
  },

  startNewGameSequence() {
    if (this.sequenceRunning) return;
    this.sequenceRunning = true;

    this.stopCountdown();

    const overlay = document.getElementById("gameOverOverlay");

    if (overlay) {
      overlay.classList.add("fade-out");

      setTimeout(() => {
        overlay.classList.add("hidden");
        overlay.classList.remove("fade-out");
      }, 300);
    }

    setTimeout(() => {
      const blocks = [];

      for (let y = 0; y < this.SIZE; y++) {
        for (let x = 0; x < this.SIZE; x++) {
          if (this.cells[y][x] !== 0) {
            blocks.push({ x, y });
          }
        }
      }

      const shuffled = this.shuffleArray(blocks);
      const step = Math.max(12, Math.floor(900 / Math.max(1, shuffled.length)));

      shuffled.forEach((cell, index) => {
        setTimeout(() => {
          this.cells[cell.y][cell.x] = 0;
          this.spawnParticles(cell.x, cell.y, 2, "#9fd8ff");

          if (typeof GameAudio.playBlockDisappear === "function") {
            GameAudio.playBlockDisappear(index);
          }
        }, index * step);
      });

      const scoreEl = document.getElementById("currentScore");
      if (scoreEl) scoreEl.classList.add("score-reset");

      this.score = 0;

      setTimeout(() => {
        if (scoreEl) scoreEl.classList.remove("score-reset");
      }, 900);

      setTimeout(() => {
        this.sequenceRunning = false;
        this.reset();
        RateUs.maybeShowOnRestart();
      }, 2000);
    }, 300);
  },

  stopCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    this.stopRingDrain();
  },

  // Barre circulaire de décompte, entièrement pilotée en JS (aucune
  // dépendance à une animation/transition CSS, pour un redémarrage fiable
  // à chaque défaite de la même partie).
  startRingDrain(ring) {
    this.stopRingDrain();

    const target = ring || document.getElementById("ringFg");
    if (!target) return;

    const CIRCUMFERENCE = GAME_OVER.RING_CIRCUMFERENCE;
    const DURATION = GAME_OVER.RING_DURATION_MS;
    const start = performance.now();

    target.style.strokeDashoffset = "0";

    const step = now => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / DURATION);

      target.style.strokeDashoffset = String(progress * CIRCUMFERENCE);

      if (progress < 1) {
        this.ringFrame = requestAnimationFrame(step);
      } else {
        this.ringFrame = null;
      }
    };

    this.ringFrame = requestAnimationFrame(step);
  },

  stopRingDrain() {
    if (this.ringFrame) {
      cancelAnimationFrame(this.ringFrame);
      this.ringFrame = null;
    }
  },

  // Rejoue l'entrée en cascade des 3 cartes de boost (remove/reflow/add,
  // même technique que App.celebrateEl ou les badges combo/praise) — le
  // décalage entre cartes est géré en CSS (nth-child), ce module se
  // contente de redéclencher l'animation à chaque ouverture du panneau.
  playBoostCardsEntrance() {
    document.querySelectorAll(".boost-card").forEach(card => {
      card.classList.remove("enter");
      void card.offsetWidth;
      card.classList.add("enter");
    });
  },

  // Petit flash doré sur le score courant : signale que l'action en
  // cours (SECOND WIND ou FRESH START) préserve le score, contrairement
  // à NEW GAME (score-reset, orange). Purement cosmétique — Phase 8.
  flashScoreKept() {
    const scoreEl = document.getElementById("currentScore");
    if (!scoreEl) return;

    scoreEl.classList.remove("score-kept");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("score-kept");

    setTimeout(() => scoreEl.classList.remove("score-kept"), 900);
  },

  // SECOND WIND (roadmap Phase 8) : comportement inchangé par rapport à
  // l'ancien bouton "Continuer" — ne nettoie que les blocs de pierre/
  // glace, garde le plateau, le score et le combo. Juice ajoutée : léger
  // double-battement haptique, onde de choc centrale et flash "score
  // conservé", en plus du son existant (playClear).
  revive() {
    for (let y = 0; y < this.SIZE; y++) {
      for (let x = 0; x < this.SIZE; x++) {
        if (this.cells[y][x] === 3) {
          this.cells[y][x] = 0;
          this.spawnParticles(x, y, 6, Theme.current.light);
          this.spawnDebris(x, y, Theme.current.dark, 2);
        }
      }
    }

    this.ensurePlayable();

    this.gameOver = false;
    this.freezeFx = null;
    this.freezeDelays = {};
    this.timeScale = 0.5;

    const overlay = document.getElementById("gameOverOverlay");
    if (overlay) overlay.classList.add("hidden");

    GameAudio.playClear(2);
    Haptics.vibrate([20, 40, 20]);
    this.spawnShockwave(this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.32, Theme.current.light);
    this.flashScoreKept();

    this.updateHUD();
    this.checkGameOver();
    if (!this.gameOver) this.scheduleObstacleSpawn();

    this.gameOverActionLock = false;
  },

  // FRESH START (roadmap Phase 8) : vide TOUT le plateau — contrairement
  // à revive(), les cases de couleur sont concernées elles aussi — mais
  // garde le score, le combo et la file de blocs en cours, contrairement
  // à NEW GAME qui repart de zéro. L'effacement est étalé dans le temps
  // (même esprit que startNewGameSequence) plutôt qu'instantané : c'est
  // ce qui distingue visuellement "on nettoie le plateau" de "on répare
  // 2-3 cases" (SECOND WIND, instantané).
  freshBoard() {
    this.stopCountdown();

    const overlay = document.getElementById("gameOverOverlay");

    if (overlay) {
      overlay.classList.add("fade-out");

      setTimeout(() => {
        overlay.classList.add("hidden");
        overlay.classList.remove("fade-out");
      }, 300);
    }

    Haptics.vibrate([15, 30, 15, 30, 25]);

    setTimeout(() => {
      const blocks = [];

      for (let y = 0; y < this.SIZE; y++) {
        for (let x = 0; x < this.SIZE; x++) {
          if (this.cells[y][x] !== 0) {
            blocks.push({ x, y });
          }
        }
      }

      const shuffled = this.shuffleArray(blocks);
      const step = Math.max(10, Math.floor(700 / Math.max(1, shuffled.length)));

      GameAudio.playFreshBoard();

      shuffled.forEach((cell, index) => {
        setTimeout(() => {
          this.cells[cell.y][cell.x] = 0;
          delete this.cellColors[`${cell.x},${cell.y}`];
          this.spawnParticles(cell.x, cell.y, 3, "#ffffff");
          this.spawnDebris(cell.x, cell.y, Theme.current.light, 2);
        }, index * step);
      });

      setTimeout(() => {
        this.ensurePlayable();

        this.gameOver = false;
        this.freezeFx = null;
        this.freezeDelays = {};
        this.timeScale = 0.5;

        this.spawnShockwave(this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.4, "#ffffff");
        this.flashScoreKept();

        this.unlockUI();
        this.updateHUD();
        this.checkGameOver();
        if (!this.gameOver) this.scheduleObstacleSpawn();

        this.gameOverActionLock = false;
      }, shuffled.length * step + 260);
    }, 300);
  }
});
