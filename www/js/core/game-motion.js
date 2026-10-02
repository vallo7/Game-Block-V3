/*
  core/game-motion.js
  --------------------------------------------------------------------
  Mouvement vivant de l'écran de jeu (demande explicite) : la grille,
  CHAQUE bloc individuellement, le compteur de meilleur score, le bouton
  pause et le compteur de blocs ont chacun leur propre mouvement, qui
  s'adapte en continu à ce qui se passe dans la partie.

  Aucune règle de jeu n'est touchée et AUCUNE particule n'est ajoutée :
  ce module ne fait que déplacer/incliner/étirer des éléments qui
  existent déjà.

  Principes
  - RESSORTS plutôt que courbes pré-écrites : chaque mouvement réactif
    est une impulsion donnée à un ressort amorti, qui rebondit puis se
    repose tout seul. Deux impulsions rapprochées se composent
    naturellement (pas de saccade ni de redémarrage d'animation), et tout
    reste fluide quelle que soit la cadence d'images.
  - HUMEUR de la partie, lissée (donc jamais de saut) :
      tension  0->1 : remplissage de la grille. Le repos des blocs devient
                      plus ample et plus rapide, la grille se met à
                      "battre" comme un coeur quand ça devient serré.
      énergie  0->1 : combo en cours / gros clears. Tempo et amplitude
                      montent, puis retombent doucement.
      chasse   0->1 : le score approche (ou dépasse) le record de départ :
                      le compteur de meilleur score s'agite de plus en plus.
      activité 0->1 : tombe à 0 en fin de partie (le gel des blocs doit
                      rester immobile) et remonte à la reprise.
  - IMPRÉVISIBILITÉ : chaque bloc a sa "personnalité" (fréquences et phases
    tirées au hasard, retirées à chaque nouvelle pose), le repos mélange
    deux fréquences incommensurables (jamais deux cycles identiques), et
    des "trouvailles" spontanées (un bloc qui saute, une onde qui traverse
    la grille, un clin d'oeil du compteur...) surviennent à des instants
    aléatoires, plus souvent quand la partie est animée.
  - COMPOSITION : les éléments HTML utilisent les propriétés CSS
    individuelles `translate` / `scale` / `rotate`, qui se composent avec
    `transform` au lieu de le remplacer : les rebonds d'appui, l'entrée de
    l'écran et le quake existants continuent de fonctionner. Sans support
    (WebView ancienne), repli sur `transform`.
  - NETTETÉ : au repos exact (aucune impulsion, aucun mouvement), les
    propriétés sont retirées : la grille est alors rendue pixel-parfait,
    sans le léger rééchantillonnage que provoque une transformation. La
    grille n'a donc aucun mouvement de repos permanent : elle réagit aux
    événements, bat quand la tension monte et fait ses trouvailles.
  - COÛT : ressorts de cases et file d'impulsions n'évoluent que tant
    qu'ils bougent ; les éléments HTML ne reçoivent d'écriture que si leur
    valeur change ; tout est coupé si l'utilisateur demande moins
    d'animations (prefers-reduced-motion). Le gouverneur de qualité
    (Game.quality) désactive le repos des blocs au niveau 1 et les ressorts
    de cases au niveau 2 ; les éléments HTML (composités, quasi gratuits)
    restent animés.

  Les points d'entrée motionOn*() sont appelés par les autres modules
  core/ au moment des événements (pose d'une case, validation, clear,
  praise, score, apparition d'un obstacle, tracé invalide, compteur de
  blocs) — de simples impulsions, sans logique de jeu.
  --------------------------------------------------------------------
*/
import { Game } from "./game-state.js";
import { MOTION } from "../config/gameConfig.js";

const TAU = Math.PI * 2;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const frac = (v) => v - Math.floor(v);

const smooth = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const bump = (p, center, sigma) => {
  const d = p - center;
  return Math.exp(-(d * d) / (2 * sigma * sigma));
};

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const sign = () => (Math.random() < 0.5 ? -1 : 1);

