/*
  core/game-rules.js
  --------------------------------------------------------------------
  Le cœur intouchable des règles (roadmap §1) : validation d'un tracé,
  détection/suppression des lignes/colonnes complètes, score, détection
  de coup possible, garde-fou anti-blocage, et tout le retour (praise,
  combo, célébration de grille vide) déclenché par une validation.
  Rien ici ne doit changer le comportement de Classic sans feu vert
  explicite (cf. roadmap §1).

  Phase 2 (habillage visuel/sonore uniquement, aucune règle touchée) :
  - la couleur d'accent des particules de praise/célébration peut être
    surchargée par l'environnement actif (VisualTheme.getVfxAccent) ;
  - le déclenchement du son de disparition des blocs spéciaux
    (playObstacleDespawn) a été ajouté quand une ligne/colonne effacée
    contenait un obstacle ;
  - le changement aléatoire de couleur de grille en fin de Perfect
    Clear (Theme.shift) a été retiré : la grille garde sa couleur
    pendant toute la partie. Toutes les animations de cette
    célébration restent inchangées.

  Phases 11/12/13 (également pur habillage, aucune règle touchée) :
  - Praise étendu de 5 à 8 paliers, barème lu depuis
    config/gameConfig.js#PRAISE (getPraiseLevel/showPraise) ;
  - Perfect Run (§12) : 4 pips de palier (3/5/10/20) purement dérivés de
    `combo`, mis à jour à chaque validate() (updatePerfectRun) ;
  - Combo meter (§13) : barre de décompte interne au badge combo, calée
    sur la même fenêtre que comboUntil (startComboMeter/stopComboMeter).
  --------------------------------------------------------------------
*/
import { Game } from "./game-state.js";
import { GameAudio } from "../services/audio.js";
import { Haptics } from "../services/haptics.js";
import { Theme } from "../services/theme.js";
import { VisualTheme } from "../services/visualtheme.js";
import { Storage } from "../services/storage.js";
import { Tutorial } from "../ui/tutorial.js";
import { PRAISE, PERFECT_RUN, COMBO } from "../config/gameConfig.js";

