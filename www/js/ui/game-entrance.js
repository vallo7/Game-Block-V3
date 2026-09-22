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
  --------------------------------------------------------------------
*/
export const GameEntranceFX = {
  TARGETS: [
    { selector: "#settingsBtn", cls: "enter-pause" },
    { selector: ".best-score", cls: "enter-best-score" },
    { selector: "#currentScore", cls: "enter-score" },
    { selector: ".board-shell", cls: "enter-grid" },
    { selector: "#availablePill", cls: "enter-blocks" }
  ],

  play() {
    this.TARGETS.forEach(({ selector, cls }) => {
      const el = document.querySelector(selector);
      if (!el) return;

      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    });
  }
};
