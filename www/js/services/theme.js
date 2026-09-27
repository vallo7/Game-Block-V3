/*
  services/theme.js
  --------------------------------------------------------------------
  Couleurs cycliques de la grille, des boutons et du splash (palette
  bank), utilisées pour la variété visuelle de session (menu/splash) et
  pour la teinte de la grille au repos (gridOverride). Distinct des
  environnements (services/environment.js), qui pilotent désormais les
  assets de grille/blocs/VFX par thème visuel.

  Phase 2 : le mécanisme de changement aléatoire de couleur en cours de
  partie (shift/animateTo, déclenché sur grille vidée) a été retiré à
  la demande explicite de la roadmap — la grille garde sa couleur
  pendant toute la partie. Les animations de la célébration associée
  (secousse, halo, particules) restent inchangées dans
  core/game-rules.js, seule la teinte ne change plus.
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
  cancelAnim() {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  },
  hexToRgb(hex) {
    const value = hex.replace("#", "");
    return [
      parseInt(value.substring(0, 2), 16),
      parseInt(value.substring(2, 4), 16),
      parseInt(value.substring(4, 6), 16)
    ];
  },
  rgb(hex) {
    return this.hexToRgb(hex).join(",");
  }
};
