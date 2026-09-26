/*
  core/game-render.js
  --------------------------------------------------------------------
  Tout le rendu Canvas : grille (image dédiée par environnement,
  roadmap §3.2), cases et leurs animations (spawn/place/validate/
  destroy), particules/débris, faisceaux de ligne, praise/combo FX, et
  les utilitaires géométrie / couleur qui leur sont propres.

  Recalibration grille/blocs (round "grilles redessinées", puis round
  "dézoom") : les images de grille (img/grid/grid-meadow.png,
  img/grid/grid-ice.png) partagent exactement le même cadrage, calibré
  pixel par pixel par Vallo (fichiers de repère). Le cadre extérieur de
  la grille reste maintenant VISIBLE (round "dézoom" : la version
  précédente ne montrait que la zone des cases, en coupant le cadre) :
  GRID_OUTER_CROP ne retire que la marge transparente autour de l'image
  et remplit tout le canvas avec le cadre inclus ; GRID_CELL_RECT donne
  la position de la zone des 8x8 cases À L'INTÉRIEUR de ce canvas
  (désormais plus petite que le canvas entier), utilisée pour décaler
  tout ce qui se dessine en coordonnées de case (Game.draw()) ET pour
  convertir la position du pointeur en case (core/game-input.js).
  CELL_PAD_RATIO est la marge (en fraction de la taille d'une case,
  donc insensible au dézoom) laissée autour de chaque bloc dessiné,
  calibrée pour qu'il recouvre exactement la case visible de la grille
  dessous.
  --------------------------------------------------------------------
*/
import { Game } from "./game-state.js";
import { Theme } from "../services/theme.js";
import { VisualTheme } from "../services/visualtheme.js";
import { Tutorial } from "../ui/tutorial.js";

