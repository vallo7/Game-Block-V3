/*
  services/visualtheme.js
  --------------------------------------------------------------------
  Thèmes visuels (fond d'écran + décor animé + variantes d'assets
  obstacle/overlay). Distinct de services/theme.js (couleurs cycliques
  grille/boutons/splash). Portage à l'identique de l'ancien
  js/visualtheme.js.

  Ce fichier est le point d'entrée du futur "moteur d'environnements"
  (roadmap §3) : LIST/DECOR sont amenés à s'enrichir (blocs, VFX, SFX
  par thème) sans que ce module doive changer de responsabilité.
  --------------------------------------------------------------------
*/
import { Storage } from "./storage.js";
import { GameAudio } from "./audio.js";
import { Haptics } from "./haptics.js";

export const VisualTheme = {
  LIST: [
    {
      id: "default",
      name: "Meadow",
      locked: false,
      bg: "img/backgrounds/theme-default-bg.jpg",
      thumb: "img/backgrounds/thumbs/theme-default-bg-thumb.jpg",
      obstacle: "stone",
      defeatOverlay: "stone",
      startColor: { bg: "#0a0c4d", dark: "#070836", light: "#9192af" }
    },
    {
      id: "ice",
      name: "Frozen",
      locked: false,
      bg: "img/backgrounds/theme-ice-bg.jpg",
      thumb: "img/backgrounds/thumbs/theme-ice-bg-thumb.jpg",
      obstacle: "ice",
      defeatOverlay: "ice",
      startColor: { bg: "#058afd", dark: "#0071fc", light: "#75f1fa" }
    },
    {
      id: "halloween",
      name: "Halloween",
      locked: true,
      bg: "img/backgrounds/theme-halloween-bg.jpg",
      thumb: "img/backgrounds/thumbs/theme-halloween-bg-thumb.jpg",
      obstacle: "stone",
      defeatOverlay: "ice",
      startColor: null
    },
    {
      id: "hell",
      name: "Inferno",
      locked: true,
      bg: "img/backgrounds/theme-hell-bg.jpg",
      thumb: "img/backgrounds/thumbs/theme-hell-bg-thumb.jpg",
      obstacle: "stone",
      defeatOverlay: "ice",
      startColor: null
    }
  ],

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

  init() {
    const savedId = Storage.getVisualTheme();
    const theme = this.LIST.find(t => t.id === savedId && !t.locked) || this.LIST[0];

    this.current = theme;

    const layerA = document.getElementById("appBgLayerA");
    if (layerA) {
      layerA.style.backgroundImage = `url("${theme.bg}")`;
      layerA.classList.add("is-visible");
      this.mountDecor(layerA, theme.id);
    }

    this.bindUI();
  },

  getById(id) {
    return this.LIST.find(t => t.id === id) || null;
  },

  buildDecorFragment(themeId) {
    const groups = this.DECOR[themeId] || [];
    const host = document.createElement("div");
    host.className = "bg-decor";

    groups.forEach((group) => {
      for (let i = 0; i < group.count; i++) {
        const el = document.createElement("span");
        el.className = `decor decor-${group.type}`;

        const left = Math.round(Math.random() * 90 + 2);
        const delay = (Math.random() * 6).toFixed(2);
        let duration = 4 + Math.random() * 3;
        let top = Math.round(Math.random() * 70 + 5);

        if (group.type === "cloud") {
          duration = 20 + Math.random() * 12;
          top = Math.round(Math.random() * 45 + 5);
        } else if (group.type === "snow") {
          duration = 7 + Math.random() * 6;
        } else if (group.type === "ember") {
          duration = 5 + Math.random() * 4;
          top = Math.round(Math.random() * 30 + 60);
        } else if (group.type === "ghost") {
          duration = 5 + Math.random() * 2.5;
          top = Math.round(Math.random() * 45 + 10);
        } else if (group.type === "crystal") {
          duration = 4.5 + Math.random() * 2.5;
          top = Math.round(Math.random() * 55 + 15);
        }

        const drift = Math.round((Math.random() - 0.5) * 30);

        el.style.left = `${left}%`;
        el.style.top = `${top}%`;
        el.style.animationDuration = `${duration.toFixed(2)}s`;
        el.style.animationDelay = `${delay}s`;
        el.style.setProperty("--drift", `${drift}px`);

        host.appendChild(el);
      }
    });

    return host;
  },

  mountDecor(container, themeId) {
    const old = container.querySelector(".bg-decor");
    if (old) old.remove();
    container.appendChild(this.buildDecorFragment(themeId));
  },

  apply(theme) {
    this.current = theme;

    const layerA = document.getElementById("appBgLayerA");
    const layerB = document.getElementById("appBgLayerB");
    if (!layerA || !layerB) return;

    const incoming = this.topLayer === "A" ? layerB : layerA;
    const outgoing = this.topLayer === "A" ? layerA : layerB;

    incoming.style.backgroundImage = `url("${theme.bg}")`;
    this.mountDecor(incoming, theme.id);
    incoming.classList.add("is-visible");
    outgoing.classList.remove("is-visible");

    this.topLayer = this.topLayer === "A" ? "B" : "A";
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

  openPage() {
    this.renderCarousel();
    document.getElementById("menuScreen").classList.remove("active");
    document.getElementById("themeScreen").classList.add("active");
  },

  closePage() {
    document.getElementById("themeScreen").classList.remove("active");
    document.getElementById("menuScreen").classList.add("active");
  },

  buildSlide(theme) {
    const slide = document.createElement("div");
    slide.className = "theme-slide";
    slide.dataset.themeId = theme.id;
    if (theme.locked) slide.classList.add("is-locked");

    const bg = document.createElement("div");
    bg.className = "theme-slide-bg";
    bg.style.backgroundImage = `url("${theme.bg}")`;
    slide.appendChild(bg);

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