const HAS_INDIVIDUAL_TRANSFORMS =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("translate", "1px 1px") &&
  CSS.supports("scale", "1.1") &&
  CSS.supports("rotate", "1deg");

// Ressort amorti 1D (intégration semi-implicite, stable pour les pas
// utilisés ici). x = écart au repos, v = vitesse.
class Spring {
  constructor(k, c) {
    this.k = k;
    this.c = c;
    this.x = 0;
    this.v = 0;
  }

  step(dt) {
    this.v += (-this.k * this.x - this.c * this.v) * dt;
    this.x += this.v * dt;
  }

  kick(v) {
    this.v += v;
  }

  get settled() {
    return Math.abs(this.x) < 0.00015 && Math.abs(this.v) < 0.002;
  }

  reset() {
    this.x = 0;
    this.v = 0;
  }
}

// Un élément HTML animé : 5 ressorts (translation x/y en % de sa propre
// taille, échelle x/y en écart à 1, rotation en degrés) + écriture
// minimale dans le style.
class Rig {
  constructor(el, k, c) {
    this.el = el;
    this.tx = new Spring(k, c);
    this.ty = new Spring(k, c);
    this.sx = new Spring(k, c);
    this.sy = new Spring(k, c);
    this.rot = new Spring(k, c);
    this.atRest = true;
    this._t = "";
    this._s = "";
    this._r = "";
  }

  step(dt) {
    this.tx.step(dt);
    this.ty.step(dt);
    this.sx.step(dt);
    this.sy.step(dt);
    this.rot.step(dt);
  }

  // Remise à plat exacte (styles retirés) — la grille retrouve sa netteté.
  clear() {
    if (this.atRest) return;
    this.atRest = true;
    this._t = this._s = this._r = "";

    const style = this.el.style;

    if (HAS_INDIVIDUAL_TRANSFORMS) {
      style.translate = "";
      style.scale = "";
      style.rotate = "";
    } else {
      style.transform = "";
    }
  }

