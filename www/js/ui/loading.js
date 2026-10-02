/*
  ui/loading.js
  --------------------------------------------------------------------
  Écran de chargement réutilisé à trois moments : démarrage de l'app
  (remplace l'ancien splash purement minuté), entrée en partie
  (App.goToGame) et retour au menu (App.goToMenu). Sa fermeture est
  toujours liée à une vraie promesse de chargement
  (services/loader.js) — jamais un simple minuteur déconnecté de
  l'état réel des assets — avec une durée plancher (minDuration, ≥2s
  partout où l'appelant la définit : round de design) pour éviter un
  flash quand tout est déjà en cache, et un plafond (timeout) pour ne
  jamais bloquer le joueur indéfiniment si un asset est manquant ou
  trop lent.

  8e passe (demande explicite) :
  - setProgress() pilote désormais une barre de chargement CLASSIQUE
    (piste + remplissage arc-en-ciel animé + étincelle de pointe +
    pourcentage, css/loading.css) à la place des 8 mini-blocs. Un petit
    "bump" élastique de la piste et de l'étincelle est rejoué à chaque
    palier de 10% franchi.
  - l'écran ne se découpe plus en cercle : show() le fait GLISSER du haut
    vers le bas (classe .entering) et hide() le fait remonter par le haut
    (classe .leaving), avec un rebond "bulle" dans les deux cas — tout
    est décrit en CSS, ce module ne fait que poser/retirer les classes au
    bon moment. ENTER_DURATION_MS / EXIT_DURATION_MS doivent rester
    alignées sur les durées des keyframes loadingScreenEnter /
    loadingScreenExit de css/loading.css.

  Robustesse : show()/hide() peuvent être enchaînés rapidement (ex. retour
  au menu juste après une entrée en partie) sans jamais laisser l'écran
  dans un état incohérent — chaque appel annule le minuteur de fin
  d'animation laissé par le précédent avant d'en armer un nouveau.

  onBeforeReveal (round de design) : la bascule d'écran (ex.
  App.showGame()) est passée à run() plutôt qu'appelée par le code
  appelant APRÈS que la promesse se résolve. Sans ça, la bascule
  arrivait au même tick JS que le début de l'animation de retrait du
  rideau : l'écran de destination changeait de contenu PENDANT que le
  rideau se retirait, au lieu d'être déjà entièrement en place derrière
  un rideau encore opaque. onBeforeReveal s'exécute alors que le rideau
  est encore 100% opaque, puis REVEAL_SETTLE_MS laisse le temps à la
  transition propre de l'écran (transform 320ms, cf. base.css) de se
  terminer intégralement AVANT que hide() ne commence à remonter le
  rideau — la page précédente a donc complètement disparu et la page de
  destination est complètement en place au moment où le rideau se lève.
  --------------------------------------------------------------------
*/
import { Loader } from "../services/loader.js";

const REVEAL_SETTLE_MS = 340;

// Doivent rester égales aux durées des animations CSS (css/loading.css).
const ENTER_DURATION_MS = 640;
const EXIT_DURATION_MS = 520;

// Le "bump" décoratif se rejoue tous les 10% de progression.
const BUMP_STEP_PERCENT = 10;

