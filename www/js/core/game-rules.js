/*
  core/game-rules.js
  --------------------------------------------------------------------
  Le cœur intouchable des règles (roadmap §1) : validation d'un tracé,
  détection/suppression des lignes/colonnes complètes, score, détection
  de coup possible, garde-fou anti-blocage, et tout le retour (praise,
  combo, célébration de grille vide) déclenché par une validation.
  Rien ici ne doit changer le comportement de Classic sans feu vert
  explicite (cf. roadmap §1).
  --------------------------------------------------------------------
*/
import { Game } from "./game-state.js";
import { GameAudio } from "../services/audio.js";
import { Haptics } from "../services/haptics.js";
import { Theme } from "../services/theme.js";
import { Storage } from "../services/storage.js";
import { Tutorial } from "../ui/tutorial.js";

Object.assign(Game, {
  isGridEmpty() {
    return this.cells.every(row => row.every(value => value === 0));
  },

  isGridFull() {
    return this.cells.every(row => row.every(value => value !== 0));
  },

  isOpenCell(value) {
    return value === 0 || value === 1;
  },

  hasPossibleMove() {
    const target = this.requiredBlocks;

    if (target <= 0) return true;

    const size = this.SIZE;
    let openCount = 0;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (this.isOpenCell(this.cells[y][x])) openCount++;
      }
    }

    if (openCount < target) return false;

    // Marquage réutilisé d'un appel à l'autre (compteur de génération)
    // plutôt qu'un nouveau Set() par case de départ testée : évite de
    // générer beaucoup de déchets mémoire sur cette fonction, appelée très
    // souvent (à chaque coup et à chaque apparition de bloc de pierre).
    if (!this.hasMoveMark || this.hasMoveMark.length !== size * size) {
      this.hasMoveMark = new Int32Array(size * size);
    }

    const mark = this.hasMoveMark;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    const findPath = (x, y, depth, gen) => {
      if (depth === target) return true;

      const key = y * size + x;
      mark[key] = gen;

      for (let i = 0; i < 4; i++) {
        const nx = x + dirs[i][0];
        const ny = y + dirs[i][1];

        if (
          nx >= 0 && nx < size &&
          ny >= 0 && ny < size &&
          this.isOpenCell(this.cells[ny][nx]) &&
          mark[ny * size + nx] !== gen
        ) {
          if (findPath(nx, ny, depth + 1, gen)) {
            mark[key] = 0;
            return true;
          }
        }
      }

      mark[key] = 0;
      return false;
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!this.isOpenCell(this.cells[y][x])) continue;

        this.hasMoveGen = (this.hasMoveGen || 0) + 1;

        if (findPath(x, y, 1, this.hasMoveGen)) {
          return true;
        }
      }
    }

    return false;
  },

  largestPathLength() {
    let bestLen = 0;

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    const dfs = (x, y, depth, visited) => {
      if (depth > bestLen) bestLen = depth;
      if (depth === 6) return;

      const key = y * this.SIZE + x;
      visited.add(key);

      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;

        if (
          nx >= 0 && nx < this.SIZE &&
          ny >= 0 && ny < this.SIZE &&
          this.cells[ny][nx] === 0 &&
          !visited.has(ny * this.SIZE + nx)
        ) {
          dfs(nx, ny, depth + 1, visited);
        }
      }

      visited.delete(key);
    };

    for (let y = 0; y < this.SIZE; y++) {
      for (let x = 0; x < this.SIZE; x++) {
        if (this.cells[y][x] !== 0) continue;

        dfs(x, y, 1, new Set());

        if (bestLen === 6) return 6;
      }
    }

    return bestLen;
  },

  wouldCompleteLine(x, y) {
    let rowFilled = 0;
    for (let x2 = 0; x2 < this.SIZE; x2++) {
      if (x2 !== x && this.cells[y][x2] !== 0) rowFilled++;
    }
    if (rowFilled === this.SIZE - 1) return true;

    let colFilled = 0;
    for (let y2 = 0; y2 < this.SIZE; y2++) {
      if (y2 !== y && this.cells[y2][x] !== 0) colFilled++;
    }
    if (colFilled === this.SIZE - 1) return true;

    return false;
  },

  validate() {
    if (this.path.length !== this.requiredBlocks) return;

    const placed = [...this.path];
    this.path = [];

    placed.forEach(cell => {
      this.cells[cell.y][cell.x] = 2;

      this.cellAnims[`${cell.x},${cell.y}`] = {
        start: this.gameNow,
        type: "validate"
      };
    });

    GameAudio.playPlace();

    const result = this.processClears();
    const count = result.count;
    const emptied = this.isGridEmpty();

    if (count > 0) {
      this.combo = emptied ? 8 : this.combo + 1;
    } else {
      this.combo = 0;
    }

    if (count > 0) {
      let base = count * 100;

      const beforeBonus = Math.floor(this.totalCleared / 2);
      this.totalCleared += count;

      if (Math.floor(this.totalCleared / 2) > beforeBonus) {
        base += 200;
      }

      let points = base * Math.max(1, this.combo);

      if (emptied) {
        points += 300 * 8;
      }

      this.addScore(points);

      const color = emptied ? "#ffb100" : this.pointsColor(count);

      this.addFloatingText(
        `+${points}`,
        this.canvas.width / 2,
        this.canvas.height / 2,
        color
      );

      const vib = [];
      for (let i = 0; i < count; i++) {
        vib.push(30 + count * 10, 20);
      }
      Haptics.vibrate(vib);

      this.comboUntil = this.gameNow + 1800;

      if (this.combo >= 2) {
        const badge = document.getElementById("comboBadge");

        if (badge) {
          badge.textContent = `COMBO x${this.combo}`;
          badge.classList.remove("hidden");
          badge.classList.remove("pop", "mega");
          void badge.offsetWidth;
          badge.classList.add(emptied ? "mega" : "pop");
        }
      }

      if (count >= 3 || this.combo >= 2) {
        const power = count + this.combo;

        let level = 1;
        if (power >= 12) level = 5;
        else if (power >= 9) level = 4;
        else if (power >= 7) level = 3;
        else if (power >= 5) level = 2;

        if (emptied) level = 4;

        this.showPraise(level, emptied);
      }
    } else {
      this.comboUntil = this.gameNow + 1800;
    }

    this.turn += 1;

    if (emptied) {
      this.celebrateEmptyGrid();
    }

    this.setupNextBlock();
    this.checkGameOver();

    this.updateHUD();

    if (Tutorial.active) {
      Tutorial.afterValidate();
    }
  },

  pointsColor(count) {
    if (count >= 4) return "#ff9f1a";
    if (count === 3) return "#ffb100";
    if (count === 2) return Theme.current.light;
    return "#ffffff";
  },

  showPraise(level, emptied) {
    const words = ["NICE!", "GREAT!", "AWESOME!", "AMAZING!", "UNREAL!"];

    const badge = document.getElementById("praiseBadge");
    if (!badge) return;

    badge.textContent = words[level - 1];
    badge.className = `praise-badge l${level}`;
    void badge.offsetWidth;
    badge.classList.add("show");

    this.praiseUntil = this.gameNow + 1200 + level * 250;

    GameAudio.playPraise(level);
    if (typeof GameAudio.playVoice === "function") {
      GameAudio.playVoice(level);
    }
    Haptics.vibrate(30 + level * 15);

    // Gerbe de particules proportionnelle au niveau, éparpillée sur la
    // grille pour accompagner le mot d'encouragement.
    const bursts = 2 + level * 2;
    for (let i = 0; i < bursts; i++) {
      const bx = Math.floor(Math.random() * this.SIZE);
      const by = Math.floor(Math.random() * this.SIZE);
      this.spawnParticles(bx, by, level >= 4 ? 5 : 3, level >= 4 ? null : Theme.current.light);
    }

    if (level >= 2) {
      this.blockShake = {
        start: this.gameNow,
        duration: 260 + level * 110
      };
    }

    if (level >= 3 && !emptied) {
      this.lightWave = {
        start: this.gameNow,
        level
      };
    }

    if (level >= 4) {
      this.spawnShockwave(this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.4);
    }

    if (level >= 5) {
      const screen = document.getElementById("gameScreen");
      if (screen) {
        screen.classList.remove("quake");
        void screen.offsetWidth;
        screen.classList.add("quake");

        setTimeout(() => {
          screen.classList.remove("quake");
        }, 900);
      }
    }

    if (level >= 3) {
      this.afterGlow = {
        start: this.gameNow,
        level,
        duration: 3000 + level * 800
      };
    }
  },

  addFloatingText(text, x, y, color) {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      start: this.gameNow
    });
  },

  celebrateEmptyGrid() {
    GameAudio.playColorShift();
    Haptics.vibrate(1200);

    this.spawnShockwave(
      this.canvas.width / 2,
      this.canvas.height / 2,
      this.canvas.width * 0.55
    );

    setTimeout(() => {
      this.spawnShockwave(
        this.canvas.width / 2,
        this.canvas.height / 2,
        this.canvas.width * 0.42
      );
    }, 160);

    for (let i = 0; i < 10; i++) {
      const x = Math.floor(Math.random() * this.SIZE);
      const y = Math.floor(Math.random() * this.SIZE);
      this.spawnParticles(x, y, 7, "#ffffff");
      if (i % 2 === 0) this.spawnDebris(x, y, Theme.current.light, 2);
    }

    this.timeScale = 0.4;

    this.colorFx = {
      start: this.gameNow,
      duration: 900
    };

    this.blockShake = {
      start: this.gameNow,
      duration: 700
    };

    Theme.shift(900);

    const screen = document.getElementById("gameScreen");
    if (screen) {
      screen.classList.remove("quake");
      void screen.offsetWidth;
      screen.classList.add("quake");

      setTimeout(() => {
        screen.classList.remove("quake");
      }, 900);
    }

    const halo = document.getElementById("haloWave");
    if (halo) {
      halo.classList.remove("play", "thick");
      void halo.offsetWidth;
      halo.classList.add("play", "thick");
    }
  },

  processClears() {
    const fullRows = [];
    const fullCols = [];

    for (let y = 0; y < this.SIZE; y++) {
      const rowFull = this.cells[y].every(value => value !== 0);
      if (rowFull) fullRows.push(y);
    }

    for (let x = 0; x < this.SIZE; x++) {
      let colFull = true;

      for (let y = 0; y < this.SIZE; y++) {
        if (this.cells[y][x] === 0) {
          colFull = false;
          break;
        }
      }

      if (colFull) fullCols.push(x);
    }

    const count = fullRows.length + fullCols.length;

    if (count === 0) return { count: 0 };

    const toColor = this.turnColor || this.COLOR_BANK[0];
    const clearedKeys = new Set();

    for (const y of fullRows) {
      this.lineFlashes.push({ type: "row", index: y, start: this.gameNow, power: count, color: toColor.base });

      for (let x = 0; x < this.SIZE; x++) {
        clearedKeys.add(`${x},${y}`);
      }
    }

    for (const x of fullCols) {
      this.lineFlashes.push({ type: "col", index: x, start: this.gameNow, power: count, color: toColor.base });

      for (let y = 0; y < this.SIZE; y++) {
        clearedKeys.add(`${x},${y}`);
      }
    }

    if (count >= 2) {
      for (const y of fullRows) {
        this.lineBeams.push({ type: "row", index: y, start: this.gameNow, power: count, color: toColor.base });
      }

      for (const x of fullCols) {
        this.lineBeams.push({ type: "col", index: x, start: this.gameNow, power: count, color: toColor.base });
      }
    }

    let i = 0;
    const power = Math.min(5, count);

    for (const key of clearedKeys) {
      const [x, y] = key.split(",").map(Number);
      const value = this.cells[y][x];
      const fromName = value === 3 ? this.getObstacleStyleName() : (this.cellColors[key] || toColor.name);
      const fromColor = this.getBankColor(fromName);

      this.cellFlashes.push({
        x,
        y,
        power,
        color: toColor.base,
        start: this.gameNow + (i % 8) * 22
      });

      this.destroyAnims.push({
        x,
        y,
        value,
        power,
        fromColor: fromColor.base,
        toColor: toColor.base,
        fromName,
        toName: toColor.name,
        start: this.gameNow + (i % 8) * 22
      });

      this.spawnDebris(x, y, toColor.base, 3 + power);
      this.spawnParticles(x, y, 8 + power * 2, toColor.light);

      delete this.cellColors[key];

      i++;
    }

    for (const y of fullRows) {
      for (let x = 0; x < this.SIZE; x++) {
        this.cells[y][x] = 0;
      }
    }

    for (const x of fullCols) {
      for (let y = 0; y < this.SIZE; y++) {
        this.cells[y][x] = 0;
      }
    }

    this.spawnShockwave(
      this.canvas.width / 2,
      this.canvas.height / 2,
      this.canvas.width * (count > 1 ? 0.4 : 0.25),
      toColor.base
    );

    if (count > 1) {
      this.timeScale = 0.35;
    }

    GameAudio.playClear(count);

    const scoreEl = document.getElementById("currentScore");
    if (scoreEl) {
      scoreEl.classList.remove("score-bump");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("score-bump");
    }

    return { count };
  },

  addScore(points) {
    this.score += points;

    if (this.score > this.best) {
      this.best = this.score;
      Storage.saveBest(this.best);

      const bestEl = document.getElementById("bestScoreValue");
      if (bestEl) {
        bestEl.classList.remove("score-bump");
        void bestEl.offsetWidth;
        bestEl.classList.add("score-bump");
      }
    }
  },

  ensurePlayable() {
    let guard = 0;

    while (!this.hasPossibleMove() && guard < 5) {
      const row = Math.floor(Math.random() * this.SIZE);

      for (let x = 0; x < this.SIZE; x++) {
        this.spawnDebris(x, row, "#ffffff", 2);
        this.cells[row][x] = 0;
      }

      this.lineFlashes.push({ type: "row", index: row, start: this.gameNow });

      guard++;
    }

    if (!this.hasPossibleMove()) {
      const maxPath = this.largestPathLength();

      this.requiredBlocks = Math.max(1, Math.min(this.requiredBlocks, maxPath));
      this.updateHUD();
    }
  }
});
