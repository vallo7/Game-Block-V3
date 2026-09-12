/*
  services/theme.js
  --------------------------------------------------------------------
  Couleurs cycliques de la grille, des boutons et du splash (palette
  bank + interpolation entre 2 couleurs). Distinct des thèmes visuels
  (fond d'écran / assets), gérés par services/visualtheme.js.
  Aucune logique changée par rapport à l'original.
  --------------------------------------------------------------------
*/
export const Theme = {
  bank: [
    { bg: "#EC7E7E", dark: "#CC5E5E", light: "#F49F9F" },
    { bg: "#ED975B", dark: "#CB7D40", light: "#F4B186" },
    { bg: "#E9B856", dark: "#C7993F", light: "#F1CC83" },
    { bg: "#4FC5AB", dark: "#37A78E", light: "#81D6BF" },
    { bg: "#5CBBE5", dark: "#419DC3", light: "#8CCFEE" },
    { bg: "#6D8DE6", dark: "#5273C9", light: "#99B0F2" },
    { bg: "#967AE8", dark: "#7A5CC9", light: "#B7A0F2" },
    { bg: "#E080C4", dark: "#BF62A7", light: "#EAA8D7" },
    { bg: "#E67191", dark: "#C55474", light: "#F198AF" },
    { bg: "#58BAAD", dark: "#3C9F92", light: "#87D0C6" }
  ],
  menuIndex: 0,
  gameIndex: 0,
  current: {
    bg: "#6D8DE6",
    dark: "#5273C9",
    light: "#99B0F2"
  },
  gridOverride: null,
  animFrame: null,
  init() {
    this.menuIndex = Math.floor(Math.random() * this.bank.length);
    this.gameIndex = this.menuIndex;
    this.cancelAnim();
    this.setCurrentFromBank(this.menuIndex);
  },
  setCurrentFromBank(index) {
    const color = this.bank[index];
    this.current = {
      bg: color.bg,
      dark: color.dark,
      light: color.light
    };
    this.pushCSS();
  },
  pushCSS() {
    const root = document.documentElement;
    root.style.setProperty("--theme-bg", this.current.bg);
    root.style.setProperty("--theme-dark", this.current.dark);
    root.style.setProperty("--theme-light", this.current.light);
    root.style.setProperty("--theme-dark-rgb", this.rgb(this.current.dark));
    if (!this.gridOverride) {
      this.pushGridVars(this.current);
    }
  },
  getGridBackdrop(color) {
    return color.dark;
  },
  pushGridVars(color) {
    const root = document.documentElement;
    root.style.setProperty("--grid-dark", color.dark);
    root.style.setProperty("--grid-light", color.light);
    root.style.setProperty("--grid-backdrop", color.dark);
  },
  useMenuColor() {
    this.gameIndex = this.menuIndex;
    this.cancelAnim();
    this.setCurrentFromBank(this.menuIndex);
  },
  setGridOverride(color) {
    this.gridOverride = { dark: color.dark, light: color.light };
    this.pushGridVars(this.gridOverride);
  },
  clearGridOverride() {
    this.gridOverride = null;
    this.pushGridVars(this.current);
  },
  getGridColor() {
    return this.gridOverride || this.current;
  },
  shift(duration) {
    this.clearGridOverride();
    let next = Math.floor(Math.random() * this.bank.length);
    if (next === this.gameIndex) {
      next = (next + 1) % this.bank.length;
    }
    this.gameIndex = next;
    if (duration) {
      this.animateTo(next, duration);
    } else {
      this.cancelAnim();
      this.setCurrentFromBank(next);
    }
  },
  animateTo(index, duration) {
    this.cancelAnim();
    const target = this.bank[index];
    const from = {
      bg: this.hexToRgb(this.current.bg),
      dark: this.hexToRgb(this.current.dark),
      light: this.hexToRgb(this.current.light)
    };
    const to = {
      bg: this.hexToRgb(target.bg),
      dark: this.hexToRgb(target.dark),
      light: this.hexToRgb(target.light)
    };
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = t * t * (3 - 2 * t);
      this.current = {
        bg: this.mix(from.bg, to.bg, e),
        dark: this.mix(from.dark, to.dark, e),
        light: this.mix(from.light, to.light, e)
      };
      this.pushCSS();
      if (t < 1) {
        this.animFrame = requestAnimationFrame(step);
      } else {
        this.animFrame = null;
      }
    };
    this.animFrame = requestAnimationFrame(step);
  },
  cancelAnim() {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  },
  mix(a, b, t) {
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return this.rgbToHex(r, g, bl);
  },
  hexToRgb(hex) {
    const value = hex.replace("#", "");
    return [
      parseInt(value.substring(0, 2), 16),
      parseInt(value.substring(2, 4), 16),
      parseInt(value.substring(4, 6), 16)
    ];
  },
  rgbToHex(r, g, b) {
    const to = (v) => v.toString(16).padStart(2, "0");
    return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
  },
  rgb(hex) {
    return this.hexToRgb(hex).join(",");
  }
};