// Directions orthogonales partagées par hasPossibleMove() et
// largestPathLength() : un seul tableau réutilisé plutôt qu'un
// littéral recréé à chaque appel (ces deux fonctions tournent très
// souvent — à chaque coup, à chaque apparition de bloc de pierre).
const NEIGHBOR_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

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

  // Calcule les composantes connexes des cases ouvertes (flood fill),
  // pour pouvoir écarter d'emblée les cases de départ situées dans une
  // poche trop petite pour contenir un tracé de la longueur demandée —
  // sans ça, hasPossibleMove() perd du temps à explorer par
  // backtracking des poches qu'on peut disqualifier en O(1) une fois la
  // taille de leur composante connue. Résultat final identique, juste
  // moins de travail pour l'obtenir.
  computeOpenComponents() {
    const size = this.SIZE;

    if (!this.componentMark || this.componentMark.length !== size * size) {
      this.componentMark = new Int32Array(size * size).fill(-1);
    } else {
      this.componentMark.fill(-1);
    }

    const comp = this.componentMark;
    const sizes = [];
    const stack = this.componentStack || (this.componentStack = []);
    let compId = 0;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const startIdx = y * size + x;

        if (comp[startIdx] !== -1 || !this.isOpenCell(this.cells[y][x])) continue;

        let count = 0;
        stack.length = 0;
        stack.push(startIdx);
        comp[startIdx] = compId;

        while (stack.length > 0) {
          const cur = stack.pop();
          count++;

          const cx = cur % size;
          const cy = (cur - cx) / size;

          for (let i = 0; i < 4; i++) {
            const nx = cx + NEIGHBOR_DIRS[i][0];
            const ny = cy + NEIGHBOR_DIRS[i][1];

            if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;

            const nIdx = ny * size + nx;

            if (comp[nIdx] === -1 && this.isOpenCell(this.cells[ny][nx])) {
              comp[nIdx] = compId;
              stack.push(nIdx);
            }
          }
        }

        sizes.push(count);
        compId++;
      }
    }

    return { comp, sizes };
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

    const { comp, sizes } = this.computeOpenComponents();

    // Marquage réutilisé d'un appel à l'autre (compteur de génération)
    // plutôt qu'un nouveau Set() par case de départ testée : évite de
    // générer beaucoup de déchets mémoire sur cette fonction, appelée très
    // souvent (à chaque coup et à chaque apparition de bloc de pierre).
    if (!this.hasMoveMark || this.hasMoveMark.length !== size * size) {
      this.hasMoveMark = new Int32Array(size * size);
    }

    const mark = this.hasMoveMark;

    const findPath = (x, y, depth, gen) => {
      if (depth === target) return true;

      const key = y * size + x;
      mark[key] = gen;

      for (let i = 0; i < 4; i++) {
        const nx = x + NEIGHBOR_DIRS[i][0];
        const ny = y + NEIGHBOR_DIRS[i][1];

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

        // Une poche plus petite que target ne peut par définition
        // contenir aucun tracé de cette longueur : inutile de lancer le
        // backtracking depuis une case qui en fait partie.
        if (sizes[comp[y * size + x]] < target) continue;

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

    const dfs = (x, y, depth, visited) => {
      if (depth > bestLen) bestLen = depth;
      if (depth === 6) return;

      const key = y * this.SIZE + x;
      visited.add(key);

      for (const [dx, dy] of NEIGHBOR_DIRS) {
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

    // Perfect Run (Phase 12) a besoin du combo AVANT sa mise à jour pour
    // savoir quels paliers (3/5/10/20) viennent d'être franchis par ce
    // coup précis — n'affecte en rien le calcul du combo lui-même,
    // identique à l'existant.
    const previousCombo = this.combo;

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

      this.comboUntil = this.gameNow + COMBO.WINDOW_MS;
      this.startComboMeter();

      if (this.combo >= 2) {
        const badge = document.getElementById("comboBadge");

        if (badge) {
          // Phase 13 : le badge héberge désormais aussi la barre du combo
          // meter (.combo-meter-track) — on met à jour le libellé via son
          // propre span plutôt que badge.textContent, qui effacerait cette
          // barre à chaque coup.
          const label = badge.querySelector(".combo-badge-label");
          if (label) label.textContent = `COMBO x${this.combo}`;

          badge.classList.remove("hidden");
          badge.classList.remove("pop", "mega");
          void badge.offsetWidth;
          badge.classList.add(emptied ? "mega" : "pop");
        }
      }

      this.updatePerfectRun(previousCombo);

      if (count >= 3 || this.combo >= 2) {
        const power = count + this.combo;
        let level = this.getPraiseLevel(power);

        if (emptied) level = Math.max(level, PRAISE.EMPTIED_MIN_LEVEL);

        this.showPraise(level, emptied);
      }
    } else {
      // Petit correctif engendré par le Combo Meter (Phase 13) : le
      // badge combo prolongeait auparavant sa fenêtre de visibilité même
      // sur un coup qui vient de casser le combo (comboUntil repoussé à
      // +1800ms alors que combo repasse à 0), ce qui aurait rendu la
      // nouvelle jauge de décompte incohérente avec l'état réel. On
      // referme désormais la fenêtre immédiatement — Game.update() masque
      // le badge dès que gameNow dépasse comboUntil, donc le fixer à
      // gameNow suffit à le masquer dès la prochaine frame.
      this.comboUntil = this.gameNow;
      this.stopComboMeter();
      this.updatePerfectRun(previousCombo);
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

  // Phase 11 (extension du praise, 5 → 8 paliers) : barème lu depuis
  // config/gameConfig.js#PRAISE plutôt qu'une cascade de if/else en dur,
  // pour que le prochain ajustement de seuils se fasse à un seul endroit.
  // Vérifie du palier le plus haut au plus bas et retourne le premier
  // seuil atteint par `power`.
  getPraiseLevel(power) {
    const levels = PRAISE.LEVELS;
    let level = levels[0].level;

    for (let i = levels.length - 1; i >= 0; i--) {
      if (power >= levels[i].threshold) {
        level = levels[i].level;
        break;
      }
    }

    return level;
  },

  showPraise(level, emptied) {
    const entry = PRAISE.LEVELS.find(l => l.level === level) || PRAISE.LEVELS[0];

    const badge = document.getElementById("praiseBadge");
    if (!badge) return;

    badge.textContent = entry.word;
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
    // grille pour accompagner le mot d'encouragement. Teinte d'accent
    // de l'environnement actif si celui-ci en définit une (roadmap
    // §3.2, Phase 2), sinon la couleur de session existante — aucun
    // changement pour un environnement sans surcouche VFX. Le nombre de
    // bursts (donc de particules, déjà plafonné globalement par
    // MAX_PARTICLES) continue de croître avec les paliers 6-8 sans
    // changement de formule.
    const accent = VisualTheme.getVfxAccent(Theme.current.light);
    const bursts = 2 + level * 2;
    for (let i = 0; i < bursts; i++) {
      const bx = Math.floor(Math.random() * this.SIZE);
      const by = Math.floor(Math.random() * this.SIZE);
      this.spawnParticles(bx, by, level >= 4 ? 5 : 3, level >= 4 ? null : accent);
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
      // Paliers 7-8 (Phase 11) : secousse d'écran "mega", plus ample et
      // plus longue, à la place de (jamais en plus de) la secousse
      // standard — deux classes concurrentes sur le même élément avec
      // des délais de retrait différents se seraient interrompues l'une
      // l'autre, d'où le choix d'une classe distincte plutôt qu'un
      // second déclenchement de ".quake".
      const screen = document.getElementById("gameScreen");
      if (screen) {
        const mega = level >= 7;
        const cls = mega ? "quake-mega" : "quake";
        const duration = mega ? 1300 : 900;

        screen.classList.remove("quake", "quake-mega");
        void screen.offsetWidth;
        screen.classList.add(cls);

        setTimeout(() => {
          screen.classList.remove(cls);
        }, duration);
      }
    }

    if (level >= 3) {
      // Le niveau interne plafonne à 5 (intensité/durée déjà calibrées
      // jusque-là) : les paliers 6-8 ont leur propre escalade dédiée
      // ci-dessous plutôt que d'extrapoler cette formule au-delà de son
      // réglage d'origine.
      const glowLevel = Math.min(level, 5);
      this.afterGlow = {
        start: this.gameNow,
        level: glowLevel,
        duration: 3000 + glowLevel * 800
      };
    }

    // Palier 6+ : une 2ᵉ onde de choc légèrement décalée, en plus de
    // celle du palier 4 — le array-based shockwave system tolère déjà
    // plusieurs instances simultanées sans collision (game-render.js).
    if (level >= 6) {
      setTimeout(() => {
        this.spawnShockwave(this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.5);
      }, 140);
    }

    // Palier 8 (LEGENDARY!) uniquement : flash plein écran, réservé au
    // tout dernier palier pour qu'il reste un moment exceptionnel (voir
    // .legendary-flash, css/game.css).
    if (level >= 8) {
      const screen = document.getElementById("gameScreen");
      if (screen) {
        screen.classList.remove("legendary-flash");
        void screen.offsetWidth;
        screen.classList.add("legendary-flash");

        setTimeout(() => {
          screen.classList.remove("legendary-flash");
        }, 700);
      }
    }
  },

  // ---------- Perfect Run (Phase 12) ----------
  // Jauge à 4 pips (3/5/10/20) purement dérivée de `combo` : aucune
  // nouvelle règle de score, uniquement une célébration supplémentaire
  // aux mêmes seuils qu'un joueur peut déjà atteindre aujourd'hui. Vit à
  // l'intérieur du badge combo lui-même (voir index.html) : sa visibilité
  // suit donc automatiquement celle du badge (comboUntil), rien à gérer
  // en plus ici — seul l'état "reached"/"pop" de chaque pip est à jour.
  updatePerfectRun(previousCombo) {
    const gauge = document.getElementById("perfectRunGauge");
    if (!gauge) return;

    const milestones = PERFECT_RUN.MILESTONES;
    const pips = gauge.querySelectorAll(".prg-pip");
    let crossed = null;

    milestones.forEach((milestone, index) => {
      const pip = pips[index];
      if (!pip) return;

      const reached = this.combo > 0 && this.combo >= milestone;
      pip.classList.toggle("reached", reached);

      if (reached && previousCombo < milestone) {
        crossed = { index, milestone };
        pip.classList.remove("pop");
        void pip.offsetWidth;
        pip.classList.add("pop");
      }
    });

    if (crossed) {
      this.celebratePerfectRunMilestone(crossed.index, crossed.milestone);
    }
  },

  // Remise à plat visuelle des pips en tout début de partie (reset()) —
  // le combo lui-même repart déjà de 0 à ce moment-là, ceci évite
  // seulement qu'un pip "reached"/"pop" d'une run précédente ne reste
  // affiché la toute première fois que le badge combo réapparaît.
  resetPerfectRunGauge() {
    const gauge = document.getElementById("perfectRunGauge");
    if (!gauge) return;

    gauge.querySelectorAll(".prg-pip").forEach(pip => {
      pip.classList.remove("reached", "pop");
    });
    gauge.classList.remove("levelup");
  },

  celebratePerfectRunMilestone(index, milestone) {
    Haptics.vibrate(Math.min(140, 20 + milestone * 5));

    const bursts = 3 + index * 2;
    for (let i = 0; i < bursts; i++) {
      const bx = Math.floor(Math.random() * this.SIZE);
      const by = Math.floor(Math.random() * this.SIZE);
      this.spawnParticles(bx, by, 3, "#ffd76a");
    }

    const gauge = document.getElementById("perfectRunGauge");
    if (gauge) {
      gauge.classList.remove("levelup");
      void gauge.offsetWidth;
      gauge.classList.add("levelup");
    }
  },

  // ---------- Combo meter (Phase 13) ----------
  // Barre de décompte à l'intérieur du badge combo, calée sur la même
  // fenêtre que comboUntil (COMBO.WINDOW_MS) et pilotée par gameNow (pas
  // performance.now()) : elle atteint donc zéro EXACTEMENT au moment où
  // Game.update() masque le badge, quel que soit le ralenti (timeScale)
  // en cours au même instant.
  startComboMeter() {
    this.stopComboMeter();

    const fill = document.getElementById("comboMeterFill");
    if (!fill) return;

    const duration = COMBO.WINDOW_MS;
    const start = this.gameNow;
    const untilAtStart = this.comboUntil;

    fill.style.transform = "scaleX(1)";

    const step = () => {
      // Si une validation plus récente a déjà repoussé comboUntil,
      // cette boucle est obsolète : la nouvelle startComboMeter() de
      // l'appel suivant a déjà pris le relais (stopComboMeter() l'aura
      // annulée avant de redémarrer), donc pas de garde supplémentaire
      // nécessaire ici au-delà de comparer à sa propre fenêtre capturée.
      const elapsed = this.gameNow - start;
      const ratio = Math.max(0, 1 - elapsed / duration);

      fill.style.transform = `scaleX(${ratio})`;

      if (ratio > 0 && this.comboUntil === untilAtStart) {
        this.comboMeterFrame = requestAnimationFrame(step);
      } else {
        this.comboMeterFrame = null;
      }
    };

    this.comboMeterFrame = requestAnimationFrame(step);
  },

  stopComboMeter() {
    if (this.comboMeterFrame) {
      cancelAnimationFrame(this.comboMeterFrame);
      this.comboMeterFrame = null;
    }

    const fill = document.getElementById("comboMeterFill");
    if (fill) fill.style.transform = "scaleX(1)";
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

    // Teinte d'accent de l'environnement actif pour les débris de cette
    // célébration (roadmap §3.2, Phase 2) ; retombe sur la couleur de
    // session existante quand l'environnement n'en définit pas (ex.
    // "meadow"), donc aucun changement visuel sur l'environnement de
    // base.
    const accent = VisualTheme.getVfxAccent(Theme.current.light);

    for (let i = 0; i < 10; i++) {
      const x = Math.floor(Math.random() * this.SIZE);
      const y = Math.floor(Math.random() * this.SIZE);
      this.spawnParticles(x, y, 7, "#ffffff");
      if (i % 2 === 0) this.spawnDebris(x, y, accent, 2);
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

    // Le système de changement de couleur de grille est retiré ici
    // (roadmap Phase 2, sur demande explicite) : la grille garde sa
    // couleur pendant toute la partie. Toutes les animations de cette
    // célébration (secousse, halo, ondes de choc, particules)
    // ci-dessus et ci-dessous restent, elles, inchangées.

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

    let hadObstacle = false;
    let i = 0;
    const power = Math.min(5, count);

    for (const key of clearedKeys) {
      const [x, y] = key.split(",").map(Number);
      const value = this.cells[y][x];

      if (value === 3) hadObstacle = true;

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

    // Seul le son de disparition des blocs spéciaux varie par
    // environnement (roadmap Phase 2) ; tous les autres SFX de cette
    // fonction restent partagés et inchangés.
    if (hadObstacle) {
      GameAudio.playObstacleDespawn(this.getObstacleStyleName());
    }

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