  // `idle` : { tx, ty, s, rot } — mouvement de repos ajouté aux ressorts.
  apply(idle) {
    const tx = this.tx.x + idle.tx;
    const ty = this.ty.x + idle.ty;
    const sx = 1 + this.sx.x + idle.s;
    const sy = 1 + this.sy.x + idle.s;
    const rot = this.rot.x + idle.rot;

    const flat =
      Math.abs(tx) < 0.003 && Math.abs(ty) < 0.003 &&
      Math.abs(sx - 1) < 0.0004 && Math.abs(sy - 1) < 0.0004 &&
      Math.abs(rot) < 0.02;

    if (flat) {
      this.clear();
      return;
    }

    this.atRest = false;
    const style = this.el.style;

    if (HAS_INDIVIDUAL_TRANSFORMS) {
      const t = `${tx.toFixed(3)}% ${ty.toFixed(3)}%`;
      const s = `${sx.toFixed(4)} ${sy.toFixed(4)}`;
      const r = `${rot.toFixed(3)}deg`;

      if (t !== this._t) { style.translate = t; this._t = t; }
      if (s !== this._s) { style.scale = s; this._s = s; }
      if (r !== this._r) { style.rotate = r; this._r = r; }
    } else {
      const all = `translate(${tx.toFixed(3)}%, ${ty.toFixed(3)}%) rotate(${rot.toFixed(3)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
      if (all !== this._t) { style.transform = all; this._t = all; }
    }
  }

  get settled() {
    return this.tx.settled && this.ty.settled && this.sx.settled && this.sy.settled && this.rot.settled;
  }

  reset() {
    this.tx.reset();
    this.ty.reset();
    this.sx.reset();
    this.sy.reset();
    this.rot.reset();
    this.clear();
  }
}

// Ressorts des cases : k/c réglés pour un rebond franc mais bref (une
// oscillation et demie), assez nerveux pour se lire sur une petite case.
const CELL_K = 190;
const CELL_C = 9;

const FLOURISH_OPTIONS = ["hop", "wave", "board", "best", "pause", "pill"];

Object.assign(Game, {
  // ---------- Initialisation ----------
  initMotion() {
    const size = this.SIZE * this.SIZE;

    const board = document.querySelector(".board-shell");
    const pause = document.getElementById("settingsBtn");
    const best = document.querySelector(".best-score");
    const pill = document.getElementById("availablePill");

    this.reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.motion = {
      // Humeur lissée.
      tension: 0,
      energy: 0,
      chase: 0,
      activity: 1,
      clock: Math.random() * 100,
      beatPhase: 0,
      idleAmp: 0,

      // Ressorts par case (valeurs + vitesses) : décalage en fraction de
      // case, rotation en radians, écart d'échelle.
      ox: new Float32Array(size), vx: new Float32Array(size),
      oy: new Float32Array(size), vy: new Float32Array(size),
      rot: new Float32Array(size), vr: new Float32Array(size),
      sc: new Float32Array(size), vs: new Float32Array(size),
      active: new Uint8Array(size),
      seed: new Float32Array(size),

      // Impulsions différées (ondes) : { at, i, vx, vy, vr, vs }.
      queue: [],

      // Résultat de getCellMotion(), réutilisé (aucune allocation par case).
      out: { ox: 0, oy: 0, rot: 0, sc: 1 },
      idle: { tx: 0, ty: 0, s: 0, rot: 0 },

      // Éléments HTML.
      board: board ? new Rig(board, 190, 11.5) : null,
      pause: pause ? new Rig(pause, 240, 11) : null,
      best: best ? new Rig(best, 210, 10) : null,
      pill: pill ? new Rig(pill, 260, 11) : null,

      nextFlourishIn: rand(MOTION.FLOURISH_MIN_S, MOTION.FLOURISH_MAX_S),
      lastFlourish: null
    };

    for (let i = 0; i < size; i++) this.motion.seed[i] = Math.random();
  },

  motionOn() {
    return Boolean(this.motion) && !this.reduceMotion;
  },

  // Nouvelle partie : tout revient au repos, chaque case reçoit une
  // nouvelle personnalité.
  motionReset() {
    const m = this.motion;
    if (!m) return;

    m.ox.fill(0); m.vx.fill(0);
    m.oy.fill(0); m.vy.fill(0);
    m.rot.fill(0); m.vr.fill(0);
    m.sc.fill(0); m.vs.fill(0);
    m.active.fill(0);
    m.queue.length = 0;

    for (let i = 0; i < m.seed.length; i++) m.seed[i] = Math.random();

    m.tension = 0;
    m.energy = 0;
    m.chase = 0;
    m.nextFlourishIn = rand(MOTION.FLOURISH_MIN_S, MOTION.FLOURISH_MAX_S);
    m.lastFlourish = null;

    ["board", "pause", "best", "pill"].forEach((name) => {
      if (m[name]) m[name].reset();
    });

    this._pillTurn = null;
  },

  // ---------- Impulsions ----------
  kickCell(i, vx, vy, vr, vs) {
    const m = this.motion;
    if (!m || this.quality >= 2) return;

    m.vx[i] += vx;
    m.vy[i] += vy;
    m.vr[i] += vr;
    m.vs[i] += vs;
    m.active[i] = 1;
  },

  queueKick(delayMs, i, vx, vy, vr, vs) {
    const m = this.motion;
    if (!m || this.quality >= 2 || m.queue.length >= MOTION.MAX_QUEUED_IMPULSES) return;

    m.queue.push({ at: this.gameNow + delayMs, i, vx, vy, vr, vs });
  },

  hasBlockAt(x, y) {
    if (x < 0 || x >= this.SIZE || y < 0 || y >= this.SIZE) return false;
    return this.cells[y][x] !== 0;
  },

  // Pousse les blocs voisins (4 directions) en les éloignant de (x, y).
  pushNeighbors(x, y, strength) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    dirs.forEach(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;

      if (!this.hasBlockAt(nx, ny)) return;

      this.kickCell(
        ny * this.SIZE + nx,
        dx * strength,
        dy * strength,
        rand(-0.5, 0.5) * strength,
        0.35 * strength
      );
    });
  },

  // Une case vient d'être ajoutée au tracé : la grille "appuie" vers elle,
  // ses voisines s'écartent. La première case est plus marquée.
  motionOnCellAdded(x, y, isFirst) {
    if (!this.motionOn()) return;

    const m = this.motion;
    const power = isFirst ? 1.5 : 1;

    this.pushNeighbors(x, y, 0.8 * power);

    if (m.board) {
      m.board.sx.kick(-0.07 * power);
      m.board.sy.kick(-0.07 * power);
      m.board.tx.kick(((x - 3.5) / 3.5) * 6 * power);
      m.board.ty.kick(((y - 3.5) / 3.5) * 6 * power);
    }
  },

  // Tracé invalide : petite secousse latérale de la grille, les blocs
  // voisins reculent.
  motionOnInvalid(x, y) {
    if (!this.motionOn()) return;

    const m = this.motion;

    this.pushNeighbors(x, y, 0.55);

    if (m.board) m.board.tx.kick(sign() * 16);
  },

  // Tracé validé : chaque case posée "pop" avec son propre petit
  // balancement et reçoit une nouvelle personnalité de repos.
  motionOnValidate(placed) {
    if (!this.motionOn()) return;

    const m = this.motion;

    placed.forEach((cell, index) => {
      const i = cell.y * this.SIZE + cell.x;

      m.seed[i] = Math.random();

      this.queueKick(index * 28, i, 0, 0, rand(-1, 1) * 1.1, 1.9);
      this.pushNeighbors(cell.x, cell.y, 0.35);
    });

    if (m.board) {
      m.board.sx.kick(0.12);
      m.board.sy.kick(0.12);
    }
  },

  // Lignes/colonnes effacées : une onde de choc traverse la grille depuis
  // chaque ligne détruite (les blocs les plus proches bougent d'abord),
  // et la grille s'étire le long de l'axe effacé.
  motionOnClear(rows, cols, count) {
    if (!this.motionOn()) return;

    const m = this.motion;
    const size = this.SIZE;
    const power = clamp(0.55 + count * 0.3, 0.55, 1.7);

    const wave = (x, y, dist, dx, dy) => {
      if (!this.hasBlockAt(x, y)) return;

      const falloff = 1 / (1 + dist * 0.6);

      this.queueKick(
        dist * 55,
        y * size + x,
        dx * 1.5 * falloff * power + rand(-0.2, 0.2),
        dy * 1.5 * falloff * power + rand(-0.2, 0.2),
        rand(-1, 1) * 1.2 * falloff * power,
        0.9 * falloff * power
      );
    };

    rows.forEach((row) => {
      for (let y = 0; y < size; y++) {
        if (y === row) continue;

        for (let x = 0; x < size; x++) wave(x, y, Math.abs(y - row), 0, Math.sign(y - row));
      }
    });

    cols.forEach((col) => {
      for (let x = 0; x < size; x++) {
        if (x === col) continue;

        for (let y = 0; y < size; y++) wave(x, y, Math.abs(x - col), Math.sign(x - col), 0);
      }
    });

    // Les cases libérées reçoivent une nouvelle personnalité.
    rows.forEach((row) => { for (let x = 0; x < size; x++) m.seed[row * size + x] = Math.random(); });
    cols.forEach((col) => { for (let y = 0; y < size; y++) m.seed[y * size + col] = Math.random(); });

    m.energy = Math.min(1, m.energy + 0.22 * count);

    if (m.board) {
      // Lignes -> étirement horizontal / écrasement vertical ; colonnes -> l'inverse.
      const horizontal = rows.length >= cols.length ? 1 : -1;

      m.board.sx.kick(0.22 * power * horizontal);
      m.board.sy.kick(-0.22 * power * horizontal);
    }

    if (m.pause) m.pause.rot.kick(sign() * (70 + count * 30));
    if (m.best) m.best.ty.kick(-18 - count * 8);
  },

  // Praise : la grille entière encaisse, les blocs ondulent depuis le
  // centre ; l'intensité suit le palier.
  motionOnPraise(level) {
    if (!this.motionOn()) return;

    const m = this.motion;
    const size = this.SIZE;
    const center = (size - 1) / 2;

    m.energy = Math.min(1, m.energy + level * 0.08);

    if (m.board) {
      const v = 0.1 + level * 0.06;

      m.board.sx.kick(v);
      m.board.sy.kick(v);
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!this.hasBlockAt(x, y)) continue;

        const dist = Math.hypot(x - center, y - center);

        this.queueKick(dist * 38, y * size + x, 0, 0, rand(-1, 1) * (0.6 + level * 0.12), 1.0 + level * 0.22);
      }
    }

    if (m.pill) m.pill.sx.kick(0.18 + level * 0.03);
    if (m.pause) m.pause.rot.kick(sign() * (90 + level * 20));
  },

  // Points gagnés : le compteur de meilleur score réagit, d'autant plus
  // que le score est proche du record ; franchir le record de la partie
  // déclenche un grand moment.
  motionOnScore(points, crossedRecord) {
    if (!this.motionOn()) return;

    const best = this.motion.best;
    if (!best) return;

    const weight = clamp(Math.log10(Math.max(10, points)) / 3.5, 0.3, 1.2);
    const excite = 1 + this.motion.chase * 1.5;

    best.ty.kick(-26 * weight * excite);
    best.sx.kick(0.16 * weight * excite);
    best.sy.kick(0.16 * weight * excite);

    if (crossedRecord) {
      best.rot.kick(sign() * 420);
      best.sx.kick(0.9);
      best.sy.kick(0.9);
      best.ty.kick(-90);
    }
  },

  // Un obstacle atterrit : un "poc" sourd dans la grille, les voisins
  // reculent.
  motionOnObstacle(x, y) {
    if (!this.motionOn()) return;

    const m = this.motion;

    this.pushNeighbors(x, y, 0.9);

    const i = y * this.SIZE + x;
    this.kickCell(i, 0, 0, rand(-0.6, 0.6), 1.2);

    if (m.board) {
      m.board.sx.kick(-0.09);
      m.board.sy.kick(-0.09);
      m.board.ty.kick(5);
    }
  },

  // Compteur de blocs : un nouveau tour le fait "tomber" en s'écrasant et
  // en se redressant ; chaque case posée lui donne un hochement ; quand le
  // tracé est complet il se gonfle, prêt à être validé.
  motionOnBlocksChanged(previous, remaining, turnChanged) {
    if (!this.motionOn()) return;

    const pill = this.motion.pill;
    if (!pill) return;

    if (turnChanged) {
      pill.ty.kick(-95);
      pill.sx.kick(0.4);
      pill.sy.kick(-0.28);
      pill.rot.kick(sign() * 60);
      return;
    }

    if (remaining === 0) {
      pill.sx.kick(0.5);
      pill.sy.kick(0.5);
      pill.rot.kick(sign() * 70);
    } else if (previous !== null && remaining < previous) {
      pill.ty.kick(42);
      pill.rot.kick(sign() * 38);
    } else if (previous !== null && remaining > previous) {
      pill.ty.kick(-30);
    }
  },

  // ---------- "Trouvailles" spontanées ----------
  runFlourish() {
    const m = this.motion;
    const size = this.SIZE;

    const occupied = [];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (this.cells[y][x] === 2 || this.cells[y][x] === 3) occupied.push(y * size + x);
      }
    }

    const hasBlocks = occupied.length >= 3 && this.quality < 2;

    const weights = {
      hop: hasBlocks ? 4 : 0,
      wave: hasBlocks ? 3 : 0,
      board: 2,
      best: 2 + m.chase * 4,
      pause: 1 + m.tension * 3,
      pill: 2
    };

    if (m.lastFlourish) weights[m.lastFlourish] = 0;

    let total = 0;
    FLOURISH_OPTIONS.forEach((name) => { total += weights[name]; });
    if (total <= 0) return;

    let roll = Math.random() * total;
    let chosen = FLOURISH_OPTIONS[0];

    for (const name of FLOURISH_OPTIONS) {
      roll -= weights[name];

      if (roll <= 0) {
        chosen = name;
        break;
      }
    }

    m.lastFlourish = chosen;

    switch (chosen) {
      case "hop": {
        const count = 1 + Math.floor(Math.random() * 3);

        for (let n = 0; n < count; n++) {
          const i = occupied[Math.floor(Math.random() * occupied.length)];

          this.queueKick(n * 120, i, rand(-0.3, 0.3), -rand(1.6, 2.6), sign() * rand(0.8, 1.6), rand(1.2, 2.0));
        }
        break;
      }

      case "wave": {
        // Une onde qui traverse la grille dans une direction au hasard.
        const angle = Math.random() * TAU;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        occupied.forEach((i) => {
          const x = i % size;
          const y = Math.floor(i / size);
          const along = (x - 3.5) * dx + (y - 3.5) * dy + 5;

          this.queueKick(along * 48, i, dx * 0.5, dy * 0.5 - 0.7, rand(-0.6, 0.6), 0.9);
        });
        break;
      }

      case "board":
        if (m.board) {
          const v = rand(0.1, 0.2);

          m.board.sx.kick(v);
          m.board.sy.kick(v * rand(0.4, 1));
        }
        break;

      case "best":
        if (m.best) {
          m.best.rot.kick(sign() * rand(110, 190));
          m.best.sx.kick(0.28);
          m.best.sy.kick(0.28);
        }
        break;

      case "pause":
        if (m.pause) m.pause.rot.kick(sign() * rand(220, 330));
        break;

      case "pill":
        if (m.pill) {
          m.pill.ty.kick(-rand(55, 90));
          m.pill.rot.kick(sign() * rand(70, 110));
        }
        break;
    }
  },

  // ---------- Boucle (appelée à chaque image par Game.update) ----------
  updateMotion(realDelta) {
    const m = this.motion;
    if (!m) return;

    const dtReal = Math.min(realDelta, 40) / 1000;
    if (dtReal <= 0) return;

    if (this.reduceMotion) {
      // Rien ne bouge : on s'assure juste que rien n'est resté appliqué.
      ["board", "pause", "best", "pill"].forEach((name) => { if (m[name]) m[name].clear(); });
      return;
    }

    const calm = this.gameOver || this.sequenceRunning;

    // ----- Humeur de la partie, lissée -----
    const fill = this.getFillRatio();
    const tensionTarget = calm ? 0 : smooth(MOTION.TENSION_FROM_FILL, MOTION.TENSION_TO_FILL, fill);

    m.tension += (tensionTarget - m.tension) * (1 - Math.exp(-dtReal * 1.8));

    const comboLive = this.combo >= 2 && this.gameNow < this.comboUntil;
    const energyTarget = comboLive ? clamp(this.combo / 10, 0.25, 1) : 0;

    if (energyTarget > m.energy) m.energy += (energyTarget - m.energy) * (1 - Math.exp(-dtReal * 6));
    else m.energy *= Math.exp(-dtReal * 0.7);

    const record = this.bestAtRunStart || 0;
    const chaseTarget = record > 0 ? smooth(0.55, 1, this.score / record) : 0;

    m.chase += (chaseTarget - m.chase) * (1 - Math.exp(-dtReal * 2));
    m.activity += ((calm ? 0 : 1) - m.activity) * (1 - Math.exp(-dtReal * 2.5));

    const speed = 1 + 1.1 * m.tension + 0.7 * m.energy;
    m.clock += dtReal * speed;

    m.idleAmp = this.quality < 1
      ? lerp(MOTION.BLOCK_IDLE_CALM, MOTION.BLOCK_IDLE_TENSE, m.tension) * (0.85 + 0.5 * m.energy) * m.activity
      : 0;

    // ----- Impulsions différées arrivées à échéance -----
    if (m.queue.length > 0) {
      let write = 0;

      for (let read = 0; read < m.queue.length; read++) {
        const item = m.queue[read];

        if (this.gameNow >= item.at) {
          const i = item.i;

          m.vx[i] += item.vx;
          m.vy[i] += item.vy;
          m.vr[i] += item.vr;
          m.vs[i] += item.vs;
          m.active[i] = 1;
        } else {
          m.queue[write++] = item;
        }
      }

      m.queue.length = write;
    }

    // ----- Ressorts des cases (temps de jeu : suit le ralenti des clears) -----
    if (this.quality < 2) this.stepCellSprings(Math.min(dtReal * this.timeScale, 1 / 30));

    // ----- Trouvailles spontanées -----
    if (!calm && m.activity > 0.5) {
      m.nextFlourishIn -= dtReal * (0.75 + m.energy * 0.8 + m.tension * 0.4);

      if (m.nextFlourishIn <= 0) {
        this.runFlourish();
        m.nextFlourishIn = rand(MOTION.FLOURISH_MIN_S, MOTION.FLOURISH_MAX_S);
      }
    }

    // ----- Éléments HTML -----
    this.stepRigs(dtReal);
  },

  stepCellSprings(dt) {
    const m = this.motion;
    const n = m.active.length;
    const steps = dt > 1 / 55 ? 2 : 1;
    const h = dt / steps;

    for (let i = 0; i < n; i++) {
      if (!m.active[i]) continue;

      let ox = m.ox[i], vx = m.vx[i];
      let oy = m.oy[i], vy = m.vy[i];
      let rot = m.rot[i], vr = m.vr[i];
      let sc = m.sc[i], vs = m.vs[i];

      for (let s = 0; s < steps; s++) {
        vx += (-CELL_K * ox - CELL_C * vx) * h; ox += vx * h;
        vy += (-CELL_K * oy - CELL_C * vy) * h; oy += vy * h;
        vr += (-CELL_K * rot - CELL_C * vr) * h; rot += vr * h;
        vs += (-CELL_K * sc - CELL_C * vs) * h; sc += vs * h;
      }

      const quiet =
        Math.abs(ox) + Math.abs(oy) + Math.abs(rot) + Math.abs(sc) < 0.0006 &&
        Math.abs(vx) + Math.abs(vy) + Math.abs(vr) + Math.abs(vs) < 0.01;

      if (quiet) {
        m.ox[i] = m.oy[i] = m.rot[i] = m.sc[i] = 0;
        m.vx[i] = m.vy[i] = m.vr[i] = m.vs[i] = 0;
        m.active[i] = 0;
        continue;
      }

      m.ox[i] = ox; m.vx[i] = vx;
      m.oy[i] = oy; m.vy[i] = vy;
      m.rot[i] = rot; m.vr[i] = vr;
      m.sc[i] = sc; m.vs[i] = vs;
    }
  },

  stepRigs(dt) {
    const m = this.motion;
    const clock = m.clock;
    const act = m.activity;
    const tension = m.tension;
    const energy = m.energy;
    const chase = m.chase;
    const idle = m.idle;

    // Sous-pas : les ressorts nerveux restent stables même si une image
    // dure plus longtemps que prévu.
    const steps = dt > 1 / 55 ? 2 : 1;
    const h = Math.min(dt, 1 / 30) / steps;

    // ----- Grille : aucun repos permanent (netteté), mais elle bat quand
    // la tension monte -----
    if (m.board) {
      const board = m.board;

      for (let s = 0; s < steps; s++) board.step(h);

      let beat = 0;

      if (tension > 0.3 && act > 0.05) {
        const hz = lerp(MOTION.HEARTBEAT_HZ_CALM, MOTION.HEARTBEAT_HZ_TENSE, tension);

        m.beatPhase = frac(m.beatPhase + dt * hz);

        // "Lub-dub" : deux battements rapprochés, le second plus faible.
        beat = (bump(m.beatPhase, 0.05, 0.035) + 0.6 * bump(m.beatPhase, 0.27, 0.04)) *
          MOTION.HEARTBEAT_SCALE * smooth(0.3, 1, tension) * act;
      }

      idle.tx = 0;
      idle.ty = 0;
      idle.s = beat;
      idle.rot = 0;

      board.apply(idle);
    }

    // ----- Bouton pause : balancement de repos, nerveux quand la tension
    // monte -----
    if (m.pause) {
      const pause = m.pause;

      for (let s = 0; s < steps; s++) pause.step(h);

      const lively = 0.6 + 0.8 * energy + 0.5 * tension;

      idle.tx = 0;
      idle.ty = Math.sin(clock * 1.3 + 1) * 2.2 * lively * act;
      idle.s = Math.sin(clock * 1.1 + 2) * 0.012 * lively * act;
      idle.rot = Math.sin(clock * 0.9) * 1.8 * lively * act;

      pause.apply(idle);
    }

    // ----- Compteur de meilleur score : flotte, s'agite de plus en plus
    // en approchant (puis en dépassant) le record -----
    if (m.best) {
      const best = m.best;

      for (let s = 0; s < steps; s++) best.step(h);

      const excite = 1 + chase * 2.2;
      const tempo = 1 + chase * 0.9;

      idle.tx = 0;
      idle.ty = Math.sin(clock * 0.8 * tempo + 0.7) * 3 * excite * act;
      idle.s = Math.sin(clock * 1.05 * tempo) * 0.01 * excite * act;
      idle.rot = Math.sin(clock * 0.7 * tempo + 1.9) * 0.7 * chase * act;

      best.apply(idle);
    }

    // ----- Compteur de blocs : flotte, grossit en même temps que le tracé
    // avance, tremble quand la grille est presque pleine -----
    if (m.pill) {
      const pill = m.pill;

      for (let s = 0; s < steps; s++) pill.step(h);

      const total = Math.max(1, this.requiredBlocks);
      const progress = clamp(this.path.length / total, 0, 1);
      const nervous = smooth(0.75, 1, tension);

      idle.tx = Math.sin(clock * 9) * 0.7 * nervous * act;
      idle.ty = Math.sin(clock * 1.0 + 2.4) * 3.5 * act;
      idle.s = (Math.sin(clock * 1.2 + 0.5) * 0.013 + progress * 0.05) * act;
      idle.rot = 0;

      pill.apply(idle);
    }
  },

  // ---------- Mouvement d'une case (appelé par drawCells) ----------
  // Renvoie l'objet partagé { ox, oy, rot, sc } : décalage en fraction de
  // case, rotation en radians, facteur d'échelle. Combine les ressorts
  // (réactions aux événements) et le repos propre à la case.
  getCellMotion(x, y, value) {
    const m = this.motion;
    const out = m.out;
    const i = y * this.SIZE + x;

    // Plafonné à ±0,1 case : même au pire d'une onde cumulée à un praise,
    // deux blocs voisins ne se recouvrent que d'un souffle (l'espacement
    // entre blocs est de ~0,07 case).
    out.ox = clamp(m.ox[i], -0.1, 0.1);
    out.oy = clamp(m.oy[i], -0.1, 0.1);
    out.rot = m.rot[i];
    out.sc = 1 + m.sc[i];

    const amp = m.idleAmp;

    // La case du tracé en cours (valeur 1) ne flotte pas : elle suit le doigt.
    if (amp > 0.0004 && value !== 1) {
      const k = value === 3 ? MOTION.OBSTACLE_IDLE_FACTOR : 1;
      const seed = m.seed[i];
      const a = amp * k * (0.7 + 0.6 * frac(seed * 13.7));

      // Deux fréquences incommensurables par axe : le mouvement ne se
      // répète jamais à l'identique.
      const f1 = 0.42 + frac(seed * 7.3) * 0.55;
      const f2 = f1 * 1.618;
      const p = seed * TAU * 5;
      const t = m.clock;

      out.ox += (Math.sin(t * f1 * TAU + p) + 0.45 * Math.sin(t * f2 * TAU + p * 1.7)) * a;
      out.oy += (Math.cos(t * f1 * 0.83 * TAU + p * 1.3) + 0.45 * Math.sin(t * f2 * 0.9 * TAU + p * 0.6)) * a;
      out.rot += Math.sin(t * f1 * 0.6 * TAU + p * 2.1) * a * 0.9;
      out.sc *= 1 + Math.sin(t * f1 * 0.9 * TAU + p * 3.1) * a * 0.8;
    }

    return out;
  }
});
