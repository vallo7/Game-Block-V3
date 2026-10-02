/*
  services/visualtheme.js
  --------------------------------------------------------------------
  Thèmes visuels (fond d'écran + décor animé) et point d'entrée du
  moteur d'environnements (roadmap §3) : chaque thème déclare l'id de
  son environnement ("environment"), qui pilote à son tour le style de
  bloc, l'asset de grille, le cadre du bouton "meilleur score" et les
  surcouches VFX/SFX (services/environment.js). Il n'y a pas d'écran de
  sélection d'environnement séparé : il découle uniquement du thème
  visuel actif choisi ici.

  Chaque thème porte aussi deux fonds d'écran distincts : "bg" (écran
  d'accueil) et "gameBg" (écran de jeu) — voir applyBackground(). Les
  décors animés en boucle par-dessus le fond (nuages, neige...) ont été
  retirés (round de design) ; voir buildDecorFragment() plus bas.

  Distinct de services/theme.js (couleurs cycliques grille/boutons/
  splash, indépendantes de l'environnement/des assets).

  FONDS VIDÉO (demande explicite) : un fond peut être une vidéo à la
  place de l'image, sans aucune configuration — il suffit de déposer dans
  img/backgrounds/ un .mp4 portant le MÊME NOM que l'image, extension
  .mp4 (theme-ice-bg.jpg -> theme-ice-bg.mp4 ; theme-ice-game-bg.jpg ->
  theme-ice-game-bg.mp4). Il est sondé au premier affichage
  (Loader.probeVideo) : présent -> il joue en boucle, muet, par-dessus
  l'image ; absent/illisible -> l'image reste, comme avant. L'image
  doit TOUJOURS rester dans le dépôt (affiche pendant le chargement,
  repli, miniatures). Durée max 15 s (MAX_VIDEO_SECONDS, avertissement en
  console au-delà). Un thème peut aussi nommer ses fichiers à la main avec
  les champs facultatifs `bgVideo` / `gameBgVideo` de VisualTheme.LIST.
  Une seule vidéo décodée à la fois par écran ; elle est mise en pause
  quand l'app passe en arrière-plan, qu'un tiroir opaque la recouvre, ou
  que le gouverneur de qualité (Game.setQuality) passe au niveau 2.

  Historique (3ᵉ tentative) : le cadre du bouton "meilleur score" n'est
  plus posé en style inline mais par une url() écrite en dur dans
  css/game.css (une url() glissée dans une custom property se résolvait
  mal — voir l'historique de ce bug). Depuis la demande "tous les
  environnements utilisent le même compteur de meilleur score", ce cadre
  est UNIQUE (celui de Meadow) : la classe "env-*" posée sur <body>
  ("env-meadow", "env-ice", ...) reste disponible pour toute règle CSS
  propre à un environnement, mais ne pilote plus ce bouton.
  --------------------------------------------------------------------
*/
import { Storage } from "./storage.js";
import { I18n } from "./i18n.js";
import { GameAudio } from "./audio.js";
import { Haptics } from "./haptics.js";
import { Environments, getEnvironment } from "./environment.js";
import { Economy } from "./economy.js";
import { Loader } from "./loader.js";
import { MARKETPLACE } from "../config/gameConfig.js";

const COIN_ICON_SVG =
  '<svg viewBox="0 0 24 24" class="svg-icon coin-icon"><circle cx="12" cy="12" r="9"></circle>' +
  '<path d="M12 7.5 13.2 10.4 16.5 10.7 14 12.9 14.7 16.2 12 14.4 9.3 16.2 10 12.9 7.5 10.7 10.8 10.4Z" class="coin-star"></path></svg>';

