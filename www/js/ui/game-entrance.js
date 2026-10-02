/*
  ui/game-entrance.js
  --------------------------------------------------------------------
  Animation d'entrée individuelle pour chaque élément visible de
  l'écran de jeu (bouton pause, meilleur score, score, grille, pile de
  cases restantes), rejouée à chaque arrivée sur l'écran de jeu
  (App.goToGame()) — jamais lors d'un simple restart en place, qui a sa
  propre séquence animée (core/game-flow.js#startNewGameSequence).
  Chaque élément a sa propre classe/timing CSS (css/game.css) : ce
  module se contente de les (re)déclencher via le classique
  remove/reflow/add déjà utilisé ailleurs dans le projet (ex.
  App.celebrateEl).

  Round fluidité : la classe d'entrée est RETIRÉE une fois son animation
  terminée. Elle restait avant posée à vie, et son `fill-mode: both`
  maintenait indéfiniment la dernière image de l'animation (un
  `transform`) sur l'élément — ce qui bloquait tout autre mouvement de
  cet élément (core/game-motion.js) et gardait pour rien une animation
  "active" sur six éléments pendant toute la partie.
  --------------------------------------------------------------------
*/
export const GameEntranceFX = {
  TARGETS: [
    { selector: "#settingsBtn", cls: "enter-pause" },
    { selector: "#gameCoinCounterBtn", cls: "enter-pause" },
    { selector: ".best-score", cls: "enter-best-score" },
    { selector: "#currentScore", cls: "enter-score" },
    { selector: ".board-shell", cls: "enter-grid" },
    { selector: "#availablePill", cls: "enter-blocks" }
  ],

  // élément -> écouteur de fin d'animation en cours (un seul à la fois).
  _handlers: new WeakMap(),

  play() {
    this.TARGETS.forEach(({ selector, cls }) => {
      const el = document.querySelector(selector);
      if (!el) return;

      const previous = this._handlers.get(el);
      if (previous) el.removeEventListener("animationend", previous);

      // Les animations des enfants (ex. l'onde de halo de la grille)
      // remontent jusqu'ici : on ne réagit qu'à l'animation d'entrée de
      // l'élément lui-même.
      const done = (event) => {
        if (event.target !== el || !/^enter/.test(event.animationName)) return;

        el.classList.remove(cls);
        el.removeEventListener("animationend", done);
        this._handlers.delete(el);
      };

      this._handlers.set(el, done);
      el.addEventListener("animationend", done);

      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    });
  }
};