export const LoadingScreen = {
  el: null,
  trackEl: null,
  fillEl: null,
  sparkEl: null,
  percentEl: null,

  _enterTimer: null,
  _exitTimer: null,
  _lastStep: -1,
  _lastPercent: -1,

  init() {
    this.el = document.getElementById("loadingScreen");
    this.trackEl = document.getElementById("loadingBarTrack");
    this.fillEl = document.getElementById("loadingBarFill");
    this.sparkEl = document.getElementById("loadingBarSpark");
    this.percentEl = document.getElementById("loadingBarPercent");
  },

  isVisible() {
    return Boolean(this.el && !this.el.classList.contains("hidden"));
  },

  // Rejoue une animation CSS sur un élément (remove/reflow/add, même
  // technique que partout ailleurs dans le projet).
  replay(el, className) {
    if (!el) return;

    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  },

  setProgress(ratio) {
    const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
    const percent = Math.round(clamped * 100);

    // Remplissage : clip-path arrondi (voir css/loading.css) — la pointe
    // reste un demi-cercle net à tout pourcentage.
    if (this.fillEl) {
      this.fillEl.style.clipPath = `inset(0 ${100 - clamped * 100}% 0 0 round 11px)`;
    }

    // Étincelle : suit la pointe du remplissage (3px de marge interne de
    // chaque côté de la piste, d'où le calc) ; invisible à 0%.
    if (this.sparkEl) {
      this.sparkEl.style.left = `calc(3px + (100% - 6px) * ${clamped})`;
      this.sparkEl.classList.toggle("visible", clamped > 0);
    }

    if (percent !== this._lastPercent) {
      this._lastPercent = percent;
      if (this.percentEl) this.percentEl.textContent = `${percent}%`;
    }

    // Petit rebond décoratif à chaque palier de 10% franchi (jamais à 0%).
    const step = Math.floor(percent / BUMP_STEP_PERCENT);
    if (step !== this._lastStep) {
      const isFirstReport = this._lastStep < 0;
      this._lastStep = step;

      if (!isFirstReport && step > 0) {
        this.replay(this.trackEl, "bump");
        this.replay(this.sparkEl, "pop");
      }
    }
  },

  resetProgress() {
    this._lastStep = -1;
    this._lastPercent = -1;
    this.setProgress(0);
  },

  clearTimers() {
    if (this._enterTimer) {
      clearTimeout(this._enterTimer);
      this._enterTimer = null;
    }

    if (this._exitTimer) {
      clearTimeout(this._exitTimer);
      this._exitTimer = null;
    }
  },

  show() {
    if (!this.el) return;

    this.clearTimers();

    // "Masqué" inclut une sortie encore en cours (.leaving) : un show()
    // enchaîné juste après un hide() doit lui aussi rejouer la glissade
    // d'entrée plutôt que de laisser l'écran figé à mi-course.
    const wasHidden = this.el.classList.contains("hidden") || this.el.classList.contains("leaving");

    this.el.classList.remove("hidden", "leaving");

    // Au tout premier affichage (démarrage de l'app), l'écran est déjà
    // visible avant même l'exécution du JS (voir css/loading.css) : lui
    // rejouer une glissade depuis le haut le ferait "sauter" hors de la
    // fenêtre puis retomber. La glissade + le rejeu du contenu (logo,
    // barre) ne concernent donc que les affichages suivants (entrée en
    // partie / retour au menu).
    if (wasHidden) {
      this.el.classList.remove("entering");
      void this.el.offsetWidth;
      this.el.classList.add("entering");

      this._enterTimer = setTimeout(() => {
        this._enterTimer = null;
        this.el.classList.remove("entering");
      }, ENTER_DURATION_MS);

      const content = this.el.querySelector(".loading-content");
      if (content) {
        content.classList.remove("replay");
        void content.offsetWidth;
        content.classList.add("replay");
      }
    }

    this.resetProgress();
  },

  hide() {
    if (!this.el) return;

    this.clearTimers();

    this.el.classList.remove("entering");
    this.replay(this.el, "leaving");

    this._exitTimer = setTimeout(() => {
      this._exitTimer = null;
      this.el.classList.add("hidden");
      this.el.classList.remove("leaving");
    }, EXIT_DURATION_MS);
  },

  async run(items, options = {}) {
    const { minDuration = 0, timeout = 8000, onBeforeReveal = null } = options;

    this.show();

    const start = performance.now();

    const loadPromise = Loader.preload(items, (ratio) => this.setProgress(ratio));
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, timeout));

    await Promise.race([loadPromise, timeoutPromise]);
    this.setProgress(1);

    const elapsed = performance.now() - start;
    if (elapsed < minDuration) {
      await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
    }

    // Bascule de contenu pendant que le rideau est encore 100% opaque
    // (voir en-tête de fichier), puis on laisse sa propre transition
    // se stabiliser avant de commencer à remonter le rideau.
    if (onBeforeReveal) {
      onBeforeReveal();
      await new Promise((resolve) => setTimeout(resolve, REVEAL_SETTLE_MS));
    }

    this.hide();
  }
};