Object.assign(Game, {
  hexToRgb(hex) {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  },

  lerpColor(hexA, hexB, t) {
    const a = this.hexToRgb(hexA);
    const b = this.hexToRgb(hexB);
    const clampT = Math.max(0, Math.min(1, t));

    const r = Math.round(a.r + (b.r - a.r) * clampT);
    const g = Math.round(a.g + (b.g - a.g) * clampT);
    const bl = Math.round(a.b + (b.b - a.b) * clampT);

    return `rgb(${r}, ${g}, ${bl})`;
  },

  getBankColor(name) {
    if (name === "stone") return this.STONE_COLOR;
    if (name === "ice") return this.ICE_COLOR;
    return this.COLOR_BANK.find(c => c.name === name) || this.COLOR_BANK[0];
  },

  buildFrameGradients() {
    const cellSize = this.getCellSize();
    const ctx = this.ctx;

    const sizeChanged = this._gradCellSize !== cellSize;
    const themeChanged = this._gradThemeLight !== Theme.current.light || this._gradThemeDark !== Theme.current.dark;

    if (!sizeChanged && !themeChanged) return;

    if (sizeChanged || !this.frameGradients[1]) {
      let g = ctx.createLinearGradient(0, 0, 0, cellSize);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, "#e2e2e2");
      this.frameGradients[1] = g;

      g = ctx.createLinearGradient(0, 0, 0, cellSize);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, "#dcdcdc");
      this.frameGradients[2] = g;

      g = ctx.createLinearGradient(0, 0, 0, cellSize);
      g.addColorStop(0, this.ICE_COLOR.light);
      g.addColorStop(1, this.ICE_COLOR.base);
      this.frameGradients.ice = g;

      g = ctx.createLinearGradient(0, 0, 0, cellSize);
      g.addColorStop(0, this.STONE_COLOR.light);
      g.addColorStop(1, this.STONE_COLOR.base);
      this.frameGradients.stone = g;
    }

    if (sizeChanged || themeChanged) {
      const g = ctx.createLinearGradient(0, 0, 0, cellSize);
      g.addColorStop(0, Theme.current.light);
      g.addColorStop(1, Theme.current.dark);
      this.frameGradients[3] = g;
    }

    this._gradCellSize = cellSize;
    this._gradThemeLight = Theme.current.light;
    this._gradThemeDark = Theme.current.dark;
  },

  getGlowSprite(rgb) {
    if (this.glowCache[rgb]) return this.glowCache[rgb];

    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;

    const g = c.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);

    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);

    this.glowCache[rgb] = c;
    return c;
  },

  getCellSize() {
    return (this.canvas.width * this.GRID_CELL_RECT.w) / this.SIZE;
  },

  // Décalage (en pixels canvas) du coin haut-gauche de la zone de jeu
  // (les 8x8 cases) par rapport au coin haut-gauche du canvas — le
  // canvas montre maintenant le cadre de la grille tout autour de
  // cette zone (round "dézoom"). Game.draw() applique ce décalage via
  // ctx.translate() une fois pour tout ce qui se dessine en
  // coordonnées de case, plutôt que de l'ajouter à chaque calcul de
  // position dans chaque fonction de dessin ; core/game-input.js
  // l'utilise à l'identique pour convertir la position du pointeur en
  // case (voir GRID_CELL_RECT plus bas).
  getBoardOffsetX() {
    return this.canvas.width * this.GRID_CELL_RECT.x;
  },

  getBoardOffsetY() {
    return this.canvas.height * this.GRID_CELL_RECT.y;
  },

  getCellCenterX(x) {
    return x * this.getCellSize() + this.getCellSize() / 2;
  },

  getCellCenterY(y) {
    return y * this.getCellSize() + this.getCellSize() / 2;
  },

  easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;

    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },

  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  },

  roundRectPath(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    const ctx = this.ctx;

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  },

  roundRectPathOn(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  },

  drawGlow(x, y, radius, rgb, alpha) {
    const ctx = this.ctx;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.getGlowSprite(rgb), x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  },

  draw() {
    const ctx = this.ctx;
    const now = this.gameNow;
    // Décalage de la zone de jeu (cases) par rapport au canvas, qui
    // montre maintenant le cadre de la grille tout autour (round
    // "dézoom" — voir getBoardOffsetX/Y). Calculé une fois par frame,
    // appliqué via ctx.translate() autour de chaque bloc de dessin qui
    // travaille en coordonnées de case — tout le reste (halo/onde de
    // choc/texte flottant centrés sur le plateau entier, lumière du
    // pointeur) continue d'utiliser les coordonnées canvas normales,
    // donc reste centré sur le plateau visible en entier, cadre inclus.
    const offsetX = this.getBoardOffsetX();
    const offsetY = this.getBoardOffsetY();

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.buildFrameGradients();

    this.drawAmbientLight();
    this.drawBoard();

    ctx.save();
    ctx.translate(offsetX, offsetY);
    this.drawCells();
    this.drawDestroyAnims(now);
    this.drawCellFlashes(now);
    this.drawLineFlashes(now);
    this.drawLineBeams(now);
    ctx.restore();

    this.drawLightWave(now);
    this.drawShockwaves(now);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    this.drawCancelAnims(now);
    ctx.restore();

    this.drawFloatingTexts(now);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    this.drawParticles();
    this.drawDebris();
    ctx.restore();

    this.drawPointerLight();

    if (Tutorial.active) {
      ctx.save();
      ctx.translate(offsetX, offsetY);
      Tutorial.drawOnCanvas(ctx, now);
      ctx.restore();
    }
  },

  drawAmbientLight() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const t = this.gameNow / 1000;

    this.drawGlow(
      w * 0.5 + Math.sin(t * 0.5) * w * 0.28,
      h * 0.28 + Math.cos(t * 0.35) * h * 0.16,
      w * 0.55,
      Theme.rgb(VisualTheme.getVfxAccent(Theme.current.light)),
      0.06
    );

    this.drawGlow(
      w * 0.5 + Math.cos(t * 0.42) * w * 0.3,
      h * 0.75 + Math.sin(t * 0.5) * h * 0.14,
      w * 0.5,
      "255,255,255",
      0.04
    );
  },

  drawPointerLight() {
    if (!this.pointer.active || this.gameOver) return;

    this.drawGlow(
      this.pointer.x,
      this.pointer.y,
      this.getCellSize() * 2.4,
      "255,255,255",
      0.12
    );
  },

  // Cadrage appliqué à l'image source avant de l'étirer sur tout le
  // canvas : ne retire que la marge transparente, le cadre de la
  // grille est conservé (round "dézoom" — voir en-tête de fichier).
  // Fractions de l'image brute 2500x2500, mesurées sur le canal alpha.
  GRID_OUTER_CROP: { x: 0.044, y: 0.05, w: 0.9116, h: 0.9 },

  // Position de la zone des 8x8 cases à l'intérieur de l'image ainsi
  // cadrée (donc à l'intérieur du canvas) — calibrée pixel par pixel
  // sur les fichiers de repère (voir en-tête de fichier).
  GRID_CELL_RECT: { x: 0.0351, y: 0.0369, w: 0.9302, h: 0.9258 },

  // Marge laissée entre le bord d'une case (cellSize) et le bloc qui y
  // est dessiné, en fraction de cellSize — insensible au dézoom
  // ci-dessus puisque cellSize en tient déjà compte (getCellSize()).
  CELL_PAD_RATIO: 0.033,

  drawBoard() {
    const ctx = this.ctx;
    const env = VisualTheme.getActiveEnvironment();
    const gridImg = this.gridImages && this.gridImages[env.id];

    // Cadre de la grille inclus (round "dézoom") : on ne retire que la
    // marge transparente (GRID_OUTER_CROP), puis on étire sur tout le
    // canvas. Les cases logiques sont décalées séparément dans
    // Game.draw() (voir getBoardOffsetX/Y et GRID_CELL_RECT).
    if (gridImg && gridImg.complete && gridImg.naturalWidth) {
      const c = this.GRID_OUTER_CROP;
      const sx = gridImg.naturalWidth * c.x;
      const sy = gridImg.naturalHeight * c.y;
      const sw = gridImg.naturalWidth * c.w;
      const sh = gridImg.naturalHeight * c.h;

      ctx.drawImage(
        gridImg,
        sx, sy, sw, sh,
        0, 0, this.canvas.width, this.canvas.height
      );

      return;
    }

    // Filet de sécurité tant que l'image de grille de l'environnement
    // actif charge encore : aplat uni dans la teinte de fond de la
    // grille (identique au comportement historique avant l'arrivée des
    // assets de grille).
    ctx.fillStyle = Theme.getGridBackdrop(Theme.getGridColor());
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  },

  getColorFxState(x, y, now) {
    if (!this.colorFx) return null;

    const age = now - this.colorFx.start;

    if (age > this.colorFx.duration) {
      this.colorFx = null;
      return null;
    }

    const ring = Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5));
    const wave = (age / this.colorFx.duration) * 6.5;

    const pulse = 1 + 0.05 * Math.sin(age / 42 + ring * 1.3);

    const d = wave - ring;
    let glow = 0;

    if (d > -0.9 && d < 1.7) {
      glow = 0.6 * Math.max(0, 1 - Math.abs(d - 0.4) / 1.3);
    }

    return { pulse, glow };
  },

  getFreezeState(x, y, now) {
    if (!this.freezeFx) return 0;

    const delay = this.freezeDelays[`${x},${y}`] ?? 0;
    const ft = now - (this.freezeFx.start + delay);

    if (ft <= 0) return 0;

    return Math.min(1, ft / 220);
  },

  getShakeOffset(x, y, now) {
    if (!this.blockShake) return 0;

    const age = now - this.blockShake.start;

    if (age > this.blockShake.duration) {
      this.blockShake = null;
      return 0;
    }

    const power = Math.pow(1 - age / this.blockShake.duration, 2);
    const phase = (x * 13 + y * 7) * 40;

    return Math.sin((now + phase) / 26) * this.getCellSize() * 0.07 * power;
  },

  getAfterGlowAlpha(x, y, now) {
    if (!this.afterGlow) return 0;

    const age = now - this.afterGlow.start;

    if (age > this.afterGlow.duration) {
      this.afterGlow = null;
      return 0;
    }

    const level = this.afterGlow.level;
    const fade = 1 - age / this.afterGlow.duration;
    const speed = 150 - level * 22;
    const phase = (x * 7 + y * 13) * 0.7;

    const flicker = (Math.sin(now / speed + phase) + 1) / 2;

    return (0.06 + level * 0.05) * flicker * fade;
  },

  getIdleBreath(x, y, value, now) {
    if (value !== 2) return 1;

    const phase = (x * 12.9 + y * 7.3) % (Math.PI * 2);
    const period = 2800 + ((x * 3 + y * 5) % 5) * 140;

    return 1 + Math.sin(now / period + phase) * 0.014;
  },

  drawCells() {
    const cellSize = this.getCellSize();
    const now = this.gameNow;

    // for...in direct plutôt qu'Object.keys() : évite d'allouer un
    // tableau de clés à chaque frame. Supprimer la clé courante pendant
    // un for...in est sûr (spec ECMAScript) et ne perturbe pas le reste
    // de l'énumération.
    for (const key in this.cellAnims) {
      const anim = this.cellAnims[key];
      const duration = anim.type === "spawn" ? 420 : (anim.type === "place-first" ? 320 : 260);

      if (now - anim.start > duration) {
        delete this.cellAnims[key];
      }
    }

    for (let y = 0; y < this.SIZE; y++) {
      for (let x = 0; x < this.SIZE; x++) {
        const value = this.cells[y][x];

        if (value === 0) continue;

        const shake = this.getShakeOffset(x, y, now);
        const anim = this.cellAnims[`${x},${y}`];
        let scale = 1;
        let alpha = 1;
        let glow = 0;

        if (anim) {
          const animDuration = anim.type === "spawn" ? 420 : (anim.type === "place-first" ? 320 : 260);
          const age = Math.min(1, (now - anim.start) / animDuration);

          if (anim.type === "spawn") {
            scale = this.easeOutBack(age);
          } else if (anim.type === "place") {
            scale = 0.7 + 0.3 * this.easeOutBack(age);
          } else if (anim.type === "place-first") {
            // Phase 14 (juice des chaînes) : pop nettement plus ample que
            // le "place" standard (départ plus petit, overshoot plus
            // marqué) — réservé à la case qui ouvre le tracé.
            scale = 0.3 + 0.7 * this.easeOutBack(age);
          } else if (anim.type === "validate") {
            scale = 1 + 0.16 * Math.sin(age * Math.PI);
          }
        }

        if (value === 1) alpha = 0.55;

        const fx = this.getColorFxState(x, y, now);

        if (fx) {
          scale *= fx.pulse;
          glow = fx.glow;
        }

        scale *= this.getIdleBreath(x, y, value, now);

        this.drawCellAt(x, y, value, scale, alpha, shake);

        const ctx = this.ctx;
        const px = x * cellSize + shake;
        const py = y * cellSize;
        const pad = cellSize * this.CELL_PAD_RATIO;
        const box = cellSize - pad * 2;
        const r = cellSize * 0.26;
        const center = cellSize / 2;

        if (glow > 0) {
          ctx.save();
          ctx.globalAlpha = glow;
          ctx.translate(px + center, py + center);
          ctx.scale(scale, scale);
          ctx.translate(-center, -center);
          ctx.fillStyle = "#ffffff";
          this.roundRectPath(pad, pad, box, box, r);
          ctx.fill();
          ctx.restore();
        }

        const ice = this.getFreezeState(x, y, now);

        if (ice > 0) {
          const iceScale = 1 + 0.12 * Math.sin(ice * Math.PI);
          const overlayStyle = this.getDefeatOverlayStyleName();
          const overlayImg = this.blockImages[overlayStyle];

          ctx.save();
          ctx.globalAlpha = ice * 0.92;

          ctx.translate(px + center, py + center);
          ctx.scale(iceScale, iceScale);
          ctx.translate(-center, -center);

          if (overlayImg && overlayImg.complete && overlayImg.naturalWidth) {
            this.drawBlockImage(ctx, overlayImg, pad, pad, box, box);
          } else {
            ctx.fillStyle = this.frameGradients[overlayStyle];
            this.roundRectPath(pad, pad, box, box, r);
            ctx.fill();
          }

          ctx.restore();
        }

        const after = this.getAfterGlowAlpha(x, y, now);

        if (after > 0) {
          ctx.save();
          ctx.globalAlpha = after;
          ctx.translate(px + center, py + center);
          ctx.translate(-center, -center);
          ctx.fillStyle = "#ffffff";
          this.roundRectPath(pad, pad, box, box, r);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  },

  getStoneSeed(x, y) {
    const key = `${x},${y}`;

    if (this.stoneSeeds[key] === undefined) {
      this.stoneSeeds[key] = Math.random() * 1000;
    }

    return this.stoneSeeds[key];
  },

  getStoneJitter(x, y, now) {
    const seed = this.getStoneSeed(x, y);
    const cellSize = this.getCellSize();

    // Tremblement irrégulier : courte secousse rapide, puis longue pause
    // aléatoire (durée de cycle et déphasage propres à chaque bloc).
    const cycleLength = 9000 + (seed % 12000);
    const burstLength = 220;
    const t = (now + seed * 137) % cycleLength;

    if (t > burstLength) return { x: 0, y: 0 };

    const intensity = 1 - t / burstLength;

    const jx = Math.sin(t / 26 + seed * 3.1) * cellSize * 0.022 * intensity;
    const jy = Math.cos(t / 21 + seed * 4.7) * cellSize * 0.02 * intensity;

    return { x: jx, y: jy };
  },

  // Marge transparente mesurée sur les images de blocs fournies : on la
  // recadre pour que le bloc visible remplisse sa case au maximum.
  BLOCK_CROP: { x: 0.0502, y: 0.0574, w: 0.8955, h: 0.8804 },

  drawBlockImage(ctx, img, dx, dy, dw, dh) {
    const c = this.BLOCK_CROP;
    const sx = img.naturalWidth * c.x;
    const sy = img.naturalHeight * c.y;
    const sw = img.naturalWidth * c.w;
    const sh = img.naturalHeight * c.h;

    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  },

  getCellImage(x, y, value) {
    if (value === 3) return this.blockImages[this.getObstacleStyleName()];

    const name = this.cellColors[`${x},${y}`];
    const entry = this.getBankColor(name);

    return this.blockImages[entry.name];
  },

  drawCellAt(x, y, value, scale, alpha, shakeX = 0) {
    const cellSize = this.getCellSize();
    const ctx = this.ctx;

    let jitterX = 0;
    let jitterY = 0;

    if (value === 3) {
      const jitter = this.getStoneJitter(x, y, this.gameNow);
      jitterX = jitter.x;
      jitterY = jitter.y;
    }

    const px = x * cellSize + shakeX + jitterX;
    const py = y * cellSize + jitterY;
    const pad = cellSize * this.CELL_PAD_RATIO;
    const box = cellSize - pad * 2;
    const center = cellSize / 2;

    const img = this.getCellImage(x, y, value);

    ctx.save();

    ctx.globalAlpha = alpha;

    ctx.translate(px + center, py + center);
    ctx.scale(scale, scale);
    ctx.translate(-center, -center);

    if (img && img.complete && img.naturalWidth) {
      this.drawBlockImage(ctx, img, pad, pad, box, box);
    } else {
      // Filet de sécurité tant que l'image charge encore
      const fallback = value === 3 ? this.getObstacleStyleColor() : this.getBankColor(this.cellColors[`${x},${y}`]);
      this.roundRectPath(pad, pad, box, box, cellSize * 0.22);
      ctx.fillStyle = fallback.base;
      ctx.fill();
    }

    ctx.restore();
  },

  // Round "bubble pop" : la destruction d'un bloc n'a plus besoin de
  // particules/débris (retirés de core/game-rules.js#processClears) —
  // tout se joue ici, avec un anneau qui "éclate" en plus du
  // grossissement/rotation déjà existants. Durée adaptative (±70ms selon
  // `power`) et anneau dont le rayon/l'alpha grandissent avec la
  // puissance du clear, pour que les gros combos se sentent nettement
  // plus généreux sans dépendre d'un système de particules séparé.
  drawDestroyAnims(now) {
    const ctx = this.ctx;
    const cellSize = this.getCellSize();
    const RECOLOR_END = 0.4;

    // Compaction en place (même résultat que l'ancien .filter(), sans
    // réallouer un tableau à chaque frame) : on ne garde que les entrées
    // encore actives, dans le même ordre qu'avant.
    //
    // Correctif (round performance) : une entrée dont le départ décalé
    // (start = gameNow + stagger, voir processClears()) n'est pas
    // encore atteint reste maintenant en file au lieu d'être jetée.
    // L'ancienne condition traitait "pas encore démarré" et "déjà
    // terminé" de la même façon (skip = disparition définitive du
    // tableau compacté dès cette frame), ce qui supprimait pour de bon
    // les cases décalées d'un clear multi-lignes/multi-cases avant
    // même qu'elles aient eu la chance de démarrer, dès que le rendu de
    // la frame suivante arrivait avant leur propre décalage — un clear
    // de grande ampleur (le moment le plus spectaculaire du jeu)
    // perdait donc une bonne partie de son animation "bulle qui
    // éclate", ce qui se lisait comme une saccade/un raté plutôt qu'un
    // vrai ralentissement CPU.
    let destroyWrite = 0;

    const pad = cellSize * this.CELL_PAD_RATIO;
    const box = cellSize - pad * 2;
    const center = cellSize / 2;

    for (let readIndex = 0; readIndex < this.destroyAnims.length; readIndex++) {
      const a = this.destroyAnims[readIndex];
      const power = Math.min(5, a.power || 1);
      const duration = 380 + power * 14;

      if (now - a.start >= duration) continue;
      this.destroyAnims[destroyWrite++] = a;
      if (now < a.start) continue;

      const t = (now - a.start) / duration;
      const boost = 1 + power * 0.09;

      const colorT = Math.min(1, t / RECOLOR_END);
      const popT = Math.max(0, (t - RECOLOR_END) / (1 - RECOLOR_END));

      // Phase "tension" (bulle qui se tend juste avant d'éclater) : léger
      // aplatissement asymétrique plutôt qu'un simple pulse uniforme.
      // Phase "pop" : grossissement soudain puis retombée vers 0,
      // identique à l'esprit d'origine.
      let growX, growY;
      if (t < RECOLOR_END) {
        const pulse = Math.sin(colorT * Math.PI);
        growX = 1 + 0.07 * pulse;
        growY = 1 - 0.05 * pulse;
      } else {
        const g = 1.3 * boost * (1 - popT);
        growX = g;
        growY = g;
      }

      const alpha = t < RECOLOR_END ? 1 : 1 - popT;
      const rot = (popT * (0.5 + power * 0.12)) * (((a.x + a.y) % 2 === 0) ? 1 : -1);

      const px = a.x * cellSize;
      const py = a.y * cellSize;

      ctx.save();

      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(px + center, py + center);
      ctx.rotate(rot);
      ctx.scale(Math.max(0.01, growX), Math.max(0.01, growY));
      ctx.translate(-center, -center);

      const fromImg = a.fromName ? this.blockImages[a.fromName] : null;
      const toImg = a.toName ? this.blockImages[a.toName] : null;

      if (fromImg && fromImg.complete && colorT < 1) {
        this.drawBlockImage(ctx, fromImg, pad, pad, box, box);
      }

      if (toImg && toImg.complete) {
        const baseAlpha = ctx.globalAlpha;
        ctx.globalAlpha = baseAlpha * colorT;
        this.drawBlockImage(ctx, toImg, pad, pad, box, box);
        ctx.globalAlpha = baseAlpha;
      } else if (!fromImg || !fromImg.complete) {
        this.roundRectPath(pad, pad, box, box, cellSize * 0.22);
        ctx.fillStyle = a.toColor || "#ffffff";
        ctx.fill();
      }

      ctx.restore();

      // Anneau "bubble pop" : indépendant de la transformation du bloc
      // (ne tourne/ne s'étire pas avec lui) — un cercle qui s'étend et
      // s'efface, adaptatif avec `power`.
      if (popT > 0) {
        const ringT = Math.min(1, popT);
        const ringRadius = cellSize * (0.32 + ringT * (0.62 + power * 0.1));
        const ringAlpha = (1 - ringT) * (0.5 + power * 0.06);
        const rgb = this.hexToRgb(a.toColor || "#ffffff");

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${ringAlpha})`;
        ctx.lineWidth = Math.max(1.4, cellSize * 0.045 * (1 - ringT * 0.5));
        ctx.beginPath();
        ctx.arc(px + center, py + center, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    this.destroyAnims.length = destroyWrite;
  },

  drawCellFlashes(now) {
    const ctx = this.ctx;
    const cellSize = this.getCellSize();

    let cellFlashWrite = 0;

    const pad = cellSize * this.CELL_PAD_RATIO;
    const box = cellSize - pad * 2;
    const r = cellSize * 0.26;
    const center = cellSize / 2;

    for (let readIndex = 0; readIndex < this.cellFlashes.length; readIndex++) {
      const flash = this.cellFlashes[readIndex];
      // Même correctif que drawDestroyAnims() ci-dessus : une entrée pas
      // encore démarrée (départ décalé) reste en file au lieu d'être
      // supprimée avant d'avoir pu jouer.
      if (now - flash.start >= 380) continue;
      this.cellFlashes[cellFlashWrite++] = flash;
      if (now < flash.start) continue;
      const t = (now - flash.start) / 380;
      const power = Math.min(5, flash.power || 1);
      const alpha = Math.sin(Math.PI * t) * (0.85 + power * 0.06);

      const px = flash.x * cellSize;
      const py = flash.y * cellSize;

      ctx.save();

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * 0.35;
      ctx.translate(px + center, py + center);
      ctx.scale(1.25 + 0.15 * t, 1.25 + 0.15 * t);
      ctx.translate(-center, -center);
      ctx.fillStyle = flash.color || "#ffffff";
      this.roundRectPath(pad, pad, box, box, r);
      ctx.fill();

      ctx.restore();

      ctx.save();

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      ctx.translate(px + center, py + center);
      ctx.scale(1 + 0.3 * t, 1 + 0.3 * t);
      ctx.translate(-center, -center);
      ctx.fillStyle = "#ffffff";
      this.roundRectPath(pad, pad, box, box, r);
      ctx.fill();

      ctx.restore();
    }

    this.cellFlashes.length = cellFlashWrite;
  },

  drawFloatingTexts(now) {
    const ctx = this.ctx;

    let floatingWrite = 0;

    for (let readIndex = 0; readIndex < this.floatingTexts.length; readIndex++) {
      const item = this.floatingTexts[readIndex];
      if (!(now - item.start < 1000)) continue;
      this.floatingTexts[floatingWrite++] = item;
      const age = now - item.start;
      const t = age / 1000;

      const scale = this.easeOutBack(Math.min(1, age / 220));
      const y = item.y - t * this.getCellSize() * 0.8;
      const alpha = 1 - Math.max(0, (age - 600) / 400);

      ctx.save();

      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(item.x, y);
      ctx.scale(scale, scale);

      ctx.font = `900 ${Math.floor(this.getCellSize() * 0.55)}px "Baloo 2", Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillText(item.text, 0, 4);

      ctx.fillStyle = item.color;
      ctx.fillText(item.text, 0, 0);

      ctx.restore();
    }

    this.floatingTexts.length = floatingWrite;
  },

  drawLightWave(now) {
    if (!this.lightWave) return;

    const age = now - this.lightWave.start;
    const duration = 900;

    if (age > duration) {
      this.lightWave = null;
      return;
    }

    const p = age / duration;
    const level = this.lightWave.level;

    const maxR = this.canvas.width * (0.55 + level * 0.25);
    const size = p * maxR;
    const thickness = this.getCellSize() * (0.25 + level * 0.12);
    const alpha = (0.3 + level * 0.1) * (1 - p * 0.6);

    const ctx = this.ctx;

    ctx.save();

    ctx.globalCompositeOperation = "lighter";

    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
    ctx.lineWidth = thickness * 1.8;
    this.roundRectPath(
      this.canvas.width / 2 - size,
      this.canvas.height / 2 - size,
      size * 2,
      size * 2,
      30
    );
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = thickness;
    this.roundRectPath(
      this.canvas.width / 2 - size,
      this.canvas.height / 2 - size,
      size * 2,
      size * 2,
      30
    );
    ctx.stroke();

    ctx.restore();
  },

  // Note (round "dézoom") : ces deux fonctions dessinent en
  // coordonnées de case, à l'intérieur du ctx.translate() posé par
  // Game.draw() — cellSize * this.SIZE représente donc la largeur/
  // hauteur de la zone de jeu (playfield), PAS this.canvas.width/height
  // qui est désormais plus grand (cadre de la grille inclus) : utiliser
  // les dimensions du canvas ici ferait déborder la bande de ligne ou
  // le faisceau bien au-delà du plateau, dans le cadre.
  drawLineFlashes(now) {
    const ctx = this.ctx;
    const cellSize = this.getCellSize();

    let lineFlashWrite = 0;

    for (let readIndex = 0; readIndex < this.lineFlashes.length; readIndex++) {
      const flash = this.lineFlashes[readIndex];
      if (!(now - flash.start < 380)) continue;
      this.lineFlashes[lineFlashWrite++] = flash;
      const power = Math.min(5, flash.power || 1);
      const age = (now - flash.start) / 380;
      const flare = Math.max(0, 1 - age * 3.2);
      const alpha = (0.22 + power * 0.05) * (1 - age) + flare * 0.4;
      const rgb = this.hexToRgb(flash.color || "#ffffff");

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;

      if (flash.type === "row") {
        ctx.fillRect(0, flash.index * cellSize, cellSize * this.SIZE, cellSize);
      } else {
        ctx.fillRect(flash.index * cellSize, 0, cellSize, cellSize * this.SIZE);
      }

      ctx.restore();
    }

    this.lineFlashes.length = lineFlashWrite;
  },

  drawLineBeams(now) {
    const ctx = this.ctx;
    const cellSize = this.getCellSize();

    let lineBeamWrite = 0;

    for (let readIndex = 0; readIndex < this.lineBeams.length; readIndex++) {
      const beam = this.lineBeams[readIndex];
      // Chaque faisceau a sa propre durée adaptative (vitesse liée au
      // combo, cf. core/game-rules.js#processClears) — repli sur 620ms
      // pour rester compatible avec d'éventuelles entrées plus
      // anciennes sans le champ. Même correctif que drawDestroyAnims/
      // drawCellFlashes : une entrée pas encore démarrée (départ décalé
      // en rafale) reste en file au lieu d'être jetée avant d'avoir pu
      // jouer.
      const duration = beam.duration || 620;

      if (!(now - beam.start < duration)) continue;
      this.lineBeams[lineBeamWrite++] = beam;
      if (now < beam.start) continue;

      const age = (now - beam.start) / duration;
      const progress = this.easeOutCubic(Math.min(1, age));

      const power = Math.min(5, beam.power);
      const trail = cellSize * (1 + power * 0.6);
      const thickness = cellSize * (0.22 + power * 0.08);
      const alpha = Math.min(0.85, 0.3 + power * 0.12) * (1 - age * 0.6);
      const rgb = this.hexToRgb(beam.color || "#ffffff");
      const rgbStr = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      if (beam.type === "row") {
        const y = beam.index * cellSize + cellSize / 2;
        const head = -trail + (cellSize * this.SIZE + trail * 2) * progress;

        const gradient = ctx.createLinearGradient(head - trail, 0, head, 0);
        gradient.addColorStop(0, `rgba(${rgbStr}, 0)`);
        gradient.addColorStop(1, `rgba(${rgbStr}, ${alpha})`);

        ctx.fillStyle = gradient;
        ctx.fillRect(head - trail, y - thickness / 2, trail, thickness);

        if (power >= 3) {
          ctx.fillStyle = `rgba(${rgbStr}, ${alpha * 0.4})`;
          ctx.fillRect(head - trail, y - thickness, trail, thickness * 2);
        }
      } else {
        const x = beam.index * cellSize + cellSize / 2;
        const head = -trail + (cellSize * this.SIZE + trail * 2) * progress;

        const gradient = ctx.createLinearGradient(0, head - trail, 0, head);
        gradient.addColorStop(0, `rgba(${rgbStr}, 0)`);
        gradient.addColorStop(1, `rgba(${rgbStr}, ${alpha})`);

        ctx.fillStyle = gradient;
        ctx.fillRect(x - thickness / 2, head - trail, thickness, trail);

        if (power >= 3) {
          ctx.fillStyle = `rgba(${rgbStr}, ${alpha * 0.4})`;
          ctx.fillRect(x - thickness, head - trail, thickness * 2, trail);
        }
      }

      ctx.restore();
    }

    this.lineBeams.length = lineBeamWrite;
  },

  drawShockwaves(now) {
    const ctx = this.ctx;

    let shockwaveWrite = 0;

    for (let readIndex = 0; readIndex < this.shockwaves.length; readIndex++) {
      const wave = this.shockwaves[readIndex];
      if (!(now - wave.start < 460)) continue;
      this.shockwaves[shockwaveWrite++] = wave;
      const age = (now - wave.start) / 460;
      const radius = wave.maxRadius * age;
      const alpha = 0.32 * (1 - age);
      const rgb = this.hexToRgb(wave.color || "#ffffff");

      ctx.save();

      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
      ctx.lineWidth = Math.max(1, this.getCellSize() * 0.05 * (1 - age));

      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    this.shockwaves.length = shockwaveWrite;
  },

  drawCancelAnims(now) {
    const ctx = this.ctx;
    const cellSize = this.getCellSize();

    const pad = cellSize * this.CELL_PAD_RATIO;
    const box = cellSize - pad * 2;
    const r = cellSize * 0.26;
    const center = cellSize / 2;

    let cancelWrite = 0;

    for (let readIndex = 0; readIndex < this.cancelAnims.length; readIndex++) {
      const anim = this.cancelAnims[readIndex];
      if (!(now - anim.start < 260)) continue;
      this.cancelAnims[cancelWrite++] = anim;
      const age = (now - anim.start) / 260;
      const scale = 1 - age * 0.45;
      const alpha = 0.5 * (1 - age);

      const px = anim.x * cellSize;
      const py = anim.y * cellSize;

      ctx.save();

      ctx.globalAlpha = alpha;

      ctx.translate(px + center, py + center);
      ctx.scale(scale, scale);
      ctx.translate(-center, -center);

      ctx.fillStyle = "#ef4444";
      this.roundRectPath(pad, pad, box, box, r);
      ctx.fill();

      ctx.restore();
    }

    this.cancelAnims.length = cancelWrite;
  },

  drawParticles() {
    const ctx = this.ctx;
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < this.particles.length; readIndex++) {
      const p = this.particles[readIndex];
      p.x += p.vx * this.timeScale;
      p.y += p.vy * this.timeScale;
      p.vx *= Math.pow(0.985, this.timeScale);
      p.vy += this.getCellSize() * 0.004 * this.timeScale;
      p.rotation += (p.vr || 0) * this.timeScale;
      p.life -= p.decay * this.timeScale;

      if (p.life <= 0) continue;

      this.particles[writeIndex++] = p;

      const alpha = Math.max(p.life, 0);

      // Lueur des particules "big" : sprite radial pré-rendu et mis en
      // cache (getGlowSprite, même technique que drawAmbientLight) au
      // lieu de ctx.shadowBlur — un flou de canvas recalculé pour
      // chaque particule à chaque frame est très coûteux sur WebView
      // Android (cause principale des saccades constatées sur les gros
      // combos, où des dizaines de particules "glow" sont actives en
      // même temps). Rendu visuel équivalent, coût d'un simple
      // drawImage.
      if (p.glow) {
        this.drawGlow(p.x, p.y, p.size * 2.2, Theme.rgb(p.color), alpha * 0.85);
      }

      ctx.save();

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation || 0);

      if (p.shape === "diamond") {
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size, 0);
        ctx.lineTo(0, p.size);
        ctx.lineTo(-p.size, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    this.particles.length = writeIndex;
  },

  drawDebris() {
    const ctx = this.ctx;
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < this.debris.length; readIndex++) {
      const p = this.debris[readIndex];
      p.x += p.vx * this.timeScale;
      p.y += p.vy * this.timeScale;
      p.vx *= Math.pow(0.98, this.timeScale);
      p.vy += this.getCellSize() * 0.005 * this.timeScale;
      p.rotation += p.vr * this.timeScale;
      p.life -= p.decay * this.timeScale;

      if (p.life <= 0) continue;

      this.debris[writeIndex++] = p;

      ctx.save();

      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      // shadowBlur retiré ici aussi (round performance) : jusqu'à 120
      // débris peuvent être actifs à la fois juste après une ligne
      // effacée, chacun recalculant un flou de canvas coûteux à chaque
      // frame. Les débris sont de petits fragments nets, le flou
      // n'apportait qu'un supplément marginal — le gain de fluidité est
      // net et le rendu reste fidèle à l'intention (des éclats, pas des
      // lueurs).
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      const size = p.size;
      const stretch = p.stretch || 1;
      ctx.fillRect((-size / 2) * stretch, -size / 2, size * stretch, size);

      ctx.restore();
    }

    this.debris.length = writeIndex;
  },

  // Confettis/particules retirés de la grille pendant le jeu (demande
  // explicite) : spawnParticles() devient un no-op plutôt que de
  // toucher chacun de ses appelants (showPraise, celebrateEmptyGrid,
  // revive, freshBoard, startNewGameSequence, placeObstacleCell) — un
  // seul point de coupure, aucun risque d'en oublier un si un futur
  // appel est ajouté ailleurs. Effet de bord positif côté performance
  // (round diagnostic) : ce système pouvait tourner jusqu'à
  // MAX_PARTICLES (180) éléments par frame, plusieurs en mode "glow"
  // (un drawImage additionnel chacun), précisément pendant les moments
  // les plus chargés d'une partie longue (rafales d'obstacles, gros
  // praise) — ce coût disparaît avec lui. this.particles reste déclaré
  // et drawParticles() continue de tourner (sur un tableau toujours
  // vide désormais, donc gratuit) : il suffit de restaurer le corps
  // ci-dessous pour réactiver l'effet un jour.
  spawnParticles() {},

  spawnDebris(cellX, cellY, color, amount) {
    const cellSize = this.getCellSize();
    const cx = this.getCellCenterX(cellX);
    const cy = this.getCellCenterY(cellY);

    for (let i = 0; i < amount; i++) {
      if (this.debris.length >= this.MAX_DEBRIS) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = cellSize * (0.06 + Math.random() * 0.16);

      this.debris.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - cellSize * 0.04,
        size: cellSize * (0.08 + Math.random() * 0.10),
        stretch: 0.55 + Math.random() * 0.8,
        rotation: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.24,
        life: 1,
        decay: 0.016 + Math.random() * 0.02,
        color
      });
    }
  },

  spawnShockwave(x, y, maxRadius, color) {
    this.shockwaves.push({
      x,
      y,
      start: this.gameNow,
      maxRadius,
      color: color || "#ffffff"
    });
  }
});
