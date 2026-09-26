/*
  core/game-input.js
  --------------------------------------------------------------------
  Gestion du tracé du joueur : ajout/retrait de cases, validation du
  nombre de cases requis, retour visuel/sonore sur les tracés invalides,
  et la synchro du pill "cases restantes" qui en dépend directement.
  --------------------------------------------------------------------
*/
import { Game } from "./game-state.js";
import { GameAudio } from "../services/audio.js";
import { Haptics } from "../services/haptics.js";
import { Tutorial } from "../ui/tutorial.js";

Object.assign(Game, {
  // Convertit la position du pointeur en case. Depuis le round
  // "dézoom" (voir core/game-render.js#GRID_CELL_RECT), la zone de jeu
  // n'occupe plus 100% du canvas affiché — le cadre de la grille est
  // visible tout autour — donc la position relative du pointeur est
  // d'abord corrigée par GRID_CELL_RECT avant d'être convertie en
  // index de case, exactement comme le rendu (Game.draw()) décale les
  // cases via ctx.translate(). Sans ça, un tap resterait aligné sur
  // l'ancien repère (grille = canvas entier) alors que les cases
  // dessinées sont maintenant plus petites et décalées.
  getCellFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    const cellRect = this.GRID_CELL_RECT;

    const relX = (event.clientX - rect.left) / rect.width;
    const relY = (event.clientY - rect.top) / rect.height;

    const x = Math.floor(((relX - cellRect.x) / cellRect.w) * this.SIZE);
    const y = Math.floor(((relY - cellRect.y) / cellRect.h) * this.SIZE);

    if (x < 0 || x >= this.SIZE || y < 0 || y >= this.SIZE) return null;

    return { x, y };
  },

  canAddCell(x, y) {
    if (this.gameOver) return false;
    if (x < 0 || x >= this.SIZE || y < 0 || y >= this.SIZE) return false;
    if (this.cells[y][x] !== 0) return false;
    if (this.path.length >= this.requiredBlocks) return false;
    if (Tutorial.active && !Tutorial.isCellAllowed(x, y, this.path)) return false;

    if (this.path.length === 0) return true;

    const last = this.path[this.path.length - 1];
    return Math.abs(last.x - x) + Math.abs(last.y - y) === 1;
  },

  tryStart(cell) {
    if (!this.canAddCell(cell.x, cell.y)) {
      this.invalidFeedback(cell.x, cell.y);
      return false;
    }

    this.addCell(cell.x, cell.y);
    return true;
  },

  tryContinue(cell) {
    const index = this.path.findIndex(p => p.x === cell.x && p.y === cell.y);

    if (index >= 0) {
      this.backtrackTo(index);
      return;
    }

    if (this.canAddCell(cell.x, cell.y)) {
      this.addCell(cell.x, cell.y);
    } else if (this.cells[cell.y][cell.x] === 0) {
      this.invalidFeedback(cell.x, cell.y);
    }
  },

  // Phase 14 (juice des chaînes) : la 1ʳᵉ case d'un tracé reçoit un
  // traitement à part — anim "place-first" (pop plus ample, cf.
  // core/game-render.js#drawCells), son distinct (GameAudio.playAddFirst,
  // sous-basse en plus), haptique légèrement plus marqué et une petite
  // onde de choc locale centrée sur elle. Les cases suivantes du même
  // tracé gardent exactement le comportement d'origine (anim "place",
  // playAdd, vibrate(12)) — aucune règle de jeu n'est concernée, tout ceci
  // reste un pur habillage synchronisé son/visuel/haptique.
  addCell(x, y) {
    const isFirstCell = this.path.length === 0;

    this.cells[y][x] = 1;
    this.path.push({ x, y });
    this.cellColors[`${x},${y}`] = this.turnColor ? this.turnColor.name : this.COLOR_BANK[0].name;

    this.cellAnims[`${x},${y}`] = {
      start: this.gameNow,
      type: isFirstCell ? "place-first" : "place"
    };

    if (isFirstCell) {
      GameAudio.playAddFirst();
      Haptics.vibrate(18);

      const accentColor = this.turnColor ? this.turnColor.base : this.COLOR_BANK[0].base;
      this.spawnShockwave(
        this.getBoardOffsetX() + this.getCellCenterX(x),
        this.getBoardOffsetY() + this.getCellCenterY(y),
        this.getCellSize() * 1.5,
        accentColor
      );
    } else {
      GameAudio.playAdd(this.path.length);
      Haptics.vibrate(12);
    }

    this.updateHUD();
  },

  backtrackTo(index) {
    const removed = this.path.splice(index + 1);

    if (removed.length === 0) return;

    removed.forEach(cell => {
      this.cells[cell.y][cell.x] = 0;
      delete this.cellColors[`${cell.x},${cell.y}`];
    });

    GameAudio.playBack();

    this.updateHUD();
  },

  cancelPath(animated) {
    this.drawing = false;
    this.strokeStarted = false;

    if (this.path.length === 0) return;

    this.path.forEach(cell => {
      this.cells[cell.y][cell.x] = 0;
      delete this.cellColors[`${cell.x},${cell.y}`];
    });

    this.path = [];

    if (animated) {
      GameAudio.playCancel();
      Haptics.vibrate([20, 30, 20]);
    }

    this.updateHUD();
  },

  cancelIncomplete() {
    if (this.path.length === 0) return;

    const cancelledCells = [...this.path];

    cancelledCells.forEach(cell => {
      this.cancelAnims.push({
        x: cell.x,
        y: cell.y,
        start: this.gameNow
      });

      this.spawnDebris(cell.x, cell.y, "#ef4444", 2);
    });

    this.cancelPath(true);
  },

  updateHUD() {
    this.renderAvailableBlocks();
  },

  renderAvailableBlocks() {
    const remaining = Math.max(0, this.requiredBlocks - this.path.length);

    const countEl = document.getElementById("availableCount");
    const pillEl = document.getElementById("availablePill");

    if (!countEl || !pillEl) return;

    const previous = countEl.textContent;

    countEl.textContent = remaining;

    if (this.turnColor) {
      pillEl.style.backgroundColor = this.turnColor.base;
    }

    if (String(remaining) !== previous) {
      pillEl.classList.remove("bump");
      void pillEl.offsetWidth;
      pillEl.classList.add("bump");
    }
  },

  invalidFeedback(x, y) {
    const now = performance.now();
    const key = `${x},${y}`;

    if (this.lastInvalidKey === key && now - this.lastInvalidTime < 250) {
      return;
    }

    this.lastInvalidKey = key;
    this.lastInvalidTime = now;

    this.spawnDebris(x, y, "#ef4444", 1);

    GameAudio.playError();
    Haptics.vibrate(30);
  }
});
