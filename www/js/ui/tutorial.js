/*
  ui/tutorial.js
  --------------------------------------------------------------------
  Tutoriel de première ouverture. Importe Game depuis
  core/game-state.js (et non le barrel core/game.js) pour éviter un
  cycle d'import inutile ; les méthodes utilisées ici
  (chooseObstacleCells, spawnParticles, getCellSize...) sont ajoutées à
  ce même objet Game par les autres fichiers core/game-*.js au
  chargement de l'app.

  La phase "menu" (spotlight + gant sur le bouton Classic) ne démarre
  plus sur un minuteur fixe deviné (ancien SPLASH_DELAY, calé sur la
  durée de l'ex-splash) : App.init() appelle beginIfNeeded() une fois
  le menu réellement visible, juste après la disparition de l'écran de
  chargement — le tutoriel démarre donc exactement quand il est prêt à
  l'être, quelle que soit la durée réelle du chargement.
  --------------------------------------------------------------------
*/
import { Storage } from "../services/storage.js";
import { Game } from "../core/game-state.js";
import { GameAudio } from "../services/audio.js";
import { Haptics } from "../services/haptics.js";
import { Theme } from "../services/theme.js";

export const Tutorial = {
  active: false,
  phase: "idle", // idle | menu | awaitingGame | trace | postTrace | spawning | outro | done

  traceIndex: -1,
  pathVisible: false,

  menuGlove: null,
  menuGloveResizeHandler: null,
  gloveImage: null,
  captionEl: null,
  outroEl: null,

  TIP_X_RATIO: 0.171,
  TIP_Y_RATIO: 0.008,

  traces: [
    { required: 4, caption: "DRAW A LINE", path: [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }] },
    { required: 6, caption: "FINISH THE LINE", path: [{ x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 6 }, { x: 7, y: 7 }] },
    { required: 6, caption: "CLEAR THE COLUMN", path: [{ x: 7, y: 5 }, { x: 7, y: 4 }, { x: 7, y: 3 }, { x: 7, y: 2 }, { x: 7, y: 1 }, { x: 7, y: 0 }] }
  ],

  SPAWN_STAGGER: 300,
  END_DELAY: 500,

  init() {
    if (Storage.getTutorialDone()) return;

    this.gloveImage = new Image();
    this.gloveImage.src = "img/tutorial-hand.png";

    this.active = true;
    this.phase = "menu";

    document.body.classList.add("tutorial-locked");

    const classicBtn = document.getElementById("classicModeBtn");
    if (classicBtn) classicBtn.classList.add("tutorial-pending");

    // Le déclenchement de la phase menu se fait désormais via
    // beginIfNeeded(), appelé par App une fois le menu effectivement
    // affiché (voir en-tête de fichier).
  },

  beginIfNeeded() {
    if (!this.active || this.phase !== "menu") return;
    this.enterMenuPhase();
  },

  enterMenuPhase() {
    if (!this.active || this.phase !== "menu") return;

    const menuScreen = document.getElementById("menuScreen");
    const classicBtn = document.getElementById("classicModeBtn");

    if (menuScreen) menuScreen.classList.add("tutorial-spotlight");

    if (classicBtn) {
      classicBtn.classList.remove("tutorial-pending");
      classicBtn.classList.add("tutorial-pulse");
    }

    this.mountMenuGlove();
    this.showCaption("TAP TO START");
  },

  mountMenuGlove() {
    const btn = document.getElementById("classicModeBtn");
    if (!btn) return;

    const glove = document.createElement("img");
    glove.src = "img/tutorial-hand.png";
    glove.alt = "";
    glove.setAttribute("aria-hidden", "true");
    glove.className = "tutorial-glove";

    document.body.appendChild(glove);
    this.menuGlove = glove;

    this.positionMenuGlove();

    this.menuGloveResizeHandler = () => this.positionMenuGlove();
    window.addEventListener("resize", this.menuGloveResizeHandler);
  },

  positionMenuGlove() {
    if (!this.menuGlove) return;

    const btn = document.getElementById("classicModeBtn");
    if (!btn) return;

    const rect = btn.getBoundingClientRect();

    this.menuGlove.style.left = (rect.left + rect.width * 0.6) + "px";
    this.menuGlove.style.top = (rect.top + rect.height * 0.46) + "px";
  },

  unmountMenuGlove() {
    if (this.menuGlove) {
      this.menuGlove.remove();
      this.menuGlove = null;
    }

    if (this.menuGloveResizeHandler) {
      window.removeEventListener("resize", this.menuGloveResizeHandler);
      this.menuGloveResizeHandler = null;
    }
  },

  exitMenuPhase() {
    const menuScreen = document.getElementById("menuScreen");
    const classicBtn = document.getElementById("classicModeBtn");

    if (menuScreen) menuScreen.classList.remove("tutorial-spotlight");
    if (classicBtn) classicBtn.classList.remove("tutorial-pulse", "tutorial-pending");
    document.body.classList.remove("tutorial-locked");

    this.unmountMenuGlove();
    this.hideCaption();
  },

  handleClassicTap() {
    if (!this.active || this.phase !== "menu") return;

    this.exitMenuPhase();
    this.phase = "awaitingGame";
    document.body.classList.add("tutorial-locked-game");
  },

  showCaption(text) {
    if (!this.captionEl) {
      const el = document.createElement("div");
      el.className = "tutorial-caption";
      document.body.appendChild(el);
      this.captionEl = el;
    }

    this.captionEl.textContent = text;
    this.captionEl.classList.remove("show");
    void this.captionEl.offsetWidth;
    this.captionEl.classList.add("show");
  },

  hideCaption() {
    if (this.captionEl) this.captionEl.classList.remove("show");
  },

  nextRequiredBlocks() {
    if (!this.active) return null;
    if (this.phase !== "awaitingGame" && this.phase !== "trace") return null;

    this.traceIndex += 1;

    if (this.traceIndex >= this.traces.length) {
      this.phase = "postTrace";
      return null;
    }

    this.phase = "trace";
    this.pathVisible = false;

    const idx = this.traceIndex;
    const delay = idx === 0 ? 450 : 600;

    setTimeout(() => {
      if (this.active && this.phase === "trace" && this.traceIndex === idx) {
        this.pathVisible = true;
        this.showCaption(this.traces[idx].caption);
      }
    }, delay);

    return this.traces[this.traceIndex].required;
  },

  afterValidate() {
    if (!this.active) return;

    if (this.phase === "trace") {
      this.hideCaption();
    }

    if (this.phase === "postTrace") {
      this.phase = "spawning";
      this.hideCaption();
      setTimeout(() => this.beginSpawnSequence(), 650);
    }
  },

  isCellAllowed(x, y, currentPath) {
    if (!this.active) return true;
    if (this.phase !== "trace") return false;

    const trace = this.traces[this.traceIndex];
    if (!trace) return false;

    const expected = trace.path[currentPath.length];
    return !!expected && expected.x === x && expected.y === y;
  },

  isGameLocked() {
    return this.active && this.phase !== "menu" && this.phase !== "idle";
  },

  beginSpawnSequence() {
    if (!this.active) return;

    const cells = Game.chooseObstacleCells(5);

    if (cells.length === 0) {
      this.showOutro();
      return;
    }

    cells.forEach((cell, i) => {
      setTimeout(() => {
        if (!this.active) return;

        Game.cells[cell.y][cell.x] = 3;
        Game.cellAnims[`${cell.x},${cell.y}`] = { start: Game.gameNow, type: "spawn" };
        Game.spawnParticles(cell.x, cell.y, 4, Theme.current.dark);

        if (typeof GameAudio.playBlockSpawn === "function") {
          GameAudio.playBlockSpawn(i);
        }
        Haptics.vibrate(10);

        if (i === cells.length - 1) {
          setTimeout(() => this.showOutro(), this.END_DELAY);
        }
      }, i * this.SPAWN_STAGGER);
    });
  },

  showOutro() {
    if (!this.active) return;

    this.phase = "outro";

    const overlay = document.createElement("div");
    overlay.className = "tutorial-outro";

    const card = document.createElement("div");
    card.className = "tutorial-outro-card";
    card.textContent = "GAME ON!";

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this.outroEl = overlay;

    if (typeof GameAudio.playTutorialDone === "function") {
      GameAudio.playTutorialDone();
    }
    Haptics.vibrate(40);

    const dismiss = () => {
      overlay.removeEventListener("pointerdown", dismiss);
      overlay.classList.add("out");
      setTimeout(() => {
        overlay.remove();
        if (this.outroEl === overlay) this.outroEl = null;
        this.finish();
      }, 260);
    };

    overlay.addEventListener("pointerdown", dismiss);
  },

  finish() {
    this.active = false;
    this.phase = "done";
    this.pathVisible = false;
    this.traceIndex = -1;

    document.body.classList.remove("tutorial-locked-game");
    this.hideCaption();
    Storage.setTutorialDone();
  },

  drawOnCanvas(ctx, now) {
    if (!this.pathVisible || this.phase !== "trace") return;

    const trace = this.traces[this.traceIndex];
    if (!trace) return;

    const doneCount = Game.path.length;

    this.drawHighlights(ctx, now, trace, doneCount);

    if (!Game.drawing) {
      this.drawGlovePath(ctx, now, trace);
    }
  },

  drawHighlights(ctx, now, trace, doneCount) {
    const cellSize = Game.getCellSize();
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);

    const pad = cellSize * 0.06;
    const box = cellSize - pad * 2;
    const r = cellSize * 0.22;

    for (let i = doneCount; i < trace.path.length; i++) {
      const cell = trace.path[i];
      const px = cell.x * cellSize;
      const py = cell.y * cellSize;

      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(2, cellSize * 0.055);
      ctx.globalAlpha = 0.4 + 0.35 * pulse;
      Game.roundRectPath(px + pad, py + pad, box, box, r);
      ctx.stroke();

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.1 + 0.1 * pulse;
      ctx.fillStyle = "#ffffff";
      Game.roundRectPath(px + pad, py + pad, box, box, r);
      ctx.fill();
      ctx.restore();
    }
  },

  drawGlovePath(ctx, now, trace) {
    const path = trace.path;
    const segments = path.length - 1;
    if (segments < 0) return;

    const loopDuration = 700 + segments * 240;
    const pause = 420;
    const total = loopDuration + pause;
    const t = now % total;

    let x, y, alpha, angle = 0;

    if (t < loopDuration) {
      const progress = t / loopDuration;
      const segFloat = segments === 0 ? 0 : progress * segments;
      const segIndex = Math.min(Math.max(segments - 1, 0), Math.floor(segFloat));
      const segT = segments === 0 ? 0 : segFloat - segIndex;

      const a = path[segIndex];
      const b = path[Math.min(segments, segIndex + 1)];

      const ax = Game.getCellCenterX(a.x);
      const ay = Game.getCellCenterY(a.y);
      const bx = Game.getCellCenterX(b.x);
      const by = Game.getCellCenterY(b.y);

      x = ax + (bx - ax) * segT;
      y = ay + (by - ay) * segT;

      angle = Math.atan2(by - ay, bx - ax) + Math.PI * 0.75;
      alpha = Math.min(1, progress * 7) * Math.min(1, (1 - progress) * 7 + 0.12);
    } else {
      alpha = 0;
      x = Game.getCellCenterX(path[0].x);
      y = Game.getCellCenterY(path[0].y);
    }

    if (alpha <= 0.02) return;

    this.drawGloveShape(ctx, x, y, Game.getCellSize(), alpha, angle);
  },

  drawGloveShape(ctx, x, y, cellSize, alpha, angle) {
    const img = this.gloveImage;
    if (!img || !img.complete || !img.naturalWidth) return;

    const drawW = cellSize * 1.55;
    const drawH = drawW * (img.naturalHeight / img.naturalWidth);
    const tipX = this.TIP_X_RATIO * drawW;
    const tipY = this.TIP_Y_RATIO * drawH;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);

    // shadowBlur retiré (round performance, cf. core/game-render.js) :
    // même s'il n'y a ici qu'un seul dessin par frame (pas des dizaines
    // comme pour les particules), autant rester cohérent et ne garder
    // aucun flou de canvas recalculé à chaque frame dans le jeu.
    ctx.drawImage(img, -tipX, -tipY, drawW, drawH);
    ctx.restore();
  }
};
