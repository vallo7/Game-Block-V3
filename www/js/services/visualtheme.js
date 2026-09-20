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

  Nouveau correctif (3ᵉ tentative) : le cadre du bouton "meilleur
  score" n'est plus posé en style inline sur l'élément. Il est
  maintenant piloté par une classe sur <body> ("env-meadow", "env-ice",
  ...), consommée par de simples règles CSS dans css/game.css
  (`.env-ice .best-score { background-image: url("../img/ui/...") }`).
  Deux raisons à ce changement : (1) une url() écrite en dur dans une
  feuille de style se résout sans la moindre ambiguïté, contrairement à
  une url() glissée dans une custom property (voir l'historique de ce
  bug) ; (2) une classe sur <body> est appliquée de façon déclarative
  et ne dépend d'aucun timing de requête DOM — la classe peut être
  posée n'importe quand, la règle CSS s'applique dès qu'elle existe.
  --------------------------------------------------------------------
*/
import { Storage } from "./storage.js";
import { GameAudio } from "./audio.js";
import { Haptics } from "./haptics.js";
import { Environments, getEnvironment } from "./environment.js";

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
      locked: false,
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
      // Pas encore de fond de jeu dédié : applyBackground() retombe
      // sur "bg" tant que ce thème verrouillé n'en a pas (roadmap
      // §3.4). Sans effet tant qu'il reste non sélectionnable.
      gameBg: null,
      thumb: "img/backgrounds/thumbs/theme-halloween-bg-thumb.jpg",
      environment: "meadow",
      startColor: null
    },
    {
      id: "hell",
      name: "Inferno",
      locked: true,
      bg: "img/backgrounds/theme-hell-bg.jpg",
      gameBg: null,
      thumb: "img/backgrounds/thumbs/theme-hell-bg-thumb.jpg",
      environment: "meadow",
      startColor: null
    }
  ],

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

  init() {
    const savedId = Storage.getVisualTheme();
    const theme = this.LIST.find(t => t.id === savedId && !t.locked) || this.LIST[0];

    this.current = theme;

    // Premier affichage : on peuple directement le calque A, rien
    // n'étant encore visible avant (pas besoin de fondu-enchaîné).
    const layerA = document.getElementById("appBgLayerA");
    if (layerA) {
      layerA.style.backgroundImage = `url("${theme.bg}")`;
      layerA.classList.add("is-visible");
      this.mountDecor(layerA, theme.id);
    }

    this.topLayer = "A";
    this.currentContext = "menu";
    this._lastBackgroundKey = `${theme.id}:menu`;

    this.applyEnvironmentStyles(this.getActiveEnvironment());

    this.bindUI();
  },

  getById(id) {
    return this.LIST.find(t => t.id === id) || null;
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

    // Cadre du bouton "meilleur score" : classe sur <body>, voir
    // l'en-tête de ce fichier. On retire systématiquement toutes les
    // classes "env-*" connues avant d'ajouter la bonne, pour ne
    // jamais en laisser deux actives en même temps.
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

  setDepthActive(active) {
    const appBg = document.getElementById("appBg");
    if (!appBg) return;
    appBg.classList.toggle("depth-active", Boolean(active));
  },

  select(id) {
    const theme = this.getById(id);
    if (!theme || theme.locked) return false;

    GameAudio.playClick();
    Haptics.vibrate(20);

    setTimeout(() => {
      this.apply(theme);
      Storage.setVisualTheme(theme.id);
      this.playChangeFlash();
      this.renderCarousel();
    }, 180);

    return true;
  },

  playChangeFlash() {
    const el = document.getElementById("themeChangeFlash");
    if (!el) return;

    el.classList.remove("play");
    void el.offsetWidth;
    el.classList.add("play");
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
  },

  closePage() {
    document.getElementById("themeScreen").classList.remove("active");
    const menuScreen = document.getElementById("menuScreen");
    menuScreen.classList.add("active");
    menuScreen.classList.remove("behind-sheet");
  },

  buildSlide(theme) {
    const slide = document.createElement("div");
    slide.className = "theme-slide";
    slide.dataset.themeId = theme.id;
    if (theme.locked) slide.classList.add("is-locked");

    // Le fond photo n'est plus dessiné ici (round de suivi) : il vit
    // désormais dans #themeScreenBg, un calque plein écran unique
    // derrière tout #themeScreen (voir updateScreenBg ci-dessous) — sur
    // l'ancien découpage, chaque slide ne portait son image que sur la
    // hauteur de .theme-carousel-wrap (amputée du header et des dots),
    // ce qui laissait le dégradé de secours de .theme-screen visible
    // tout autour au lieu de couvrir tout l'écran.
    if (!theme.locked) {
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

    if (theme.locked) {
      const lock = document.createElement("div");
      lock.className = "theme-slide-lock";
      lock.innerHTML =
        '<svg viewBox="0 0 24 24" class="svg-icon"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg><span>Locked</span>';
      preview.appendChild(lock);
    }

    const name = document.createElement("p");
    name.className = "theme-slide-name";
    name.textContent = theme.name;

    const btn = document.createElement("button");
    btn.className = "theme-select-btn";
    btn.dataset.themeId = theme.id;

    if (theme.locked) {
      btn.textContent = "Locked";
      btn.classList.add("is-locked");
    } else if (this.current && this.current.id === theme.id) {
      btn.textContent = "Active";
      btn.classList.add("is-active");
    } else {
      btn.textContent = "Select";
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
    }
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

    bgEl.style.backgroundImage = `url("${theme.bg}")`;
    bgEl.classList.toggle("is-locked", Boolean(theme.locked));
  },

  bindUI() {
    const themeBtn = document.getElementById("themeBtn");
    const backBtn = document.getElementById("themeBackBtn");

    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        GameAudio.unlock();
        GameAudio.playClick();
        Haptics.vibrate(15);

        setTimeout(() => {
          this.openPage();
        }, 160);
      });
    }

    if (backBtn) {
      backBtn.addEventListener("click", () => {
        GameAudio.playClick();
        Haptics.vibrate(15);

        setTimeout(() => {
          this.closePage();
        }, 140);
      });
    }
  }
};
