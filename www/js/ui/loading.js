/*
  ui/loading.js
  --------------------------------------------------------------------
  Écran de chargement réutilisé à trois moments : démarrage de l'app
  (remplace l'ancien splash purement minuté), entrée en partie
  (App.goToGame) et retour au menu (App.goToMenu). Sa fermeture est
  toujours liée à une vraie promesse de chargement
  (services/loader.js) — jamais un simple minuteur déconnecté de
  l'état réel des assets — avec une durée plancher (minDuration) pour
  éviter un flash quand tout est déjà en cache, et un plafond
  (timeout) pour ne jamais bloquer le joueur indéfiniment si un asset
  est manquant ou trop lent.
  --------------------------------------------------------------------
*/
import { Loader } from "../services/loader.js";

export const LoadingScreen = {
  el: null,
  fillEl: null,

  init() {
    this.el = document.getElementById("loadingScreen");
    this.fillEl = document.getElementById("loadingProgressFill");
  },

  isVisible() {
    return Boolean(this.el && !this.el.classList.contains("hidden"));
  },

  setProgress(ratio) {
    if (!this.fillEl) return;
    const pct = Math.max(0, Math.min(1, ratio)) * 100;
    this.fillEl.style.width = `${pct}%`;
  },

  show() {
    if (!this.el) return;

    const wasHidden = this.el.classList.contains("hidden");
    this.el.classList.remove("hidden");

    // Ne rejoue l'animation d'entrée du contenu (logo, loader, barre)
    // que si l'écran était effectivement masqué juste avant (entrée en
    // partie / retour au menu). Au tout premier affichage (démarrage
    // de l'app), elle est déjà en train de jouer nativement depuis le
    // chargement de la page — pas besoin de la redéclencher.
    if (wasHidden) {
      const content = this.el.querySelector(".loading-content");
      if (content) {
        content.classList.remove("replay");
        void content.offsetWidth;
        content.classList.add("replay");
      }
    }
  },

  hide() {
    if (!this.el) return;
    this.el.classList.add("hidden");
  },

  async run(items, options = {}) {
    const { minDuration = 0, timeout = 8000 } = options;

    this.show();
    this.setProgress(0);

    const start = performance.now();

    const loadPromise = Loader.preload(items, (ratio) => this.setProgress(ratio));
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, timeout));

    await Promise.race([loadPromise, timeoutPromise]);
    this.setProgress(1);

    const elapsed = performance.now() - start;
    if (elapsed < minDuration) {
      await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
    }

    this.hide();
  }
};
