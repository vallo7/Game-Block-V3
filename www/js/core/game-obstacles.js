/*
  core/game-obstacles.js
  --------------------------------------------------------------------
  Apparition, cadence et placement des blocs de pierre/glace (pilotée
  par le temps de jeu gameNow, gèle avec pause/pub comme le reste du
  jeu), plus l'identité visuelle des obstacles et de l'overlay de
  défaite selon l'environnement actif (services/visualtheme.js /
  services/environment.js, roadmap §3.2, Phase 2).
  --------------------------------------------------------------------
*/
import { Game } from "./game-state.js";
import { OBSTACLES } from "../config/gameConfig.js";
import { GameAudio } from "../services/audio.js";
import { Haptics } from "../services/haptics.js";
import { Theme } from "../services/theme.js";
import { VisualTheme } from "../services/visualtheme.js";
import { Tutorial } from "../ui/tutorial.js";

Object.assign(Game, {
  // Durée (s) de la phase d'échauffement : la cadence part de la moitié
  // haute de l'intervalle 3-10s et s'élargit progressivement vers
  // l'intervalle complet pendant cette période, avant que la difficulté
  // ne prenne le relais (cf. getObstaclePace). Volontairement longue pour
  // que le début de partie reste tranquille.
  OBSTACLE_WARMUP_SECONDS: OBSTACLES.WARMUP_SECONDS,

  // Un environnement définit un seul style de bloc (assets.blocks),
  // partagé par les obstacles et par l'overlay de défaite (roadmap
  // §3.2, Phase 2) : les deux accesseurs ci-dessous renvoient donc la
  // même valeur, conservés séparés pour la lisibilité des appels selon
  // le contexte (spawn d'obstacle vs. animation de gel).
  getObstacleStyleName() {
    return VisualTheme.getActiveEnvironment().assets.blocks;
  },

  getObstacleStyleColor() {
    return this.getObstacleStyleName() === "ice" ? this.ICE_COLOR : this.STONE_COLOR;
  },

  getDefeatOverlayStyleName() {
    return VisualTheme.getActiveEnvironment().assets.blocks;
  },

  getDefeatOverlayColor() {
    return this.getDefeatOverlayStyleName() === "stone" ? this.STONE_COLOR : this.ICE_COLOR;
  },

  scheduleObstacleSpawn() {
    if (this.gameOver || !this.active || Tutorial.active) {
      this.nextObstacleAt = null;
      return;
    }

    const { minDelay, maxDelay } = this.getObstaclePace();
    const delaySeconds = minDelay + Math.random() * (maxDelay - minDelay);

    this.nextObstacleAt = this.gameNow + delaySeconds * 1000;
  },

  clearObstacleTimer() {
    this.nextObstacleAt = null;
    this.pendingObstacles = [];
  },

  updateObstacleSpawner() {
    this.processPendingObstacles();

    if (this.gameOver || !this.active) return;

    if (Tutorial.active) {
      this.nextObstacleAt = null; // le tutoriel gère lui-même ses propres blocs
      return;
    }

    if (this.nextObstacleAt === null) {
      this.scheduleObstacleSpawn();
      return;
    }

    if (this.gameNow >= this.nextObstacleAt) {
      this.spawnRandomObstacles();
      this.scheduleObstacleSpawn();
    }
  },

  // Difficulté du système de blocs de pierre, basée sur le temps réellement
  // écoulé depuis la fin de l'échauffement (gameNow gèle pendant une pause
  // ou une publicité, donc cette progression s'arrête avec le reste du
  // jeu). Courbe purement logarithmique et volontairement lente.
  getObstacleTimeDifficulty() {
    const elapsed = Math.max(0, (this.gameNow - this.runStartAt) / 1000 - this.OBSTACLE_WARMUP_SECONDS);
    return Math.log(1 + elapsed / 210) * 0.55;
  },

  getObstaclePace() {
    const elapsed = Math.max(0, (this.gameNow - this.runStartAt) / 1000);
    const warmup = Math.min(1, elapsed / this.OBSTACLE_WARMUP_SECONDS);

    const baseMin = 6.5 - warmup * 3.5; // 6.5s -> 3s, très progressivement
    const baseMax = 10;

    const t = Math.min(3, this.getObstacleTimeDifficulty());

    const minDelay = Math.max(0.9, baseMin - t * 2.1);
    const maxDelay = Math.max(minDelay + 0.4, baseMax - t * 7.2);

    return { minDelay, maxDelay };
  },

  // Blocs simultanés : 1 à 5. Grille vide -> davantage de blocs à la fois,
  // grille pleine -> moins, pour garder la partie dynamique sans jamais
  // noyer le joueur.
  getObstacleSpawnCount() {
    const fill = this.getFillRatio();
    const t = Math.min(3, this.getObstacleTimeDifficulty());

    const fillFactor = 1 - Math.min(1, fill / 0.85);
    const base = 1 + fillFactor * 3.4;
    const difficultyBoost = t * 0.8;

    return Math.round(Math.min(5, Math.max(1, base + difficultyBoost - Math.random() * 0.6)));
  },

  spawnRandomObstacles() {
    if (this.gameOver || !this.active) return;

    const count = this.getObstacleSpawnCount();
    const cells = this.chooseObstacleCells(count);

    if (cells.length === 0) return;

    cells.forEach((cell, i) => {
      this.pendingObstacles.push({
        cell,
        at: this.gameNow + i * 90,
        index: i
      });
    });
  },

  processPendingObstacles() {
    if (!this.pendingObstacles || this.pendingObstacles.length === 0) return;

    this.pendingObstacles = this.pendingObstacles.filter((entry) => {
      if (this.gameNow < entry.at) return true;

      this.placeObstacleCell(entry.cell, entry.index);
      return false;
    });
  },

  // Pose effectivement un bloc de pierre. Un bloc ne peut jamais apparaître
  // par-dessus un autre bloc, quel que soit son type : on revérifie que la
  // case est toujours vide au moment de la pose, car elle a pu être
  // occupée entre-temps par le joueur.
  placeObstacleCell(cell, index) {
    if (this.gameOver) return;
    if (this.cells[cell.y][cell.x] !== 0) return;

    this.cells[cell.y][cell.x] = 3;

    this.cellAnims[`${cell.x},${cell.y}`] = {
      start: this.gameNow,
      type: "spawn"
    };

    this.spawnParticles(cell.x, cell.y, 4, Theme.current.dark);
    GameAudio.playObstacleSpawn(this.getObstacleStyleName(), index);
    Haptics.vibrate(10);

    // La détection de fin de partie doit tourner à chaque apparition de
    // bloc de pierre, pas seulement après les coups du joueur.
    this.checkGameOver();
  },

  chooseObstacleCells(count) {
    const chosen = [];
    const keys = new Set();

    const add = (cell) => {
      if (!cell) return;

      const key = `${cell.x},${cell.y}`;

      if (
        this.cells[cell.y][cell.x] === 0 &&
        !keys.has(key) &&
        !this.wouldCompleteLine(cell.x, cell.y)
      ) {
        keys.add(key);
        chosen.push(cell);
      }
    };

    if (count >= 3 && Math.random() < 0.45) {
      this.tryPatternL().forEach(add);
    }

    if (chosen.length === 0 && count >= 2) {
      this.tryPatternPair().forEach(add);
    }

    while (chosen.length < count) {
      const cell = this.getRandomEmptyCell();
      if (!cell) break;
      add(cell);
    }

    return chosen.slice(0, count);
  },

  getRandomEmptyCell() {
    const emptyCells = [];

    for (let y = 0; y < this.SIZE; y++) {
      for (let x = 0; x < this.SIZE; x++) {
        if (this.cells[y][x] === 0) emptyCells.push({ x, y });
      }
    }

    if (emptyCells.length === 0) return null;

    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
  },

  tryPatternPair() {
    const anchor = this.getRandomEmptyCell();
    if (!anchor) return [];

    const directions = this.shuffleArray([
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ]);

    for (const dir of directions) {
      const neighbor = { x: anchor.x + dir.x, y: anchor.y + dir.y };

      if (
        neighbor.x >= 0 &&
        neighbor.x < this.SIZE &&
        neighbor.y >= 0 &&
        neighbor.y < this.SIZE &&
        this.cells[neighbor.y][neighbor.x] === 0
      ) {
        return [anchor, neighbor];
      }
    }

    return [];
  },

  tryPatternL() {
    const anchor = this.getRandomEmptyCell();
    if (!anchor) return [];

    const patterns = this.shuffleArray([
      [{ x: 1, y: 0 }, { x: 0, y: 1 }],
      [{ x: -1, y: 0 }, { x: 0, y: 1 }],
      [{ x: 1, y: 0 }, { x: 0, y: -1 }],
      [{ x: -1, y: 0 }, { x: 0, y: -1 }]
    ]);

    for (const pattern of patterns) {
      const a = { x: anchor.x + pattern[0].x, y: anchor.y + pattern[0].y };
      const b = { x: anchor.x + pattern[1].x, y: anchor.y + pattern[1].y };

      const valid = [a, b].every(cell => {
        return (
          cell.x >= 0 &&
          cell.x < this.SIZE &&
          cell.y >= 0 &&
          cell.y < this.SIZE &&
          this.cells[cell.y][cell.x] === 0
        );
      });

      if (valid) return [anchor, a, b];
    }

    return [];
  }
});