export const VisualTheme = {
  LIST: [
    {
      id: "default",
      name: "Meadow",
      locked: false,
      bg: "img/backgrounds/theme-default-bg.jpg",
      gameBg: "img/backgrounds/theme-default-game-bg.jpg",
      thumb: "img/backgrounds/thumbs/theme-default-bg-thumb.jpg",
      environment: "meadow",
      startColor: { bg: "#0a0c4d", dark: "#070836", light: "#9192af" }
    },
    {
      id: "ice",
      name: "Frozen",
      // Devient un thème à condition (roadmap §3.3, 4e passe — remplace
      // Halloween, désormais payant en Coins comme Inferno, voir UNLOCKS
      // plus bas et core/game-rules.js).
      locked: true,
      bg: "img/backgrounds/theme-ice-bg.jpg",
      gameBg: "img/backgrounds/theme-ice-game-bg.jpg",
      thumb: "img/backgrounds/thumbs/theme-ice-bg-thumb.jpg",
      environment: "ice",
      startColor: { bg: "#058afd", dark: "#0071fc", light: "#75f1fa" }
    },
    {
      id: "halloween",
      name: "Halloween",
      locked: true,
      bg: "img/backgrounds/theme-halloween-bg.jpg",
      gameBg: "img/backgrounds/theme-halloween-game-bg.jpg",
      thumb: "img/backgrounds/thumbs/theme-halloween-bg-thumb.jpg",
      environment: "meadow",
      startColor: { bg: "#6a4fd8", dark: "#4a2fb8", light: "#a68cf0" }
    },
    {
      id: "hell",
      name: "Inferno",
      locked: true,
      bg: "img/backgrounds/theme-hell-bg.jpg",
      gameBg: "img/backgrounds/theme-hell-game-bg.jpg",
      thumb: "img/backgrounds/thumbs/theme-hell-bg-thumb.jpg",
      environment: "meadow",
      startColor: { bg: "#ff6a1a", dark: "#c2380a", light: "#ffb066" }
    }
  ],

  // ---------- Déblocages de thèmes (roadmap §3.3 / Phase 4) ----------
  // Filière 1 (palier de niveau Adventure) volontairement absente ici :
  // Adventure n'existe pas encore (Phase 3 non construite), donc aucun
  // thème n'y est rattaché pour l'instant — le champ `type: "level"`
  // pourra être ajouté ici sans toucher au reste du moteur le jour où
  // Adventure existe.
  // 4e passe (demande explicite) : Ice reprend désormais la filière 2
  // (mécanique, sans dépendance à Adventure — condition vérifiée dans
  // core/game-rules.js#validate) qu'Halloween utilisait avant ; Halloween
  // rejoint Inferno sur la filière 3 (achat direct en Coins, prix dans
  // config/gameConfig.js#MARKETPLACE).
  UNLOCKS: {
    ice: {
      type: "condition"
    },
    // Prix : THEME_PRICES (config/gameConfig.js) avec repli sur
    // DEFAULT_THEME_PRICE (2500 Coins, prix standard demandé pour tous
    // les thèmes en vente) — un thème payant ajouté sans entrée dédiée
    // ne peut donc jamais se retrouver avec un prix indéfini.
    halloween: {
      type: "coins",
      price: MARKETPLACE.THEME_PRICES.halloween ?? MARKETPLACE.DEFAULT_THEME_PRICE
    },
    hell: {
      type: "coins",
      price: MARKETPLACE.THEME_PRICES.hell ?? MARKETPLACE.DEFAULT_THEME_PRICE
    }
  },

  // Libellé de déblocage traduit (5e/6e passe) : condition → clé dédiée
  // par thème ("theme.unlock.<id>", services/i18n.js) ; coins → gabarit
  // générique paramétré par le prix ("theme.unlockPrice").
  getUnlockLabel(id) {
    const info = this.UNLOCKS[id];
    if (!info) return I18n.t("common.locked");

    if (info.type === "coins") return I18n.t("theme.unlockPrice", { price: info.price });
    return I18n.t(`theme.unlock.${id}`);
  },

  // Configuration par thème des décors animés (nuages/neige/etc.).
  // Conservée telle quelle mais actuellement inutilisée :
  // buildDecorFragment() ne la consulte plus (animations en boucle
  // retirées, round de design). Gardée pour une éventuelle
  // réactivation future sans perdre le réglage par thème.
  DECOR: {
    default: [
      { type: "cloud", count: 3 },
      { type: "sparkle", count: 4 }
    ],
    ice: [
      { type: "snow", count: 9 },
      { type: "crystal", count: 3 },
      { type: "sparkle", count: 3 }
    ],
    halloween: [
      { type: "ghost", count: 2 },
      { type: "star", count: 6 }
    ],
    hell: [
      { type: "ember", count: 9 }
    ]
  },

  current: null,
  topLayer: "A",
  currentContext: "menu",
  _lastBackgroundKey: null,

  // Durée maximale d'un fond vidéo (secondes) — voir en-tête de fichier.
  MAX_VIDEO_SECONDS: 15,

  // Raisons actives de mettre les vidéos en pause : "hidden" (app en
  // arrière-plan), "quality" (appareil lent), "drawer" (tiroir opaque
  // ouvert), "themePage" (page Thèmes : ne coupe que les vidéos de
  // l'arrière-plan d'appli, la page a la sienne).
  _videoReasons: new Set(),
  _screenTheme: null,
  _screenVideoToken: 0,

  // Appelé par app.js : le bouton "Acheter" d'un thème en vente
  // demande d'ouvrir la Marketplace sur sa carte (callback posé par
  // l'application plutôt qu'un import direct, pour ne créer aucun cycle
  // d'import entre ce service et ui/marketplace.js).
  onBuyRequest: null,

  setBuyHandler(handler) {
    this.onBuyRequest = handler;
  },

  init() {
    // Correctif persistance du thème : l'ancienne condition `!t.locked`
    // testait le champ STATIQUE de LIST, toujours vrai pour Frozen /
    // Halloween / Inferno — un thème débloqué puis équipé retombait donc
    // sur Meadow à chaque relance. On teste la disponibilité réelle
    // (déblocage par condition ou achat, cf. isThemeAvailable).
    const savedId = Storage.getVisualTheme();
    const theme = this.LIST.find(t => t.id === savedId && this.isThemeAvailable(t)) || this.LIST[0];

    this.current = theme;

    // Premier affichage : on peuple directement le calque A, rien
    // n'étant encore visible avant (pas besoin de fondu-enchaîné).
    const layerA = document.getElementById("appBgLayerA");
    if (layerA) {
      layerA.style.backgroundImage = `url("${theme.bg}")`;
      layerA.classList.add("is-visible");
      this.mountDecor(layerA, theme.id);
      this.syncVideo(layerA, this.getVideoSrc(theme, "menu"), () => this._lastBackgroundKey === `${theme.id}:menu`);
    }

    this.topLayer = "A";
    this.currentContext = "menu";
    this._lastBackgroundKey = `${theme.id}:menu`;

    this.applyEnvironmentStyles(this.getActiveEnvironment());

    this.bindUI();

    I18n.onChange(() => this.renderCarousel());
  },

  getById(id) {
    return this.LIST.find(t => t.id === id) || null;
  },

  // ---------- Disponibilité d'un thème (déblocage, roadmap §3.3) ----------
  // Distinct du champ statique `locked` de LIST (qui ne change jamais) :
  // un thème verrouillé par défaut devient disponible une fois son id
  // présent dans la liste persistée (Storage.getThemeUnlocks()).
  getPurchasedThemes() {
    if (!this._unlockedIds) this._unlockedIds = new Set(Storage.getThemeUnlocks());
    return this._unlockedIds;
  },

  isThemeAvailable(theme) {
    if (!theme.locked) return true;
    return this.getPurchasedThemes().has(theme.id);
  },

  persistUnlockedThemes() {
    Storage.saveThemeUnlocks([...this.getPurchasedThemes()]);
  },

  // Filière 2 (mécanique en jeu) — appelé depuis core/game-rules.js
  // quand la condition d'un thème est remplie (ex. Perfect Clear x3).
  // Sans effet si déjà débloqué. N'ouvre PAS la Marketplace ni la page
  // Themes elle-même : purement une mise à jour d'état + petit retour
  // (son/vibration) pour signaler discrètement le déblocage pendant
  // qu'une partie est en cours.
  unlockThemeByCondition(id) {
    const purchased = this.getPurchasedThemes();
    if (purchased.has(id)) return false;

    purchased.add(id);
    this.persistUnlockedThemes();

    Haptics.vibrate([20, 40, 20, 40, 60]);
    GameAudio.playTutorialDone();

    return true;
  },

  // Filière 3 (achat direct en Coins) — appelé depuis ui/marketplace.js.
  // Retourne true/false selon que l'achat a pu être effectué.
  purchaseTheme(id) {
    const theme = this.getById(id);
    const info = this.UNLOCKS[id];

    if (!theme || !info || info.type !== "coins") return false;
    if (this.isThemeAvailable(theme)) return false;
    if (!Economy.spend(info.price, `theme:${id}`)) return false;

    const purchased = this.getPurchasedThemes();
    purchased.add(id);
    this.persistUnlockedThemes();

    return true;
  },

  // ---------- Fonds d'écran accueil / jeu ----------

  applyBackground(context) {
    const theme = this.current;
    if (!theme) return;

    const url = context === "game" ? (theme.gameBg || theme.bg) : theme.bg;
    const key = `${theme.id}:${context}`;

    if (this._lastBackgroundKey === key) return;

    const layerA = document.getElementById("appBgLayerA");
    const layerB = document.getElementById("appBgLayerB");
    if (!layerA || !layerB) return;

    const incoming = this.topLayer === "A" ? layerB : layerA;
    const outgoing = this.topLayer === "A" ? layerA : layerB;

    incoming.style.backgroundImage = `url("${url}")`;

    const oldDecor = incoming.querySelector(".bg-decor");
    if (oldDecor) oldDecor.remove();

    if (context !== "game") {
      this.mountDecor(incoming, theme.id);
    }

    incoming.classList.add("is-visible");
    outgoing.classList.remove("is-visible");

    // Fond vidéo éventuel : le calque sortant libère son décodeur tout de
    // suite (il est déjà invisible), le calque entrant sonde puis monte la
    // vidéo de son contexte (accueil ou jeu) par-dessus l'image.
    this.unmountVideo(outgoing);
    this.syncVideo(incoming, this.getVideoSrc(theme, context), () => this._lastBackgroundKey === key);

    this.topLayer = this.topLayer === "A" ? "B" : "A";
    this.currentContext = context;
    this._lastBackgroundKey = key;
  },

  // ---------- Moteur d'environnements (roadmap §3, Phase 2) ----------

  getActiveEnvironment() {
    return getEnvironment(this.current && this.current.environment);
  },

  getVfxAccent(fallback) {
    const env = this.getActiveEnvironment();
    return (env.assets.vfx && env.assets.vfx.accent) || fallback;
  },

  applyEnvironmentStyles(env) {
    const root = document.documentElement.style;
    const vfx = env.assets.vfx;

    // Classe "env-*" sur <body>, voir l'en-tête de ce fichier. Le cadre
    // du bouton "meilleur score" n'en dépend plus (même cadre pour tous
    // les environnements, cf. css/game.css), mais la classe reste posée
    // pour toute règle CSS propre à un environnement. On retire
    // systématiquement toutes les classes "env-*" connues avant
    // d'ajouter la bonne, pour ne jamais en laisser deux actives en même
    // temps.
    Object.keys(Environments).forEach(id => {
      document.body.classList.remove(`env-${id}`);
    });
    document.body.classList.add(`env-${env.id}`);

    if (vfx && vfx.accent) {
      root.setProperty("--env-accent", vfx.accent);
    } else {
      root.removeProperty("--env-accent");
    }

    if (vfx && vfx.comboGradient) {
      root.setProperty("--combo-bg", `linear-gradient(180deg, ${vfx.comboGradient[0]}, ${vfx.comboGradient[1]})`);
    } else {
      root.removeProperty("--combo-bg");
    }

    if (vfx && vfx.comboGradientMega) {
      root.setProperty("--combo-bg-mega", `linear-gradient(180deg, ${vfx.comboGradientMega[0]}, ${vfx.comboGradientMega[1]})`);
    } else {
      root.removeProperty("--combo-bg-mega");
    }

    if (vfx && vfx.comboText) {
      root.setProperty("--combo-text", vfx.comboText);
    } else {
      root.removeProperty("--combo-text");
    }
  },

  // Animations de décor en boucle (nuages/neige/cristaux/braises/
  // fantômes flottant au-dessus du fond) retirées (round de design :
  // "supprime les animations en boucle qui tournent au-dessus du
  // fond"). buildDecorFragment() est conservée (appelée par
  // mountDecor() et par buildSlide() pour le carrousel) mais renvoie
  // désormais un conteneur vide et inerte — un seul point de
  // neutralisation plutôt que de traquer chaque site d'appel.
  buildDecorFragment(themeId) {
    const host = document.createElement("div");
    host.className = "bg-decor";
    return host;
  },

  mountDecor(container, themeId) {
    const old = container.querySelector(".bg-decor");
    if (old) old.remove();
    container.appendChild(this.buildDecorFragment(themeId));
  },

  apply(theme) {
    this.current = theme;
    this.applyBackground("menu");
    this.applyEnvironmentStyles(this.getActiveEnvironment());
  },

  // ---------- Fonds vidéo ----------

  getVideoSrc(theme, context) {
    if (!theme) return null;

    const explicit = context === "game" ? theme.gameBgVideo : theme.bgVideo;
    if (explicit) return explicit;

    const image = context === "game" ? (theme.gameBg || theme.bg) : theme.bg;
    return image ? image.replace(/\.[a-z0-9]+$/i, ".mp4") : null;
  },

  // Vidéos à sonder pendant l'écran de chargement du démarrage (thème
  // actif uniquement : les autres thèmes sont sondés à leur sélection).
  getVideoAssets(theme = this.current) {
    const sources = [this.getVideoSrc(theme, "menu"), this.getVideoSrc(theme, "game")];
    return sources.filter((src, index) => src && sources.indexOf(src) === index).map(src => ({ video: src }));
  },

  mountVideo(host, src) {
    if (!host || !src) return;

    this.unmountVideo(host);

    const video = document.createElement("video");
    video.className = "bg-video";
    video.src = src;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.disablePictureInPicture = true;
    video.setAttribute("aria-hidden", "true");
    video.tabIndex = -1;

    // Aucun fondu : la vidéo s'affiche d'un coup à sa première image
    // (l'image du thème est dessous, identique à la première image).
    video.addEventListener("playing", () => video.classList.add("is-playing"), { once: true });

    video.addEventListener("loadedmetadata", () => {
      if (video.duration > this.MAX_VIDEO_SECONDS + 0.5) {
        console.warn(`[fond vidéo] ${src} dure ${video.duration.toFixed(1)} s : ${this.MAX_VIDEO_SECONDS} s maximum recommandé.`);
      }
    }, { once: true });

    video.addEventListener("error", () => this.unmountVideo(host), { once: true });

    host.appendChild(video);
    this.refreshVideoPlayback();
  },

  unmountVideo(host) {
    if (!host) return;

    const video = host.querySelector(":scope > .bg-video");
    if (!video) return;

    // Libère le décodeur matériel (pause + retrait de la source), pas
    // seulement l'élément du DOM.
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  },

  // Sonde la vidéo puis la monte si elle existe ET que le fond demandé
  // est toujours d'actualité à son arrivée (le joueur a pu changer de
  // thème/écran entre-temps).
  syncVideo(host, src, isStillWanted) {
    this.unmountVideo(host);
    if (!host || !src) return;

    Loader.probeVideo(src).then((ok) => {
      if (ok && isStillWanted()) this.mountVideo(host, src);
    });
  },

  setVideoPaused(reason, paused) {
    if (paused) this._videoReasons.add(reason);
    else this._videoReasons.delete(reason);

    this.refreshVideoPlayback();
  },

  handleVisibility(hidden) {
    this.setVideoPaused("hidden", hidden);
  },

  refreshVideoPlayback() {
    const reasons = this._videoReasons;
    const holdAll = reasons.has("hidden") || reasons.has("quality") || reasons.has("drawer");
    const holdAppBg = holdAll || reasons.has("themePage");

    const apply = (selector, hold) => {
      document.querySelectorAll(selector).forEach((video) => {
        if (hold) {
          if (!video.paused) video.pause();
        } else if (video.paused) {
          const started = video.play();
          if (started && started.catch) started.catch(() => {});
        }
      });
    };

    apply("#appBg .bg-video", holdAppBg);
    apply("#themeScreenBg .bg-video", holdAll);
  },

  select(id) {
    const theme = this.getById(id);
    if (!theme || !this.isThemeAvailable(theme)) return false;

    // Le son et le micro-délai d'appui sont gérés par ui/press.js (l'ancien
    // setTimeout de 180 ms qui laissait voir le rebond n'a plus lieu d'être).
    Haptics.vibrate(20);

    this.apply(theme);
    Storage.setVisualTheme(theme.id);
    this.playChangeFlash(theme);
    GameAudio.playThemeChange();
    Haptics.vibrate([20, 30, 20, 30, 50]);
    this.renderCarousel();

    return true;
  },

  // Halo de changement de thème (V2, "plus fun") : une gerbe composée
  // aux couleurs RÉELLES du thème choisi (startColor : clair/foncé) —
  // voile de couleur, rayons de lumière qui tournent, 3 anneaux d'onde
  // de choc décalés et une volée d'étincelles en losange/étoile — au lieu
  // du simple flash blanc d'avant. Reconstruit à chaque appel : les
  // animations CSS (css/background.css) repartent d'elles-mêmes à
  // l'insertion des éléments, aucun reflow forcé nécessaire.
  playChangeFlash(theme) {
    const el = document.getElementById("themeChangeFlash");
    if (!el) return;

    const target = theme || this.current;
    const light = (target && target.startColor && target.startColor.light) || "#ffffff";
    const dark = (target && target.startColor && target.startColor.dark) || "#5273c9";

    el.style.setProperty("--tcf-light", light);
    el.style.setProperty("--tcf-dark", dark);

    const parts = [
      '<span class="tcf-wash"></span>',
      '<span class="tcf-rays"></span>',
      '<span class="tcf-ring r1"></span>',
      '<span class="tcf-ring r2"></span>',
      '<span class="tcf-ring r3"></span>',
      '<span class="tcf-core"></span>'
    ];

    const palette = [light, "#ffffff", "#ffe27a", light];
    const sparkCount = 22;

    for (let i = 0; i < sparkCount; i++) {
      const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() - 0.5) * 0.35;
      const dist = 26 + Math.random() * 30;
      const size = 9 + Math.random() * 14;
      const delay = Math.random() * 140;
      const shape = i % 3 === 0 ? "star" : "diamond";

      parts.push(
        `<span class="tcf-spark ${shape}" style="--dx:${(Math.cos(angle) * dist).toFixed(1)}vmin;` +
        `--dy:${(Math.sin(angle) * dist).toFixed(1)}vmin;--s:${size.toFixed(1)}px;` +
        `--c:${palette[i % palette.length]};--d:${delay.toFixed(0)}ms"></span>`
      );
    }

    el.innerHTML = parts.join("");
    el.classList.add("is-on");

    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      el.classList.remove("is-on");
      el.innerHTML = "";
    }, 1500);
  },

  // Ouverture/fermeture de la page Themes (round de design : transition
  // dédiée en tiroir/bottom-sheet, voir css/theme-page.css). Le menu
  // perd "active" (comme avant, pour l'accessibilité/pointer-events)
  // mais reçoit "behind-sheet" qui fige son transform à "none" : il
  // reste visible et parfaitement immobile sous le tiroir qui glisse,
  // au lieu de jouer en même temps sa propre animation de sortie
  // (scale + translateY) prévue pour les transitions menu ↔ jeu.
  openPage() {
    this.renderCarousel();
    const menuScreen = document.getElementById("menuScreen");
    menuScreen.classList.add("behind-sheet");
    menuScreen.classList.remove("active");
    document.getElementById("themeScreen").classList.add("active");

    // La page a son propre fond (vidéo éventuelle du thème affiché) : la
    // vidéo de l'accueil, recouverte, est mise en pause.
    this.setVideoPaused("themePage", true);
    this.updateScreenBg(this._screenTheme);
  },

  closePage() {
    document.getElementById("themeScreen").classList.remove("active");
    const menuScreen = document.getElementById("menuScreen");
    menuScreen.classList.add("active");
    menuScreen.classList.remove("behind-sheet");

    this._screenVideoToken += 1;
    this.unmountVideo(document.getElementById("themeScreenBg"));
    this.setVideoPaused("themePage", false);
  },

  buildSlide(theme) {
    const available = this.isThemeAvailable(theme);

    const slide = document.createElement("div");
    slide.className = "theme-slide";
    slide.dataset.themeId = theme.id;
    if (!available) slide.classList.add("is-locked");

    // Teinte réelle du thème (6e passe, redesign) : theme.startColor
    // existe déjà pour piloter la couleur de la grille en jeu — réutilisée
    // ici pour le halo de la preview, la pastille active des dots et le
    // bouton Select, en variables CSS posées sur la diapositive elle-même
    // (lues par css/theme-page.css, aucune donnée inventée).
    slide.style.setProperty("--slide-accent-light", theme.startColor.light);
    slide.style.setProperty("--slide-accent-dark", theme.startColor.dark);

    // Le fond photo n'est plus dessiné ici (round de suivi) : il vit
    // désormais dans #themeScreenBg, un calque plein écran unique
    // derrière tout #themeScreen (voir updateScreenBg ci-dessous) — sur
    // l'ancien découpage, chaque slide ne portait son image que sur la
    // hauteur de .theme-carousel-wrap (amputée du header et des dots),
    // ce qui laissait le dégradé de secours de .theme-screen visible
    // tout autour au lieu de couvrir tout l'écran.
    if (available) {
      slide.appendChild(this.buildDecorFragment(theme.id));
    }

    const scrim = document.createElement("div");
    scrim.className = "theme-slide-scrim";
    slide.appendChild(scrim);

    const card = document.createElement("div");
    card.className = "theme-slide-card";

    const preview = document.createElement("div");
    preview.className = "theme-slide-preview";

    const ratio = document.createElement("div");
    ratio.className = "theme-slide-preview-ratio";
    preview.appendChild(ratio);

    const img = document.createElement("div");
    img.className = "theme-slide-preview-img";
    img.style.backgroundImage = `url("${theme.thumb}")`;
    preview.appendChild(img);

    const shine = document.createElement("div");
    shine.className = "theme-slide-shine";
    preview.appendChild(shine);

    // Phase 4 (déblocages de thèmes) : la carte verrouillée affiche la
    // vraie condition de déblocage au lieu d'un simple "Locked" —
    // l'achat lui-même se fait dans la Marketplace (ui/marketplace.js),
    // cette page reste purement informative pour ne pas dupliquer la
    // logique de transaction à deux endroits.
    if (!available) {
      const label = this.getUnlockLabel(theme.id);

      const lock = document.createElement("div");
      lock.className = "theme-slide-lock";
      lock.innerHTML =
        '<svg viewBox="0 0 24 24" class="svg-icon"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>' +
        '<span class="theme-slide-lock-chip">' + label + '</span>';
      preview.appendChild(lock);
    }

    const name = document.createElement("p");
    name.className = "theme-slide-name";
    name.textContent = I18n.t(`theme.${theme.id}.name`);

    const btn = document.createElement("button");
    btn.className = "theme-select-btn";
    btn.dataset.themeId = theme.id;

    const unlockInfo = this.UNLOCKS[theme.id];

    if (!available && unlockInfo && unlockInfo.type === "coins") {
      // Thème en vente : bouton "Acheter" qui renvoie vers la carte du
      // thème dans la Marketplace (demande explicite). L'achat lui-même
      // reste dans la boutique (confirmation, solde, trophée de
      // collection) pour ne dupliquer la transaction à aucun endroit.
      btn.classList.add("is-buy");
      btn.innerHTML = `${COIN_ICON_SVG}<span>${I18n.t("common.buy")} · ${Number(unlockInfo.price).toLocaleString()}</span>`;
      btn.addEventListener("click", () => {
        if (this.onBuyRequest) this.onBuyRequest(theme.id);
      });
    } else if (!available) {
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" class="svg-icon"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>' +
        `<span>${this.getUnlockLabel(theme.id)}</span>`;
      btn.classList.add("is-locked");
    } else if (this.current && this.current.id === theme.id) {
      btn.innerHTML = `<svg viewBox="0 0 24 24" class="svg-icon"><path d="m5 13 4 4L19 7"></path></svg><span>${I18n.t("common.active")}</span>`;
      btn.classList.add("is-active");
    } else {
      btn.innerHTML = `<svg viewBox="0 0 24 24" class="svg-icon" fill="currentColor" stroke="none"><path d="M8 5v14l11-7Z"></path></svg><span>${I18n.t("common.select")}</span>`;
      btn.addEventListener("click", () => {
        this.select(theme.id);
      });
    }

    card.appendChild(preview);
    card.appendChild(name);
    card.appendChild(btn);
    slide.appendChild(card);

    return slide;
  },

  renderCarousel() {
    const carousel = document.getElementById("themeCarousel");
    const dotsHost = document.getElementById("themeDots");
    if (!carousel || !dotsHost) return;

    const prevScroll = carousel.scrollLeft;

    carousel.innerHTML = "";
    dotsHost.innerHTML = "";

    this.LIST.forEach((theme, index) => {
      carousel.appendChild(this.buildSlide(theme));

      const dot = document.createElement("span");
      dot.className = "theme-dot";
      if (index === 0) dot.classList.add("is-active");
      dotsHost.appendChild(dot);
    });

    carousel.scrollLeft = prevScroll;

    if (!this.carouselBound) {
      carousel.addEventListener("scroll", () => this.updateCarouselState());
      this.carouselBound = true;
    }

    // Force la prochaine updateCarouselState() à (ré)écrire le fond
    // plein écran, même si l'index détecté est identique à celui d'un
    // rendu précédent (ex. réouverture de la page sur le même thème).
    this._lastBgIndex = -1;

    this.updateCarouselState();
  },

  updateCarouselState() {
    const carousel = document.getElementById("themeCarousel");
    const dotsHost = document.getElementById("themeDots");
    if (!carousel || !dotsHost || carousel.clientWidth === 0) return;

    const index = Math.round(carousel.scrollLeft / carousel.clientWidth);
    const dots = dotsHost.querySelectorAll(".theme-dot");
    const slides = carousel.querySelectorAll(".theme-slide");

    dots.forEach((dot, i) => dot.classList.toggle("is-active", i === index));
    slides.forEach((slide, i) => slide.classList.toggle("is-current", i === index));

    // Fond plein écran (round de suivi) : ne réécrit le style que si
    // l'index affiché a réellement changé, pour ne pas répéter la même
    // écriture DOM à chaque event "scroll" (plusieurs par frame pendant
    // un swipe).
    if (index !== this._lastBgIndex) {
      this._lastBgIndex = index;
      this.updateScreenBg(this.LIST[index]);
      this.playSlideEnter(slides[index]);
    }
  },

  // Entrée "pop" de la carte de la diapositive qui devient courante (6e
  // passe, redesign) — remove/reflow/add, même technique que partout
  // ailleurs dans le projet (App.celebrateEl, .market-pop, .trophy-card).
  playSlideEnter(slide) {
    if (!slide) return;
    const card = slide.querySelector(".theme-slide-card");
    if (!card) return;

    card.classList.remove("enter");
    void card.offsetWidth;
    card.classList.add("enter");
  },

  // Fond plein écran de la page Themes (round de suivi) : un calque
  // unique derrière tout #themeScreen (voir index.html, #themeScreenBg),
  // mis à jour au fil du swipe par updateCarouselState() ci-dessus —
  // remplace l'ancien fond par-slide qui ne couvrait que la hauteur du
  // carrousel. Le flou/assombrissement d'un thème verrouillé (déjà
  // existant sur l'ancien .theme-slide-bg) vit maintenant ici.
  updateScreenBg(theme) {
    const bgEl = document.getElementById("themeScreenBg");
    if (!bgEl || !theme) return;

    const locked = !this.isThemeAvailable(theme);

    this._screenTheme = theme;
    bgEl.style.backgroundImage = `url("${theme.bg}")`;
    bgEl.classList.toggle("is-locked", locked);

    // Fond vidéo : seulement quand la page est ouverte, et jamais sur un
    // thème verrouillé (son fond est flouté/assombri, une vidéo floutée en
    // plein écran coûterait cher pour rien).
    const token = (this._screenVideoToken += 1);
    const themeScreen = document.getElementById("themeScreen");
    const open = Boolean(themeScreen && themeScreen.classList.contains("active"));

    this.unmountVideo(bgEl);
    if (!open || locked) return;

    const src = this.getVideoSrc(theme, "menu");
    if (!src) return;

    Loader.probeVideo(src).then((ok) => {
      if (ok && token === this._screenVideoToken && themeScreen.classList.contains("active")) {
        this.mountVideo(bgEl, src);
      }
    });
  },

  bindUI() {
    const themeBtn = document.getElementById("themeBtn");
    const backBtn = document.getElementById("themeBackBtn");

    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        Haptics.vibrate(15);
        this.openPage();
      });
    }

    if (backBtn) {
      backBtn.addEventListener("click", () => {
        Haptics.vibrate(15);
        this.closePage();
      });
    }
  }
};
