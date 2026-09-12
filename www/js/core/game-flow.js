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

Object.assign(Game, {
  checkGameOver() {
    if (this.gameOver) return;
    if (this.hasPossibleMove()) return;

    this.gameOver = true;
    this.clearObstacleTimer();

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

    // Coupe d'abord tout minuteur/animation d'un éventuel affichage
    // précédent du panneau pendant cette même partie, avant de reconstruire
    // une barre toute neuve.
    this.stopCountdown();

    const ring = this.buildCountdownRing();

    overlay.classList.remove("hidden");

    this.startRingDrain(ring);

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

    this.updateHUD();
    this.checkGameOver();
    if (!this.gameOver) this.scheduleObstacleSpawn();
  }
});
